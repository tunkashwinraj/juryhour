// Checkout pricing (SPEC §1, §8; pricing simplification 2026-10). Pure: no I/O, no clock unless `now` is omitted.
import {
  BUYABLE_TIERS,
  EXTRA_JUROR_COST_CAP_USD,
  EXTRA_JUROR_USD,
  MARGIN_FLOOR,
  MAX_EXTRA_JURORS,
  PUBLIC_TIER_LABELS,
  RETEST_WINDOW_DAYS,
  TIERS,
  TIER_LABELS,
  UPGRADE_CREDIT_HOURS,
  type AddonName,
  type TierName,
} from "./constants";
import { bestVerdictDiscount, couponPrice, type Coupon, type VerdictDiscountKind } from "./coupons";
import { marginOk } from "./guardrails";

/** Smallest amount we ever send to checkout after upgrade credit. */
export const MIN_CHECKOUT_USD = 1;

/**
 * Upgrade ladder. Credit only flows upward, and only into the tiers listed in CREDIT_TARGETS:
 * a Quick Read (spark) paid within UPGRADE_CREDIT_HOURS counts toward a Verdict (proof).
 * Retest is a flat price that needs a proof parent; it never takes credit.
 */
const TIER_RANK: Record<TierName, number> = { spark: 0, pulse: 1, proof: 2, retest: 2, launch_pack: 3, specialist: 4 };
const CREDIT_TARGETS: readonly TierName[] = ["proof"];

export type ParentOrderForCredit = { tier: TierName; price_usd: number; paid_at: string | null };

export type PriceQuote = {
  priceUsd: number;        // what the buyer pays now: base (after the one discount) + extra jurors
  listUsd: number;         // tier base price before any discount (prices table, constant fallback)
  discountUsd: number;     // coupon discount on the base price (0 when the credit won)
  couponCode: string | null; // the coupon actually applied (null when the credit won or none)
  creditUsd: number;       // upgrade credit actually applied (0 when the coupon won)
  /** Which single discount was applied: they never stack (the larger saving wins, ties → coupon). */
  discountApplied: VerdictDiscountKind;
  /** The other discount that was available but not used (they don't stack), and what it was worth. */
  skippedDiscount: { kind: "coupon" | "credit"; code: string | null; usd: number } | null;
  extraJurors: number;
  extraJurorsUsd: number;  // EXTRA_JUROR_USD × extraJurors (never discounted)
  jurors: number;          // panel size target: tier jurors + extra jurors
  jurorCostCap: number;    // max Terac spend: tier cap + EXTRA_JUROR_COST_CAP_USD × extra jurors
};

export type PricingErrorCode =
  | "tier_not_offered"
  | "addons_not_offered"
  | "extra_jurors_out_of_range"
  | "margin_too_low"
  | "no_price"
  | "bad_parent_price";

export class PricingError extends Error {
  constructor(public code: PricingErrorCode, message: string) {
    super(message);
    this.name = "PricingError";
  }
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function isBuyableTier(tier: string): tier is (typeof BUYABLE_TIERS)[number] {
  return (BUYABLE_TIERS as readonly string[]).includes(tier);
}

/** Customer-facing list of what checkout sells, for refusal messages. */
export const BUYABLE_TIERS_TEXT = BUYABLE_TIERS.map((t) => `${TIER_LABELS[t]} (${t})`).join(", ");

/** Juror cost cap for an order: the tier cap + EXTRA_JUROR_COST_CAP_USD ($10.50) per paid extra juror. */
export function panelCostCap(tier: TierName, extraJurors: number): number {
  const t = TIERS[tier];
  return t.jurorCostCap === null ? 0 : cents(t.jurorCostCap + EXTRA_JUROR_COST_CAP_USD * Math.max(0, extraJurors));
}

/**
 * Price for a buyable tier.
 * - base: `prices[tier]` (current_usd from the `prices` table, CEO-adjustable within band);
 *   falls back to TIERS[tier].price when the row is missing.
 * - coupon (validated by the caller with checkCoupon): only on its tier's base price, whole dollars
 *   rounded down.
 * - upgrade credit: target tier in CREDIT_TARGETS (Verdict), parent ranks below it and was paid within
 *   UPGRADE_CREDIT_HOURS → credit = parent price, never taking the base below MIN_CHECKOUT_USD.
 * - one discount per order: coupon and credit never stack. When both could apply, only the larger
 *   saving is applied (bestVerdictDiscount): LAUNCH20 $299 → $239 ($60 off) beats the $49 credit ($250).
 * - extra jurors: 0–MAX_EXTRA_JURORS at EXTRA_JUROR_USD each, added after any discount; the panel grows
 *   by that many and its juror cost cap by EXTRA_JUROR_COST_CAP_USD each.
 * - legacy add-ons (extra5/rush) → PricingError("addons_not_offered").
 * - margin: refuses (margin_too_low) when the price can't keep MARGIN_FLOOR at the worst-case juror
 *   cost (the full juror cost cap) plus the Whop fee. Launch re-checks against the real cost.
 */
export function computePrice(i: {
  tier: TierName;
  addons?: readonly AddonName[] | readonly string[];
  extraJurors?: number;
  coupon?: Coupon | null;
  parentOrder?: ParentOrderForCredit | null;
  prices: Record<string, number>;
  now?: Date;
}): PriceQuote {
  if (!isBuyableTier(i.tier)) {
    throw new PricingError("tier_not_offered", `${TIER_LABELS[i.tier] ?? i.tier} is not sold at checkout. We sell ${BUYABLE_TIERS_TEXT}.`);
  }
  if ((i.addons ?? []).length > 0) {
    throw new PricingError("addons_not_offered", `Add-ons are no longer sold. Use extra_jurors (0–${MAX_EXTRA_JURORS}) instead.`);
  }
  const extra = i.extraJurors ?? 0;
  if (!Number.isInteger(extra) || extra < 0 || extra > MAX_EXTRA_JURORS) {
    throw new PricingError("extra_jurors_out_of_range", `extra_jurors must be a whole number from 0 to ${MAX_EXTRA_JURORS}`);
  }
  const t = TIERS[i.tier];
  const fromTable = i.prices[i.tier];
  const list = fromTable === undefined || fromTable === null ? t.price : Number(fromTable);
  if (!Number.isFinite(list) || list <= 0) {
    throw new PricingError("no_price", `no valid price for tier ${i.tier}`);
  }
  const listUsd = cents(list);
  const now = i.now ?? new Date();

  const coupon = i.coupon && i.coupon.tier === i.tier ? i.coupon : null;

  let credit = 0;
  const p = i.parentOrder;
  if (p && p.paid_at && CREDIT_TARGETS.includes(i.tier) && TIER_RANK[p.tier] < TIER_RANK[i.tier]) {
    const parentPrice = Number(p.price_usd);
    if (!Number.isFinite(parentPrice) || parentPrice < 0) {
      throw new PricingError("bad_parent_price", "parent order has no valid price");
    }
    const paidAt = new Date(p.paid_at).getTime();
    const ageMs = now.getTime() - paidAt;
    if (Number.isFinite(paidAt) && ageMs >= 0 && ageMs <= UPGRADE_CREDIT_HOURS * 3600_000) {
      credit = Math.min(parentPrice, Math.max(0, listUsd - MIN_CHECKOUT_USD));
    }
  }
  const best = bestVerdictDiscount({ listUsd, coupon, creditUsd: cents(credit) });
  const discountUsd = best.couponUsd;
  const creditUsd = best.creditUsd;
  const base = best.baseUsd;

  const extraJurorsUsd = cents(EXTRA_JUROR_USD * extra);
  const priceUsd = cents(base + extraJurorsUsd);
  const jurors = t.jurors + extra;
  const jurorCostCap = panelCostCap(i.tier, extra);

  if (!marginOk(priceUsd, jurorCostCap / jurors, jurors)) {
    throw new PricingError(
      "margin_too_low",
      `$${priceUsd} can't keep a ${MARGIN_FLOOR * 100}% margin at the worst-case juror cost ($${jurorCostCap}) plus fees`,
    );
  }
  return {
    priceUsd,
    listUsd,
    discountUsd,
    couponCode: best.kind === "coupon" && coupon ? coupon.code : null,
    creditUsd,
    discountApplied: best.kind,
    skippedDiscount:
      best.kind === "credit" && coupon
        ? { kind: "coupon", code: coupon.code, usd: cents(listUsd - couponPriceOf(listUsd, coupon)) }
        : best.kind === "coupon" && credit > 0
          ? { kind: "credit", code: null, usd: cents(credit) }
          : null,
    extraJurors: extra,
    extraJurorsUsd,
    jurors,
    jurorCostCap,
  };
}

const couponPriceOf = (list: number, c: Coupon) => Math.min(list, couponPrice(list, c.percentOff));

/**
 * Plain-English line for the checkout response/UI saying which discount was applied, or null when
 * there was nothing to choose between. E.g. "LAUNCH20 applied ($60 off). It doesn't combine with your
 * Quick Read credit ($49), so we used the bigger saving."
 */
export function discountNote(q: Pick<PriceQuote, "discountApplied" | "couponCode" | "discountUsd" | "creditUsd" | "skippedDiscount">): string | null {
  const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  const s = q.skippedDiscount;
  if (q.discountApplied === "coupon" && s?.kind === "credit") {
    return `${q.couponCode} applied (${money(q.discountUsd)} off). It doesn't combine with your Quick Read credit (${money(s.usd)}), so we used the bigger saving.`;
  }
  if (q.discountApplied === "credit" && s?.kind === "coupon") {
    return `Your Quick Read credit applied (${money(q.creditUsd)} off). It doesn't combine with ${s.code} (${money(s.usd)} off), so we used the bigger saving.`;
  }
  if (q.discountApplied === "coupon") return `${q.couponCode} applied (${money(q.discountUsd)} off).`;
  if (q.discountApplied === "credit") return `Your Quick Read credit applied (${money(q.creditUsd)} off).`;
  return null;
}

// ---------------------------------------------------------------- retest eligibility

export type RetestRefusalCode =
  | "retest_needs_parent"
  | "retest_parent_not_eligible"
  | "retest_window_expired"
  | "retest_already_used";

export type RetestParent = {
  tier: string;
  stage: string;
  mode: string;
  email: string;
  delivered_at: string | null;
};

/**
 * A Retest is its own purchase. It needs a parent Verdict (tier `proof`) of the same email and mode
 * that was DELIVERED or PARTIAL, delivered within RETEST_WINDOW_DAYS, and not already retested
 * (`paidRetests` = paid retest orders that name this parent). Returns null when eligible.
 */
export function retestRefusal(i: {
  parentOrderId: string | null | undefined;
  parent: RetestParent | null;
  email: string;
  mode: string;
  paidRetests: number;
  now?: Date;
}): { code: RetestRefusalCode; message: string } | null {
  if (!i.parentOrderId) {
    return { code: "retest_needs_parent", message: "A Retest needs the Verdict it follows. Use the Retest link in your Verdict report." };
  }
  const p = i.parent;
  const delivered = p && (p.stage === "DELIVERED" || p.stage === "PARTIAL") && p.delivered_at;
  if (!p || p.mode !== i.mode || p.email.toLowerCase() !== i.email.toLowerCase() || p.tier !== "proof" || !delivered) {
    return {
      code: "retest_parent_not_eligible",
      message: "A Retest follows a delivered Verdict bought with the same email. Use the Retest link in your Verdict report.",
    };
  }
  const deliveredMs = new Date(p.delivered_at as string).getTime();
  const nowMs = (i.now ?? new Date()).getTime();
  if (!Number.isFinite(deliveredMs) || nowMs - deliveredMs > RETEST_WINDOW_DAYS * 86_400_000) {
    return {
      code: "retest_window_expired",
      message: `Retests are available for ${RETEST_WINDOW_DAYS} days after your Verdict is delivered. This one has expired.`,
    };
  }
  if (i.paidRetests > 0) {
    return { code: "retest_already_used", message: "This Verdict has already been retested. Each Verdict can be retested once." };
  }
  return null;
}

/** Whop rejects plan titles longer than this ("Title is too long (maximum is 30 characters)"). */
export const WHOP_TITLE_MAX = 30;

/**
 * Whop checkout title, e.g. "Verdict +5 · JH-F9DA6201" (always ≤ 30 chars). Coupon and credit
 * details are not repeated: Whop already shows the price being charged.
 */
export function checkoutTitle(
  tier: TierName,
  o: { creditUsd?: number; extraJurors?: number; couponCode?: string | null; orderRef?: string | null } = {},
): string {
  const base = `${PUBLIC_TIER_LABELS[tier]}${o.extraJurors ? ` +${o.extraJurors}` : ""}`;
  const withRef = o.orderRef ? `${base} · ${o.orderRef}` : `JuryHour ${base}`;
  return (withRef.length <= WHOP_TITLE_MAX ? withRef : base).slice(0, WHOP_TITLE_MAX);
}
