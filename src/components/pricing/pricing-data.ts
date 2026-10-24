// Pure pricing content for PricingSection and /pricing (docs/WEBSITE_SPEC.md §5.7). No I/O, no React.
// Pricing v3 (founder decision 2026-10): exactly two public plans — Quick Read $11 and Verdict ($299
// launch offer · regular $499 from Dec 1) [recommended] — plus extra jurors at $7 each and the HALF
// coupon (first Verdict). Retest is sold only from a delivered Verdict report, never on pricing pages.
import {
  EXTRA_JUROR_USD,
  MAX_EXTRA_JURORS,
  PUBLIC_TIER_LABELS,
  TIERS,
  UPGRADE_CREDIT_HOURS,
  VERDICT_REGULAR_FROM,
  VERDICT_REGULAR_USD,
  type TierName,
} from "@/lib/constants";
import { couponEndsLabel, couponPrice, type PublicCoupon } from "@/lib/coupons";

export { couponEndsLabel };

/** Plans shown as cards and table columns. Retest is not a card: it is bought from a Verdict report. */
export type CardTier = "spark" | "proof";
export const TIER_ORDER: CardTier[] = ["spark", "proof"];

/** Customer-facing names (re-exported from constants so every page agrees). */
export const TIER_LABEL: Record<TierName, string> = PUBLIC_TIER_LABELS;

// "N real people" is rendered by PriceCard from `jurors`, so it isn't repeated in the bullets.
const COPY: Record<CardTier, { summary: string; bullets: string[] }> = {
  spark: {
    summary: "A first impression of your headline.",
    bullets: [
      `${TIERS.spark.minutes}-minute reaction to your headline`,
      "AI critique",
      "1 rewritten headline (untested)",
      "Same day",
    ],
  },
  proof: {
    summary: "Your page against our rewrite, judged blind.",
    bullets: [
      "Your page vs our rewrite, random order",
      "Winner, scorecard, top fixes, winning copy",
      "Same day",
    ],
  },
};

export type TierView = {
  tier: CardTier;
  name: string;
  price: number;
  /** Shown by PriceCard as "N real people". */
  jurors: number;
  summary: string;
  bullets: string[];
  recommended: boolean;
};

export type PriceMap = Partial<Record<TierName, number | null>>;

/** Price of a fixed-price tier: the prices table value when present, else the constant. */
export function tierPrice(tier: "spark" | "proof" | "retest", prices: PriceMap): number {
  return prices[tier] ?? TIERS[tier].price;
}

export function buildTierViews(prices: PriceMap): TierView[] {
  return TIER_ORDER.map((tier) => ({
    tier,
    name: TIER_LABEL[tier],
    price: tierPrice(tier, prices),
    jurors: TIERS[tier].jurors,
    summary: COPY[tier].summary,
    bullets: COPY[tier].bullets,
    recommended: tier === "proof",
  }));
}

export function usd(n: number): string {
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

/** "launch offer · regular $499 from Dec 1" (copy only; no strike-through anywhere). */
export const VERDICT_LAUNCH_NOTE = `launch offer · regular ${usd(VERDICT_REGULAR_USD)} from ${VERDICT_REGULAR_FROM}`;

export const UPGRADE_CREDIT_LINE = `Your ${usd(TIERS.spark.price)} counts toward a Verdict for ${UPGRADE_CREDIT_HOURS} hours.`;

export const EXTRA_JURORS_LINE = `Add up to ${MAX_EXTRA_JURORS} extra jurors to a Quick Read or Verdict at ${usd(EXTRA_JUROR_USD)} each.`;

/** Verdict price with the coupon (whole dollars, rounded down: $299 → $149). */
export function verdictCouponPrice(prices: PriceMap, coupon: PublicCoupon): number {
  return couponPrice(tierPrice("proof", prices), coupon.percentOff);
}

/** "First Verdict? Code HALF makes it $149 through Nov 30." */
export function couponAdLine(prices: PriceMap, coupon: PublicCoupon): string {
  return `First Verdict? Code ${coupon.code} makes it ${usd(verdictCouponPrice(prices, coupon))} through ${couponEndsLabel(coupon.endsAt)}.`;
}

/** "2h 14m" for a duration in minutes. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (h >= 48) return `${Math.round(h / 24)} days`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/** Feature comparison for /pricing. Columns follow TIER_ORDER. Only what each plan really includes. */
export function featureRows(views: TierView[]): { label: string; cells: string[] }[] {
  const by = Object.fromEntries(views.map((v) => [v.tier, v])) as Record<CardTier, TierView>;
  const col = (f: (t: CardTier) => string) => TIER_ORDER.map(f);
  return [
    { label: "Price", cells: [usd(by.spark.price), `${usd(by.proof.price)} ${VERDICT_LAUNCH_NOTE}`] },
    { label: "Real people", cells: col((t) => String(TIERS[t].jurors)) },
    { label: "Minutes per juror", cells: col((t) => String(TIERS[t].minutes)) },
    { label: "Who judges", cells: col(() => "People who match your buyer") },
    { label: "What they judge", cells: ["Your headline", "Your page vs our rewrite"] },
    { label: "AI critique", cells: ["Yes", "—"] },
    { label: "Rewritten copy", cells: ["1 headline (untested)", "Winning copy, tested"] },
    { label: "Blind A/B test, random order", cells: ["—", "Yes"] },
    { label: "Winner, scorecard and top fixes", cells: ["—", "Yes"] },
    { label: "Anonymous juror quotes", cells: ["3 raw answers", "Yes"] },
    { label: `Extra jurors (up to ${MAX_EXTRA_JURORS})`, cells: [`${usd(EXTRA_JUROR_USD)} each`, `${usd(EXTRA_JUROR_USD)} each`] },
    { label: "Delivery", cells: ["Same day", "Same day"] },
  ];
}
