// Verdict coupon (founder decision 2026-10, pricing v4). Server-side truth: /api/checkout validates and
// applies it; the site only displays what this module says. Pure helpers take `now` explicitly.
//
// LAUNCH20: 20% off the Verdict (proof) base price ($299 → $239, rounded DOWN to whole dollars), first
// Verdict per customer (no earlier PAID proof order for that email in the same mode), until
// COUPON_LAUNCH20_ENDS_AT (default 2026-12-01T05:00:00Z = end of Nov 30 ET). Never discounts extra jurors.
// One discount per order: it does NOT stack with the Quick Read upgrade credit. When both could apply,
// checkout takes only the larger saving (bestVerdictDiscount: LAUNCH20 $60 off beats the $49 credit).
// Retired codes are refused as coupon_unknown like any other unknown code.
//
// Env (optional, read tolerantly so a typo can never take the app down):
//   COUPON_LAUNCH20_ENDS_AT  ISO end time; a past time switches LAUNCH20 off.
import type { TierName } from "./constants";

export type Coupon = {
  code: string;
  tier: TierName;
  percentOff: number;
  endsAt: string;
  /** Only for a customer's first paid order of `tier` (same email + mode). */
  firstOrderOnly: boolean;
};

/** What the browser may know about the coupon (it is public: it is advertised on the Verdict card). */
export type PublicCoupon = Coupon;

export const LAUNCH20_DEFAULT: Coupon = {
  code: "LAUNCH20",
  tier: "proof",
  percentOff: 20,
  endsAt: "2026-12-01T05:00:00.000Z",
  firstOrderOnly: true,
};
/** The default (and only) coupon. */
export const DEFAULT_COUPON = LAUNCH20_DEFAULT;

/** The configured coupon (env override for the end time; invalid values fall back to the default). */
export function configuredCoupon(e: Record<string, string | undefined> = process.env): Coupon {
  const ends = (e.COUPON_LAUNCH20_ENDS_AT ?? "").trim();
  const endsMs = ends ? Date.parse(ends) : NaN;
  return { ...LAUNCH20_DEFAULT, endsAt: Number.isFinite(endsMs) ? new Date(endsMs).toISOString() : LAUNCH20_DEFAULT.endsAt };
}

export function isCouponLive(c: Coupon, now: Date): boolean {
  const ends = Date.parse(c.endsAt);
  return Number.isFinite(ends) && now.getTime() < ends;
}

/** The coupon while it is running, else null (for display). */
export function activeCoupon(now: Date = new Date(), c: Coupon = configuredCoupon()): PublicCoupon | null {
  return isCouponLive(c, now) ? c : null;
}

const ET_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

/** Last ET day the coupon is valid: 2026-12-01T05:00Z (midnight ET starting Dec 1) → "Nov 30". */
export function couponEndsLabel(endsAt: string): string {
  return ET_DATE.format(new Date(Date.parse(endsAt) - 1));
}

export function sameCode(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b) && String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
}

/** Discounted base price: whole dollars, rounded down (never below $1). */
export function couponPrice(base: number, percentOff: number): number {
  return Math.max(1, Math.floor(base * (1 - percentOff / 100) + 1e-9));
}

export type VerdictDiscountKind = "coupon" | "credit" | null;

/**
 * One discount per order. Given the list price, the coupon (already validated, or null) and the upgrade
 * credit available (already bounded), returns the single discount that saves the buyer more. Ties go
 * to the coupon. Used by computePrice (the truth) and by the site to show what checkout will apply.
 */
export function bestVerdictDiscount(i: { listUsd: number; coupon: Pick<Coupon, "percentOff"> | null; creditUsd: number }): {
  kind: VerdictDiscountKind;
  couponUsd: number;
  creditUsd: number;
  baseUsd: number;
} {
  const couponUsd = i.coupon ? Math.max(0, i.listUsd - Math.min(i.listUsd, couponPrice(i.listUsd, i.coupon.percentOff))) : 0;
  const credit = Math.max(0, i.creditUsd);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  if (couponUsd > 0 && couponUsd >= credit) return { kind: "coupon", couponUsd: r2(couponUsd), creditUsd: 0, baseUsd: r2(i.listUsd - couponUsd) };
  if (credit > 0) return { kind: "credit", couponUsd: 0, creditUsd: r2(credit), baseUsd: r2(i.listUsd - credit) };
  return { kind: null, couponUsd: 0, creditUsd: 0, baseUsd: r2(i.listUsd) };
}

export type CouponRefusalCode = "coupon_unknown" | "coupon_expired" | "coupon_not_applicable" | "coupon_already_used";

export type CouponCheck =
  | { ok: true; coupon: Coupon }
  | { ok: false; code: CouponRefusalCode; message: string };

/**
 * Strict check for a code the buyer asked to apply as a discount. `priorPaidOrders` = paid orders of
 * the coupon's tier for this email + mode (pass it when the coupon is first-order-only).
 */
export function checkCoupon(i: { code: string; tier: TierName; now: Date; priorPaidOrders?: number; coupon?: Coupon }): CouponCheck {
  const c = i.coupon ?? configuredCoupon();
  if (!sameCode(i.code, c.code)) {
    return { ok: false, code: "coupon_unknown", message: `"${i.code.slice(0, 40)}" isn't a discount code we recognise.` };
  }
  if (!isCouponLive(c, i.now)) {
    return { ok: false, code: "coupon_expired", message: `${c.code} has ended. The Verdict is back to its launch price without it.` };
  }
  if (i.tier !== c.tier) {
    return { ok: false, code: "coupon_not_applicable", message: `${c.code} only applies to the Verdict.` };
  }
  if (c.firstOrderOnly && (i.priorPaidOrders ?? 0) > 0) {
    return {
      ok: false,
      code: "coupon_already_used",
      message: `${c.code} is for your first Verdict, and this email already has one. Remove the code to continue.`,
    };
  }
  return { ok: true, coupon: c };
}
