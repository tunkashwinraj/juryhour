// Pure pricing content for PricingSection and /pricing (docs/WEBSITE_SPEC.md §5.7). No I/O, no React.
import { ADDONS, ADDON_EXTRA_JURORS, TIERS, UPGRADE_CREDIT_HOURS, type TierName } from "@/lib/constants";
import type { LaunchOffer } from "@/lib/launch";

/** Specialist is quoted per audience; this is the floor of SPECIALIST_PRICE. */
export const SPECIALIST_FROM_USD = 499;

export const TIER_ORDER: TierName[] = ["spark", "pulse", "proof", "launch_pack", "specialist"];

export const TIER_LABEL: Record<TierName, string> = {
  spark: "Spark",
  pulse: "Pulse",
  proof: "Proof",
  launch_pack: "Launch Pack",
  specialist: "Specialist Jury",
};

// "N real people" is rendered by PriceCard from `jurors`, so it isn't repeated in the bullets.
const COPY: Record<TierName, { summary: string; bullets: string[] }> = {
  spark: {
    summary: "A first impression of your headline.",
    bullets: [
      `${TIERS.spark.minutes}-minute first impression of your headline`,
      "AI critique",
      "1 rewritten headline (untested)",
      "Same day",
    ],
  },
  pulse: {
    summary: "Real reactions to your current page.",
    bullets: [
      `${TIERS.pulse.minutes}-minute reaction to your current page`,
      "Full report with anonymous quotes",
      "Rewritten hero section (untested)",
      "Same day",
    ],
  },
  proof: {
    summary: "Your page against our rewrite, judged blind.",
    bullets: [
      "Your page vs our rewrite, random order",
      "Verdict, scorecard, top fixes, winning copy",
      "Same day",
    ],
  },
  launch_pack: {
    summary: "Proof now, and proof that your update worked.",
    bullets: ["Proof now + a free retest after you update your page", "See your own before and after"],
  },
  specialist: {
    summary: "Verified professionals who match your buyer.",
    bullets: [
      `${TIERS.specialist.jurors} verified professionals matching your buyer (job, industry, seniority)`,
      "Buyer objections and price reaction",
      "24–72 h",
    ],
  },
};

export type TierView = {
  tier: TierName;
  name: string;
  /** Price shown on the card (launch price when the offer applies to this tier). */
  price: number | null;
  /** Normal price, only while a launch offer applies to this tier. */
  compareAt: number | null;
  /** Price shown once the offer has ended (client-side swap). Equals `price` without an offer. */
  normalPrice: number | null;
  fromPrice: boolean;
  /** Shown by PriceCard as "N real people"; null for Specialist (its bullet names the professionals). */
  jurors: number | null;
  summary: string;
  bullets: string[];
  recommended: boolean;
  offer: { endsAt: string; priceUsd: number; normalUsd: number } | null;
};

export function buildTierViews(prices: Partial<Record<TierName, number | null>>, offer: LaunchOffer | null): TierView[] {
  return TIER_ORDER.map((tier) => {
    const base =
      tier === "specialist" ? SPECIALIST_FROM_USD : (prices[tier] ?? (TIERS[tier].price as number | null));
    const o = offer && offer.tier === tier && base !== null && offer.priceUsd < base ? offer : null;
    return {
      tier,
      name: TIER_LABEL[tier],
      price: o ? o.priceUsd : base,
      compareAt: o ? base : null,
      normalPrice: base,
      fromPrice: tier === "specialist",
      jurors: tier === "specialist" ? null : TIERS[tier].jurors,
      summary: COPY[tier].summary,
      bullets: COPY[tier].bullets,
      recommended: tier === "proof",
      offer: o ? { endsAt: o.endsAt, priceUsd: o.priceUsd, normalUsd: base as number } : null,
    };
  });
}

/** Add-ons actually sold. "Second page" is deliberately absent (WEBSITE_CONTRACTS §0.3). */
export const SOLD_ADDONS = [
  { key: "extra5", label: `+${ADDON_EXTRA_JURORS} jurors`, detail: "More people on your panel.", price: ADDONS.extra5 },
  { key: "rush", label: "Rush", detail: "Your panel goes first.", price: ADDONS.rush },
] as const;

export const UPGRADE_CREDIT_LINE = `Your Spark counts toward Proof if you upgrade within ${UPGRADE_CREDIT_HOURS} hours.`;

export const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

const ET_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});
const ET_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const ET_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

/** "6:00pm ET" for an ISO time. */
export function formatEtTime(iso: string): string {
  return `${ET_TIME.format(new Date(iso)).replace(/\s?([AP])M$/i, (_m, p: string) => `${p.toLowerCase()}m`)} ET`;
}

/** "until 6:00pm ET today" (or "until 6:00pm ET on Oct 25" when the end is on another ET day). */
export function offerEndsLabel(endsAt: string, now: Date = new Date()): string {
  const sameDay = ET_DAY.format(new Date(endsAt)) === ET_DAY.format(now);
  return `until ${formatEtTime(endsAt)} ${sameDay ? "today" : `on ${ET_DATE.format(new Date(endsAt))}`}`;
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

/** Full feature comparison for /pricing. Columns follow TIER_ORDER. Only what each tier really includes. */
export function featureRows(views: TierView[]): { label: string; cells: string[] }[] {
  const by = Object.fromEntries(views.map((v) => [v.tier, v])) as Record<TierName, TierView>;
  const col = (f: (t: TierName) => string) => TIER_ORDER.map(f);
  const priceCell = (t: TierName) => {
    const v = by[t];
    if (v.normalPrice === null) return "Quote";
    return `${v.fromPrice ? "From " : ""}${usd(v.normalPrice)}`;
  };
  return [
    { label: "Price", cells: col(priceCell) },
    { label: "Real people", cells: col((t) => String(TIERS[t].jurors)) },
    { label: "Minutes per juror", cells: col((t) => String(TIERS[t].minutes)) },
    {
      label: "Who judges",
      cells: col((t) =>
        t === "specialist" ? "Verified professionals (job, industry, seniority)" : "People who match your buyer",
      ),
    },
    {
      label: "What they judge",
      cells: [
        "Your headline",
        "Your current page",
        "Your page vs our rewrite",
        "Your page vs our rewrite, then your update",
        "Your page and your price",
      ],
    },
    { label: "AI critique", cells: ["Yes", "—", "—", "—", "—"] },
    {
      label: "Rewritten copy",
      cells: ["1 headline (untested)", "Hero section (untested)", "Winning copy, tested", "Winning copy, tested", "—"],
    },
    { label: "Blind A/B test, random order", cells: ["—", "—", "Yes", "Yes", "—"] },
    { label: "Verdict, scorecard and top fixes", cells: ["—", "—", "Yes", "Yes", "—"] },
    { label: "Anonymous juror quotes", cells: ["3 raw answers", "Yes", "Yes", "Yes", "Yes"] },
    { label: "Buyer objections and price reaction", cells: ["—", "—", "—", "—", "Yes"] },
    { label: "Free retest after you update", cells: ["—", "—", "—", "Yes", "—"] },
    { label: "Delivery", cells: ["Same day", "Same day", "Same day", "Same day", "24–72 h"] },
  ];
}
