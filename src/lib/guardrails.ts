// Code-enforced limits (SPEC §2.2, §8, §12). Pure functions: no I/O, no clock reads (callers pass `now`).
// Agents decide *what*; these functions decide *whether it is allowed*. Every refusal is a `Refusal`
// with a machine-readable code that the Ops API returns as { ok:false, code, error }.
import {
  ADDON_EXTRA_JURORS,
  ADS_DAILY_CAP_PER_CAMPAIGN,
  ADS_DAILY_CAP_TOTAL,
  MARGIN_FLOOR,
  PRICE_BAND,
  REPORT_CAVEAT,
  TERAC_MIN_PARTICIPANT_BUDGET,
  TIERS,
  WHOP_FEE,
  type AddonName,
  type TierName,
} from "@/lib/constants";
import { QUOTABLE_FIELDS, type Card, type OrderStats, type Report, type Stage, type TestFormat } from "@/lib/types";

// ---------------------------------------------------------------- refusals

export class Refusal extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: string, message: string, status = 422, details?: unknown) {
    super(message);
    this.name = "Refusal";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function refuse(code: string, message: string, status = 422, details?: unknown): never {
  throw new Refusal(code, message, status, details);
}

export function isRefusal(e: unknown): e is Refusal {
  return e instanceof Refusal;
}

// ---------------------------------------------------------------- money helpers

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const EPS = 1e-6;

// ---------------------------------------------------------------- panel spec per order

export type PanelSpec = {
  format: TestFormat;
  maxJurors: number;
  minJurors: number;
  /** Max total juror spend (USD) for this order. */
  costCap: number;
  minutes: number;
  deadlineHours: number;
};

/**
 * Juror counts and cost cap for an order. `extra5` adds ADDON_EXTRA_JURORS and raises the cap pro rata;
 * `rush` halves the deadline. Specialist has no fixed cap: it is whatever keeps the 30% margin floor
 * at the quoted price (price·(1−MARGIN_FLOOR) − Whop fee).
 */
export function panelSpec(order: { tier: TierName; addons: readonly AddonName[] | null; price_usd: number | null }): PanelSpec {
  const t = TIERS[order.tier];
  const addons = order.addons ?? [];
  const extra = addons.includes("extra5") ? ADDON_EXTRA_JURORS : 0;
  const maxJurors = t.jurors + extra;
  const price = Number(order.price_usd ?? 0);
  const costCap =
    t.jurorCostCap !== null
      ? round2((t.jurorCostCap * maxJurors) / t.jurors)
      : price > 0
        ? round2(price * (1 - MARGIN_FLOOR) - WHOP_FEE(price))
        : 0;
  return {
    format: t.format,
    maxJurors,
    minJurors: t.minJurors,
    costCap,
    minutes: t.minutes,
    deadlineHours: addons.includes("rush") ? t.deadlineHours / 2 : t.deadlineHours,
  };
}

/** SPEC §8 panel-size rule: n = min(jurors, floor(cap / cpi)). */
export function panelSize(i: { maxJurors: number; costCap: number; cpi: number }): number {
  if (!(i.cpi > 0)) return 0;
  return Math.max(0, Math.min(i.maxJurors, Math.floor(i.costCap / i.cpi + EPS)));
}

/** price − (cpi·n + Whop fee) */
export function grossMargin(price: number, cpi: number, n: number): number {
  return price - (cpi * n + WHOP_FEE(price));
}

export function marginOk(price: number, cpi: number, n: number): boolean {
  return grossMargin(price, cpi, n) >= MARGIN_FLOOR * price - EPS;
}

/** Launch checks that need no I/O. Terac balance and "one live panel" are checked by the caller. */
export const COST_REFUSAL_CODES = new Set([
  "infeasible_cost",
  "over_cost_cap",
  "margin_too_low",
  "budget_below_minimum",
  "quote_infeasible",
  "terac_cost_mismatch",
]);

export function checkLaunch(i: { price: number; cpi: number | null; n?: number | null; spec: PanelSpec }): { n: number; budget: number } {
  const { spec } = i;
  const cpi = Number(i.cpi);
  if (!(cpi > 0)) refuse("quote_not_ready", "The Terac quote has no cost per participant yet", 409);
  let n: number;
  if (i.n !== undefined && i.n !== null) {
    if (!Number.isInteger(i.n) || i.n < spec.minJurors || i.n > spec.maxJurors) {
      refuse("n_out_of_range", `n must be an integer in [${spec.minJurors}, ${spec.maxJurors}]`);
    }
    if (cpi * i.n > spec.costCap + EPS) {
      refuse("over_cost_cap", `cpi·n = $${round2(cpi * i.n)} exceeds the juror cost cap $${spec.costCap}`, 422, {
        largest_allowed_n: panelSize({ maxJurors: spec.maxJurors, costCap: spec.costCap, cpi }),
      });
    }
    n = i.n;
  } else {
    n = panelSize({ maxJurors: spec.maxJurors, costCap: spec.costCap, cpi });
    if (n < spec.minJurors) {
      refuse(
        "infeasible_cost",
        `At $${cpi}/juror the cap $${spec.costCap} buys ${n} jurors; the minimum is ${spec.minJurors}`,
        422,
        { cpi, cost_cap: spec.costCap, affordable_n: n, min_jurors: spec.minJurors },
      );
    }
  }
  if (!marginOk(i.price, cpi, n)) {
    refuse(
      "margin_too_low",
      `Margin $${round2(grossMargin(i.price, cpi, n))} is below ${MARGIN_FLOOR * 100}% of $${i.price}`,
      422,
      { margin: round2(grossMargin(i.price, cpi, n)), floor: round2(MARGIN_FLOOR * i.price) },
    );
  }
  const budget = round2(cpi * n);
  if (budget < TERAC_MIN_PARTICIPANT_BUDGET - EPS) {
    refuse("budget_below_minimum", `Launch budget $${budget} is below Terac's $${TERAC_MIN_PARTICIPANT_BUDGET} minimum`);
  }
  return { n, budget };
}

/** Deadline for the panel stage, from payment time. */
export function deadlineFrom(paidAt: Date, spec: Pick<PanelSpec, "deadlineHours">): Date {
  return new Date(paidAt.getTime() + spec.deadlineHours * 3_600_000);
}

// ---------------------------------------------------------------- refunds

export const REFUND_POLICIES = ["infeasible", "short_panel", "failed", "support"] as const;

/** SPEC §8: pro-rata price × (requested − approved) / requested when delivered short. */
export function proRataRefund(price: number, requested: number, approved: number): number {
  if (requested <= 0 || approved >= requested) return 0;
  return round2((price * (requested - Math.max(0, approved))) / requested);
}

export function refundRemaining(price: number, refunded: number): number {
  return round2(Math.max(0, price - refunded));
}

const POLICY_STAGES: Record<(typeof REFUND_POLICIES)[number], readonly Stage[] | "any_paid"> = {
  infeasible: ["QUOTING", "PANEL_LIVE"],
  short_panel: ["PANEL_LIVE", "GRADING", "SYNTHESIZING", "PARTIAL"],
  failed: ["FAILED"],
  support: "any_paid",
};

/** Checks for /api/ops/refund (and code-initiated refunds). Returns the rounded amount. */
export function checkRefund(i: {
  price: number | null;
  refunded: number;
  amount: number;
  policy: string;
  supportUsed: boolean;
  stage: Stage;
  paid: boolean;
}): number {
  if (!(REFUND_POLICIES as readonly string[]).includes(i.policy)) {
    refuse("invalid_policy", `policy must be one of ${REFUND_POLICIES.join(", ")}`, 400);
  }
  if (!i.paid || i.price === null) refuse("not_paid", "The order has no payment to refund", 409);
  const amount = round2(i.amount);
  if (!(amount > 0)) refuse("invalid_amount", "amount must be > 0", 400);
  const remaining = refundRemaining(i.price, i.refunded);
  if (amount > remaining + EPS) {
    refuse("amount_exceeds_paid", `amount $${amount} exceeds the refundable $${remaining} (price − already refunded)`);
  }
  const policy = i.policy as (typeof REFUND_POLICIES)[number];
  if (policy === "support" && i.supportUsed) refuse("support_refund_used", "A support refund was already issued for this order", 409);
  const allowed = POLICY_STAGES[policy];
  if (allowed !== "any_paid" && !allowed.includes(i.stage)) {
    refuse("policy_stage_mismatch", `policy '${policy}' is not allowed in stage ${i.stage}`, 409);
  }
  if (i.stage === "REFUNDED" || i.stage === "CREATED" || i.stage === "BLOCKED") {
    refuse("policy_stage_mismatch", `cannot refund an order in stage ${i.stage}`, 409);
  }
  return amount;
}

// ---------------------------------------------------------------- pricing (CEO)

/** Lowest price that keeps the 30% margin floor with the tier's full juror cost cap and the Whop fee. */
export function priceFloor(tier: TierName): number | null {
  const cap = TIERS[tier].jurorCostCap;
  if (cap === null) return null;
  // p − cap − (0.027p + 0.30) ≥ MARGIN_FLOOR·p  →  p ≥ (cap + 0.30) / (1 − MARGIN_FLOOR − 0.027)
  const fee1 = WHOP_FEE(1) - WHOP_FEE(0); // variable fee rate
  return Math.ceil(((cap + WHOP_FEE(0)) / (1 - MARGIN_FLOOR - fee1)) * 100) / 100;
}

export const PRICE_CHANGE_COOLDOWN_HOURS = 24;

export function checkPriceChange(i: {
  tier: string;
  price: number;
  row: { base_usd: number; current_usd: number; min_usd: number; max_usd: number; last_changed_at: string | null } | null;
  now: Date;
}): number {
  if (!i.row || !(i.tier in TIERS) || TIERS[i.tier as TierName].price === null) {
    refuse("unknown_tier", `tier '${i.tier}' has no adjustable price`, 404);
  }
  const row = i.row;
  const price = round2(i.price);
  if (!(price > 0)) refuse("invalid_price", "price must be > 0", 400);
  const base = Number(row.base_usd);
  const lo = Math.max(round2(base * (1 - PRICE_BAND)), Number(row.min_usd));
  const hi = Math.min(round2(base * (1 + PRICE_BAND)), Number(row.max_usd));
  if (price < lo - EPS || price > hi + EPS) {
    refuse("outside_price_band", `price must be within $${lo}–$${hi} (base $${base} ± ${PRICE_BAND * 100}%)`);
  }
  const floor = priceFloor(i.tier as TierName);
  if (floor !== null && price < floor - EPS) {
    refuse("below_cost_floor", `price $${price} is below the cost floor $${floor} (juror cost cap / 0.7 + fees)`);
  }
  if (Math.abs(price - Number(row.current_usd)) < 0.005) refuse("no_change", "price equals the current price", 409);
  if (row.last_changed_at) {
    const since = i.now.getTime() - new Date(row.last_changed_at).getTime();
    if (since < PRICE_CHANGE_COOLDOWN_HOURS * 3_600_000) {
      refuse("price_changed_recently", `tier '${i.tier}' price changed less than ${PRICE_CHANGE_COOLDOWN_HOURS}h ago`, 429);
    }
  }
  return price;
}

// ---------------------------------------------------------------- ads (Growth)

export function checkAdsBudget(i: { campaignId: string; dailyUsd: number; current: Record<string, number> }): number {
  const daily = round2(i.dailyUsd);
  if (!(daily >= 0)) refuse("invalid_amount", "daily_usd must be ≥ 0", 400);
  if (daily > ADS_DAILY_CAP_PER_CAMPAIGN + EPS) {
    refuse("over_campaign_cap", `daily_usd must be ≤ $${ADS_DAILY_CAP_PER_CAMPAIGN} per campaign`);
  }
  const others = Object.entries(i.current)
    .filter(([id]) => id !== i.campaignId)
    .reduce((s, [, v]) => s + Number(v), 0);
  if (others + daily > ADS_DAILY_CAP_TOTAL + EPS) {
    refuse("over_total_cap", `total daily ads budget would be $${round2(others + daily)}; the cap is $${ADS_DAILY_CAP_TOTAL}`);
  }
  return daily;
}

// ---------------------------------------------------------------- submit_test: Card B fact check

function cardText(c: Card): string {
  return [c.headline, c.subheadline, ...c.bullets, c.cta].join("\n");
}

const normalizeNumber = (s: string) => s.replace(/,/g, "").replace(/\.0+$/, "").replace(/\.$/, "");

function numbersIn(text: string): Set<string> {
  return new Set((text.match(/\d+(?:[.,]\d+)*/g) ?? []).map(normalizeNumber));
}

/** Words that look like names/brands/specific claims: internal capitals (HubSpot, SaaS, AI, iOS),
 *  letter+digit mixes (GPT4, B2B) and ™/® marks. Plain Title Case words are not flagged. */
function brandTermsIn(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.match(/[\p{L}\p{N}][\p{L}\p{N}&'’+.-]*/gu) ?? []) {
    const w = raw.replace(/[.'’-]+$/, "");
    if (w.length < 2) continue;
    if (/^\d+(?:[.,]\d+)*[a-z]{0,3}$/.test(w)) continue; // 24h, 10x, 5min → numbers are checked separately
    const internalCaps = /\p{Lu}/u.test(w.slice(1));
    const letterDigit = /\p{L}/u.test(w) && /\p{N}/u.test(w);
    if (internalCaps || letterDigit) out.add(w);
  }
  for (const m of text.match(/[\p{L}\p{N}]+\s?[™®]/gu) ?? []) out.add(m.replace(/\s?[™®]$/, ""));
  return [...out];
}

/**
 * SPEC §12 submit_test: Card B may not introduce numbers or brand terms absent from the source page text.
 * Returns the offending terms (empty = OK).
 */
export function unsupportedClaims(cardB: Card, sourceText: string): string[] {
  const text = cardText(cardB);
  const src = sourceText.toLowerCase();
  const srcNumbers = numbersIn(sourceText);
  const bad: string[] = [];
  for (const n of numbersIn(text)) if (!srcNumbers.has(n)) bad.push(n);
  for (const term of brandTermsIn(text)) {
    const t = term.toLowerCase();
    const stem = t.endsWith("s") ? t.slice(0, -1) : t;
    if (!src.includes(t) && !(stem.length >= 2 && src.includes(stem))) bad.push(term);
  }
  return [...new Set(bad)];
}

/** Second-level domain label of a URL ("acme" for https://www.acme.com/x), used to keep the product
 *  name out of Terac panel descriptions. Returns null for short/unknown labels. */
export function productLabelFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".");
    const label = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    return label && label.length >= 4 ? label : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- submit_report: provenance checker

export type ProvenanceIssue = { code: string; message: string };

export type ProvenanceInput = {
  report: Report;
  format: TestFormat;
  hasCardB: boolean;
  stats: OrderStats;
  requestedN: number;
  /** approved_responses rows for this test */
  approved: { id: string; juror_number: number; answers: unknown }[];
};

/** Reads a dotted path ("cards.A.what_it_does") from an answers object; non-strings → null. */
export function quotableValue(answers: unknown, path: string): string | null {
  let cur: unknown = answers;
  for (const k of path.split(".")) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "string" ? cur : null;
}

export function isVerbatimQuote(answers: unknown, text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  return QUOTABLE_FIELDS.some((f) => {
    const v = quotableValue(answers, f);
    return v !== null && v.includes(t);
  });
}

const SCORECARD_KEYS = [
  "n_approved", "prefer_a", "prefer_b", "clarity_a", "clarity_b", "intent_a", "intent_b",
  "understanding_rate_a", "understanding_rate_b",
] as const;

/** "B wins" when B leads by ≥ 2, "A" when A leads by ≥ 2, else "none" (rubric: |A−B| ≤ 1 = no clear winner). */
export function expectedWinner(stats: Pick<OrderStats, "prefer_a" | "prefer_b">): "A" | "B" | "none" {
  const d = stats.prefer_b - stats.prefer_a;
  if (d >= 2) return "B";
  if (d <= -2) return "A";
  return "none";
}

function sameNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  return Math.abs(Number(a) - Number(b)) < 1e-9;
}

const EMAIL_RE = /[^\s@<>()"]+@[^\s@<>()"]+\.[a-z]{2,}/i;

/**
 * Every check from SPEC §12 submit_report + CONTRACTS §5. Returns all issues (empty = deliverable),
 * so the Analyst can fix everything in one iteration.
 */
export function checkProvenance(i: ProvenanceInput): ProvenanceIssue[] {
  const issues: ProvenanceIssue[] = [];
  const { report, stats } = i;
  const byId = new Map(i.approved.map((r) => [r.id, r]));

  // 1. Quotes: exist for this test, verbatim, correctly labelled.
  report.top_fixes.forEach((fix, fi) => {
    fix.evidence_quotes.forEach((q, qi) => {
      const where = `top_fixes[${fi}].evidence_quotes[${qi}]`;
      const r = byId.get(q.response_id);
      if (!r) {
        issues.push({ code: "quote_unknown_response", message: `${where}: response_id ${q.response_id} is not an approved response of this test` });
        return;
      }
      if (!isVerbatimQuote(r.answers, q.text)) {
        issues.push({ code: "quote_not_verbatim", message: `${where}: text is not a verbatim substring of that juror's answers` });
      }
      if (q.juror_label !== `Juror ${r.juror_number}`) {
        issues.push({ code: "quote_wrong_label", message: `${where}: juror_label must be "Juror ${r.juror_number}", got "${q.juror_label}"` });
      }
    });
  });

  // 2. Scorecard == order_stats exactly.
  for (const k of SCORECARD_KEYS) {
    const got = report.scorecard[k];
    const want = stats[k];
    // Without Card B the A/B preference counts are 0 in SQL; the report may show them as null.
    const naPreference = !i.hasCardB && (k === "prefer_a" || k === "prefer_b") && got === null && want === 0;
    if (!naPreference && !sameNumber(got, want)) {
      issues.push({ code: "scorecard_mismatch", message: `scorecard.${k} is ${String(got)}; order_stats says ${String(want)}` });
    }
  }

  // 3. Headline numbers must be SQL numbers.
  const allowed = new Set<number>([stats.n_approved, stats.prefer_a, stats.prefer_b, i.requestedN, Math.abs(stats.prefer_a - stats.prefer_b)]);
  for (const k of SCORECARD_KEYS) {
    const v = stats[k];
    if (typeof v === "number") {
      allowed.add(v);
      if (k.startsWith("understanding_rate")) {
        allowed.add(Math.round(v * 100)); // "80%"
        allowed.add(Math.round(v * stats.n_approved)); // "8 of 10 understood"
      }
    }
  }
  for (const m of report.headline_verdict.match(/\d+(?:\.\d+)?/g) ?? []) {
    if (![...allowed].some((a) => Math.abs(a - Number(m)) < 1e-9)) {
      issues.push({ code: "headline_number_mismatch", message: `headline_verdict number ${m} is not a value from order_stats` });
    }
  }

  // 4. Winner and winning copy follow Card B.
  if (i.hasCardB) {
    const w = expectedWinner(stats);
    if (report.winner !== w) {
      issues.push({ code: "winner_mismatch", message: `winner must be "${w}" (A ${stats.prefer_a} vs B ${stats.prefer_b}; |A−B| ≤ 1 is "none")` });
    }
    if (!report.winning_copy) issues.push({ code: "winning_copy_missing", message: "winning_copy is required when the test has Card B" });
  } else {
    if (report.winner !== null) issues.push({ code: "winner_mismatch", message: "winner must be null when the test has no Card B" });
    if (report.winning_copy !== null) issues.push({ code: "winning_copy_unexpected", message: "winning_copy must be null when the test has no Card B" });
  }

  // 5. Fix counts per format.
  const fixes = report.top_fixes;
  const distinct = (f: (typeof fixes)[number]) => new Set(f.evidence_quotes.map((q) => q.response_id)).size;
  if (i.format === "proof" || i.format === "specialist") {
    if (fixes.length !== 3) issues.push({ code: "top_fixes_count", message: `${i.format} reports need exactly 3 top_fixes (got ${fixes.length})` });
    fixes.forEach((f, fi) => {
      if (distinct(f) < 2) issues.push({ code: "fix_needs_two_jurors", message: `top_fixes[${fi}] needs quotes from ≥ 2 distinct jurors` });
    });
  } else if (i.format === "pulse") {
    if (fixes.length < 1 || fixes.length > 2) issues.push({ code: "top_fixes_count", message: `pulse reports need 1–2 top_fixes (got ${fixes.length})` });
    fixes.forEach((f, fi) => {
      if (distinct(f) < 2) issues.push({ code: "fix_needs_two_jurors", message: `top_fixes[${fi}] needs quotes from ≥ 2 distinct jurors` });
    });
  } else {
    // spark: short report — one critique backed by real answers + one rewritten headline (SPEC §9)
    if (!report.rewritten_headline || report.rewritten_headline.trim().length < 3) {
      issues.push({ code: "rewritten_headline_missing", message: "spark reports need rewritten_headline" });
    }
  }

  // 6. Caveat.
  if (!report.method_caveats.toLowerCase().includes(REPORT_CAVEAT.toLowerCase())) {
    issues.push({ code: "caveat_missing", message: `method_caveats must contain "${REPORT_CAVEAT}"` });
  }

  // 7. No juror PII (emails) anywhere in the report.
  if (EMAIL_RE.test(JSON.stringify(report))) {
    issues.push({ code: "pii_detected", message: "the report contains an email address; jurors must stay anonymous" });
  }
  return issues;
}
