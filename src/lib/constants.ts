// Business constants (SPEC §8). Frozen contract: only the lead changes this file.

// Pricing v3 (founder decision 2026-10): two public plans — Quick Read (spark) $11 and Verdict (proof)
// $299 launch offer — plus extra jurors ($7 each) and Retest ($59, sold only from a Verdict report).
// Internal keys stay stable because orders/tests/prices rows reference them. pulse, launch_pack and
// specialist are retired: kept so historical orders still resolve, never sold again.
export const TIERS = {
  spark:       { price: 11,   jurors: 3,  minJurors: 3,  minutes: 2,  jurorCostCap: 7,    format: "spark",      deadlineHours: 4,  sold: true },
  pulse:       { price: 49,   jurors: 10, minJurors: 8,  minutes: 4,  jurorCostCap: 25,   format: "pulse",      deadlineHours: 4,  sold: false },
  proof:       { price: 299,  jurors: 20, minJurors: 14, minutes: 8,  jurorCostCap: 80,   format: "proof",      deadlineHours: 8,  sold: true },
  // Retest: proof format on the customer's UPDATED page vs a fresh rewrite. Needs a delivered proof
  // parent (same email + mode) within RETEST_WINDOW_DAYS, one retest per parent (see lib/pricing).
  retest:      { price: 59,   jurors: 8,  minJurors: 6,  minutes: 8,  jurorCostCap: 32,   format: "proof",      deadlineHours: 8,  sold: true },
  launch_pack: { price: 199,  jurors: 15, minJurors: 10, minutes: 8,  jurorCostCap: 60,   format: "proof",      deadlineHours: 8,  sold: false, retest: true },
  specialist:  { price: null, jurors: 8,  minJurors: 6,  minutes: 10, jurorCostCap: null, format: "specialist", deadlineHours: 72, sold: false },
} as const;

export type TierName = keyof typeof TIERS;
export const TIER_NAMES = Object.keys(TIERS) as TierName[];
/** Tiers sold through /api/checkout. (Specialist is retired: /api/quote refuses new quotes.) */
export const BUYABLE_TIERS = ["spark", "proof", "retest"] as const satisfies readonly TierName[];
/** Tiers that are no longer sold (historical orders only). */
export const RETIRED_TIERS = ["pulse", "launch_pack", "specialist"] as const satisfies readonly TierName[];

/** Customer-facing names. Use these everywhere a tier is shown to a person. */
export const TIER_LABELS: Record<TierName, string> = {
  spark: "Quick Read",
  pulse: "Pulse (retired)",
  proof: "Verdict",
  retest: "Retest",
  launch_pack: "Launch Pack (retired)",
  specialist: "Specialist Jury",
};

/** Customer-facing names for every surface a buyer sees (pages, emails, order/report pages, JSON-LD).
 *  Retired tiers never show their old names to customers. */
export const PUBLIC_TIER_LABELS: Record<TierName, string> = {
  ...TIER_LABELS,
  pulse: "Jury test",
  launch_pack: "Verdict with retest",
  specialist: "Custom jury",
};

/** Verdict launch-offer copy. Copy only: the Dec 1 price change is made by the founder, not by code. */
export const VERDICT_REGULAR_USD = 499;
export const VERDICT_REGULAR_FROM = "Dec 1";

/** Badge on the Verdict card. Single constant: "Most popular" would be a false claim before real sales. */
export const VERDICT_BADGE = "Recommended";

/** A Retest must be bought within this many days of its Verdict's delivery. */
export const RETEST_WINDOW_DAYS = 30;

/** Extra jurors: $7 each, 0–20 per order, on Quick Read, Verdict and Retest. Never discounted.
 *  Panel size = tier jurors + extra; the juror cost cap rises pro rata. */
export const EXTRA_JUROR_USD = 7;
export const MAX_EXTRA_JURORS = 20;
export const EXTRA_JUROR_TIERS = ["spark", "proof", "retest"] as const satisfies readonly TierName[];

// Legacy add-ons (extra5/rush) are no longer sold; new orders use `extra_jurors`. Kept so historical
// orders that carry them still get the right panel size and deadline (guardrails.panelSpec).
export const ADDONS = { extra5: 15, rush: 9, secondPage: 9 } as const;
export type AddonName = keyof typeof ADDONS;
export const ADDON_EXTRA_JURORS = 5;   // extra5 adds this many jurors (and raises jurorCostCap pro rata)

export const SPECIALIST_PRICE = (cpi: number, n = 8) => Math.max(499, 2 * cpi * n + 50);
export const SPECIALIST_QUOTE_TTL_HOURS = 48;

export const MARGIN_FLOOR = 0.30;              // never launch below 30% gross margin
export const PRICE_BAND = 0.25;                // CEO may move price ±25% of base, once/day/tier
export const TERAC_MIN_PARTICIPANT_BUDGET = 5; // Terac launch precondition (USD)
export const LOW_TERAC_BALANCE_USD = 40;       // pause sales below this
export const RESUME_TERAC_BALANCE_USD = 60;    // auto-resume above this
export const MAX_REJECT_RATE = 0.40;           // above this, flag bug instead of rejecting
export const ADS_DAILY_CAP_PER_CAMPAIGN = 20;
export const ADS_DAILY_CAP_TOTAL = 50;
export const UPGRADE_CREDIT_HOURS = 24;
export const REFUND_RESERVE_RATE = 0.03;
export const WHOP_FEE = (amt: number) => amt * 0.027 + 0.30; // domestic card estimate

export const BANNED_CATEGORIES = [
  "gambling/sports picks/trading signals",
  "adult",
  "guaranteed income or get-rich-quick",
  "scam/phishing",
  "hate",
  "weapons",
  "illegal goods",
  "MLM",
] as const;

// Stage timeouts measured from orders.stage_entered_at (SPEC §7). PANEL_LIVE uses orders.deadline_at.
export const STAGE_TIMEOUT_MINUTES = {
  RESEARCHING: 10,
  QUOTING: 90,
  GRADING: 10,
  SYNTHESIZING: 15,
} as const;
export const MAX_STAGE_ATTEMPTS = 3;
export const PANEL_GRACE_HOURS = 1;            // extra wait after deadline before full refund

// Juror page rules (SPEC §9, §11.4)
export const JUROR_MIN_SECONDS = 60;
export const JUROR_MIN_WORDS = 15;
export const CARD_REVEAL_SECONDS = 5;
export const GRADER_PASS_SCORE = 5;

// Preview rate limits (SPEC §10)
export const PREVIEW_LIMIT_PER_EMAIL_PER_DAY = 3;
export const PREVIEW_LIMIT_PER_IP_PER_DAY = 10;
export const FOLLOWUP_1_AFTER_MINUTES = 15;
export const FOLLOWUP_2_AFTER_HOURS = 24;

// Reconciler (SPEC §14)
export const RECONCILE_MAX_ORDERS = 25;
export const TERAC_BALANCE_REFRESH_MINUTES = 10;
export const WHOP_SWEEP_EVERY_MINUTES = 5;
export const AGENT_RUN_TIMEOUT_MINUTES = 20;

// OpenAI models for quick calls (replaces SPEC's Claude Messages API — see CLAUDE.md).
export const LLM_MODELS = {
  preview: "gpt-5.4-mini",
  grader: "gpt-5.4-mini",
} as const;

export const TERAC_CALLBACK_URL = "https://terac.com/api/external/callback";
export const REPORT_CAVEAT = "real people, directional signal, not a sales guarantee";
