// Shared contract types (Zod v4). Frozen contract: only the lead changes this file.
// Workstreams import these; they never redefine them.
import { z } from "zod";
import { TIER_NAMES, type AddonName, type TierName } from "./constants";

export const Mode = z.enum(["live", "sandbox"]);
export type Mode = z.infer<typeof Mode>;

export const Stage = z.enum([
  "CREATED", "PAID", "RESEARCHING", "QUOTING", "PANEL_LIVE", "GRADING",
  "SYNTHESIZING", "DELIVERED", "PARTIAL", "REFUNDED", "FAILED", "BLOCKED",
]);
export type Stage = z.infer<typeof Stage>;

export const Tier = z.enum(TIER_NAMES as [TierName, ...TierName[]]);
// Add-ons are no longer sold (/api/checkout refuses them); the enum stays for historical orders.
export const Addon = z.enum(["extra5", "rush"] satisfies AddonName[]);
// Test format per tier: retest runs the proof format (updated page vs a fresh rewrite).
export const TestFormat = z.enum(["spark", "pulse", "proof", "specialist"]);
export type TestFormat = z.infer<typeof TestFormat>;

export const Actor = z.enum([
  "researcher", "analyst", "procurement", "quality", "ceo", "growth", "cfo", "support", "disputes", "code",
]);
export type Actor = z.infer<typeof Actor>;

export const AgentName = z.enum(["researcher", "analyst", "procurement", "disputes", "support"]);
export type AgentName = z.infer<typeof AgentName>;

// ---------- Test content (written by the Researcher via ops/submit_test) ----------

export const Card = z.object({
  headline: z.string().min(3).max(160),
  subheadline: z.string().min(3).max(300),
  bullets: z.array(z.string().min(3).max(200)).length(3),
  cta: z.string().min(2).max(60),
});
export type Card = z.infer<typeof Card>;

export const ScreeningQuestion = z.object({
  question: z.string().min(5),
  options: z.array(z.string()).min(2).max(6),
  accept: z.array(z.string()).min(1),        // options that qualify a juror
});

export const JurorProfile = z.object({
  panel_description: z.string().min(10).max(400), // ≤ 2 sentences, never the product name
  business_type: z.enum(["b2c", "b2b"]),
  screening_questions: z.array(ScreeningQuestion).min(1).max(2), // Terac launch requires ≥ 1
  filters: z.array(z.object({ slug: z.string(), options: z.array(z.string()).min(1) })).default([]), // specialist only
});
export type JurorProfile = z.infer<typeof JurorProfile>;

// The attention check: one real feature from Card A plus two planted fakes.
// `correct` NEVER leaves the server (strip it before sending a test to the juror page).
export const AttentionCheck = z.object({
  prompt: z.string().default("Which of these was mentioned in the description you just saw?"),
  options: z.array(z.string().min(2)).length(3),
  correct: z.string().min(2),
}).refine((a) => a.options.includes(a.correct), { message: "correct must be one of options" });

export const Questions = z.object({
  attention_check: AttentionCheck,
  specialist: z.boolean().default(false),     // adds would_buy / objections / price_reaction / your_words
});
export type Questions = z.infer<typeof Questions>;

/** What the juror page receives: the test minus anything that would leak the attention answer. */
export const PublicTest = z.object({
  test_id: z.string().uuid(),
  format: TestFormat,
  card_a: Card,
  card_b: Card.nullable(),
  attention: z.object({ prompt: z.string(), options: z.array(z.string()).length(3) }),
  specialist: z.boolean(),
  live: z.boolean(),
});
export type PublicTest = z.infer<typeof PublicTest>;

// ---------- Juror answers (stored in responses.answers) ----------

export const CardAnswers = z.object({
  what_it_does: z.string().min(1).max(2000),  // ≥ JUROR_MIN_WORDS words enforced client + server
  clarity: z.number().int().min(1).max(7),
  would_try: z.number().int().min(1).max(7),
  confusing: z.string().max(2000),
});
export type CardAnswers = z.infer<typeof CardAnswers>;

export const SpecialistAnswers = z.object({
  would_buy: z.enum(["yes", "no", "maybe"]),
  would_buy_why: z.string().max(2000),
  objections: z.string().max(2000),
  price_reaction: z.enum(["low", "fair", "high"]),
  expected_price: z.string().max(100),
  your_words: z.string().max(2000),
});

export const Answers = z.object({
  cards: z.object({ A: CardAnswers, B: CardAnswers.optional() }),
  preferred: z.enum(["A", "B"]).optional(),   // proof / specialist only
  why: z.string().max(2000).optional(),
  attention_choice: z.string(),
  specialist: SpecialistAnswers.optional(),
});
export type Answers = z.infer<typeof Answers>;

/** Free-text answer fields a report quote may be taken from (verbatim substring). */
export const QUOTABLE_FIELDS = [
  "cards.A.what_it_does", "cards.A.confusing", "cards.B.what_it_does", "cards.B.confusing", "why",
  "specialist.would_buy_why", "specialist.objections", "specialist.your_words",
] as const;

/** POST /api/juror/submit body */
export const JurorSubmission = z.object({
  test_id: z.string().uuid(),
  sid: z.string().min(1),                      // Terac submission id
  first_card: z.enum(["A", "B"]),
  started_at: z.number().int(),                // epoch ms when consent was given
  answers: Answers,
});
export type JurorSubmission = z.infer<typeof JurorSubmission>;

// ---------- AI outputs ----------

export const PreviewResult = z.object({
  safety: z.object({ verdict: z.enum(["allow", "refuse"]), reason: z.string() }),
  headline: z.string(),
  weakest_line: z.string(),
  rewrite_suggestion: z.string(),
  recommended_panel: z.string(),
  confidence: z.number().min(0).max(1),
});
export type PreviewResult = z.infer<typeof PreviewResult>;

export const GraderFlag = z.enum(["too_short", "off_topic", "ai_pasted", "attention_fail"]);
export const GraderResult = z.object({
  pass: z.boolean(),
  quality_score: z.number().min(0).max(10),
  reason: z.string(),
  understood_a: z.boolean(),
  understood_b: z.boolean().nullable(),
  flags: z.array(GraderFlag),
});
export type GraderResult = z.infer<typeof GraderResult>;

// ---------- Stats (mirror of SQL view order_stats; numbers come ONLY from SQL) ----------

export const OrderStats = z.object({
  test_id: z.string().uuid(),
  order_id: z.string().uuid(),
  n_approved: z.number().int(),
  prefer_a: z.number().int(),
  prefer_b: z.number().int(),
  clarity_a: z.number().nullable(),
  clarity_b: z.number().nullable(),
  intent_a: z.number().nullable(),
  intent_b: z.number().nullable(),
  understanding_rate_a: z.number().nullable(),
  understanding_rate_b: z.number().nullable(),
});
export type OrderStats = z.infer<typeof OrderStats>;

// ---------- Report (written by the Analyst via ops/submit_report) ----------

export const Quote = z.object({
  response_id: z.string().uuid(),
  text: z.string().min(8),                     // verbatim substring of one QUOTABLE_FIELDS value
  juror_label: z.string().regex(/^Juror \d+$/),
});
export type Quote = z.infer<typeof Quote>;

export const Report = z.object({
  headline_verdict: z.string().min(5),         // "B wins 12 of 15" | "No clear winner" | Quick Read summary
  winner: z.enum(["A", "B", "none"]).nullable(), // null when there was no Card B
  scorecard: z.object({                        // every number must equal order_stats exactly
    n_approved: z.number().int(),
    prefer_a: z.number().int().nullable(),
    prefer_b: z.number().int().nullable(),
    clarity_a: z.number().nullable(),
    clarity_b: z.number().nullable(),
    intent_a: z.number().nullable(),
    intent_b: z.number().nullable(),
    understanding_rate_a: z.number().nullable(),
    understanding_rate_b: z.number().nullable(),
  }),
  top_fixes: z.array(z.object({
    title: z.string().min(3),
    detail: z.string().min(3),
    evidence_quotes: z.array(Quote).min(1),
  })).min(1).max(3),
  winning_copy: Card.nullable(),               // required when card_b exists
  rewritten_headline: z.string().nullable(),   // spark: one untested rewritten headline
  still_unsolved: z.array(z.string()),
  method_caveats: z.string().min(10),          // must contain REPORT_CAVEAT
});
export type Report = z.infer<typeof Report>;

// ---------- Ops API ----------

/** Every /api/ops/* response. Refusals are 4xx with ok:false and a machine-readable code. */
export type OpsResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string };
