// Checkout pricing (SPEC §1, §8). Pure: no I/O, no clock unless `now` is omitted.
import {
  ADDONS,
  ADDON_EXTRA_JURORS,
  BUYABLE_TIERS,
  TIERS,
  UPGRADE_CREDIT_HOURS,
  type AddonName,
  type TierName,
} from "./constants";

/** Smallest amount we ever send to checkout after upgrade credit. */
export const MIN_CHECKOUT_USD = 1;

/** Upgrade ladder. Credit only flows upward (a Spark counts toward Pulse/Proof/Launch Pack). */
const TIER_RANK: Record<TierName, number> = { spark: 0, pulse: 1, proof: 2, launch_pack: 3, specialist: 4 };

export type ParentOrderForCredit = { tier: TierName; price_usd: number; paid_at: string | null };

export type PriceQuote = {
  priceUsd: number;      // what the buyer pays now
  creditUsd: number;     // upgrade credit actually applied
  jurors: number;        // panel size target (tier + extra5)
  jurorCostCap: number;  // max Terac spend for the panel, raised pro rata by extra5
};

export class PricingError extends Error {
  constructor(public code: "tier_not_buyable" | "no_price" | "bad_parent_price", message: string) {
    super(message);
    this.name = "PricingError";
  }
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function isBuyableTier(tier: string): tier is (typeof BUYABLE_TIERS)[number] {
  return (BUYABLE_TIERS as readonly string[]).includes(tier);
}

/**
 * Price for a buyable tier.
 * - base: `prices[tier]` (current_usd from the `prices` table, CEO-adjustable within band);
 *   falls back to TIERS[tier].price when the row is missing.
 * - add-ons: ADDONS, each counted once. `extra5` adds ADDON_EXTRA_JURORS jurors and raises
 *   jurorCostCap pro rata (cap × newJurors / tierJurors).
 * - upgrade credit: parent paid within UPGRADE_CREDIT_HOURS and parent tier ranks below this
 *   tier → credit = parent price, but the checkout never goes below MIN_CHECKOUT_USD (the
 *   unused remainder of the credit is dropped, so creditUsd reports only what was applied).
 */
export function computePrice(i: {
  tier: TierName;
  addons: AddonName[];
  parentOrder?: ParentOrderForCredit | null;
  prices: Record<string, number>;
  now?: Date;
}): PriceQuote {
  if (!isBuyableTier(i.tier)) {
    throw new PricingError("tier_not_buyable", `tier ${i.tier} is not sold at a fixed price`);
  }
  const t = TIERS[i.tier];
  const fromTable = i.prices[i.tier];
  const base = fromTable === undefined || fromTable === null ? t.price : Number(fromTable);
  if (!Number.isFinite(base) || base <= 0) {
    throw new PricingError("no_price", `no valid price for tier ${i.tier}`);
  }

  const addons = [...new Set(i.addons)];
  const addonTotal = addons.reduce((sum, a) => sum + ADDONS[a], 0);
  const gross = cents(base + addonTotal);

  const jurors = t.jurors + (addons.includes("extra5") ? ADDON_EXTRA_JURORS : 0);
  const jurorCostCap = cents((t.jurorCostCap * jurors) / t.jurors);

  let creditUsd = 0;
  const p = i.parentOrder;
  if (p && p.paid_at && TIER_RANK[p.tier] < TIER_RANK[i.tier]) {
    const parentPrice = Number(p.price_usd);
    if (!Number.isFinite(parentPrice) || parentPrice < 0) {
      throw new PricingError("bad_parent_price", "parent order has no valid price");
    }
    const paidAt = new Date(p.paid_at).getTime();
    const now = (i.now ?? new Date()).getTime();
    const ageMs = now - paidAt;
    if (Number.isFinite(paidAt) && ageMs >= 0 && ageMs <= UPGRADE_CREDIT_HOURS * 3600_000) {
      creditUsd = Math.min(parentPrice, Math.max(0, gross - MIN_CHECKOUT_USD));
    }
  }
  creditUsd = cents(creditUsd);
  const priceUsd = cents(gross - creditUsd);
  return { priceUsd, creditUsd, jurors, jurorCostCap };
}

/** Human title for the Whop checkout line ("JuryHour Proof + 5 extra jurors + rush"). */
export function checkoutTitle(tier: TierName, addons: AddonName[], creditUsd = 0): string {
  const names: Record<TierName, string> = {
    spark: "Spark", pulse: "Pulse", proof: "Proof", launch_pack: "Launch Pack", specialist: "Specialist Jury",
  };
  const addonNames: Record<AddonName, string> = { extra5: "5 extra jurors", rush: "rush", secondPage: "second page" };
  const parts = [`JuryHour ${names[tier]}`, ...[...new Set(addons)].map((a) => addonNames[a])];
  const title = parts.join(" + ");
  return creditUsd > 0 ? `${title} (upgrade credit applied)` : title;
}
