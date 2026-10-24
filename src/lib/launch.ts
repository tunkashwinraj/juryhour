// Launch offer (docs/WEBSITE_SPEC.md §5.1): a temporary price for one tier until a fixed end time.
// Configured by env; the end time is real and never resets. Checkout applies it server-side, so the
// price a buyer is charged always matches the offer that was live when they clicked.
import { TIERS, type TierName } from "./constants";
import { env } from "./env";

export type LaunchOffer = {
  tier: TierName;
  priceUsd: number;
  normalUsd: number;
  endsAt: string; // ISO
  code: string;
};

/** The offer if it is configured and not yet over, else null. */
export function activeLaunchOffer(now: Date = new Date(), normalPrices?: Record<string, number | null>): LaunchOffer | null {
  const e = env();
  if (!e.LAUNCH_OFFER_ENDS_AT) return null;
  const ends = new Date(e.LAUNCH_OFFER_ENDS_AT);
  if (Number.isNaN(ends.getTime()) || now >= ends) return null;
  const tier = e.LAUNCH_OFFER_TIER;
  const normal = normalPrices?.[tier] ?? TIERS[tier].price;
  if (normal === null || normal === undefined || e.LAUNCH_OFFER_PRICE >= normal) return null;
  return { tier, priceUsd: e.LAUNCH_OFFER_PRICE, normalUsd: normal, endsAt: ends.toISOString(), code: e.LAUNCH_OFFER_CODE };
}

/** Prices with the active launch offer applied (used by /api/checkout). */
export function applyLaunchOffer<T extends Record<string, number>>(prices: T, now: Date = new Date()): T {
  const offer = activeLaunchOffer(now, prices);
  return offer ? { ...prices, [offer.tier]: offer.priceUsd } : prices;
}
