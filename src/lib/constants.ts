// Business constants (SPEC §8). Frozen contract: only the lead changes this file.

export const TIERS = {
  spark:       { price: 11,   jurors: 3,  minJurors: 3,  minutes: 2,  jurorCostCap: 7,    format: "spark",      deadlineHours: 4 },
  pulse:       { price: 49,   jurors: 10, minJurors: 8,  minutes: 4,  jurorCostCap: 25,   format: "pulse",      deadlineHours: 4 },
  proof:       { price: 149,  jurors: 15, minJurors: 10, minutes: 8,  jurorCostCap: 60,   format: "proof",      deadlineHours: 8 },
  launch_pack: { price: 199,  jurors: 15, minJurors: 10, minutes: 8,  jurorCostCap: 60,   format: "proof",      deadlineHours: 8, retest: true },
  specialist:  { price: null, jurors: 8,  minJurors: 6,  minutes: 10, jurorCostCap: null, format: "specialist", deadlineHours: 72 },
} as const;

export type TierName = keyof typeof TIERS;
export const TIER_NAMES = Object.keys(TIERS) as TierName[];
export const BUYABLE_TIERS = ["spark", "pulse", "proof", "launch_pack"] as const satisfies readonly TierName[];

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
