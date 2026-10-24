import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { REPORT_CAVEAT } from "@/lib/constants";
import {
  Refusal,
  checkAdsBudget,
  checkLaunch,
  checkPriceChange,
  checkProvenance,
  checkRefund,
  expectedWinner,
  grossMargin,
  marginOk,
  panelSize,
  panelSpec,
  priceFloor,
  productLabelFromUrl,
  proRataRefund,
  unsupportedClaims,
  type ProvenanceInput,
} from "@/lib/guardrails";
import type { OrderStats, Report } from "@/lib/types";
import { CARD_A, CARD_B, answers } from "./helpers/seed";
import { PAGE_TEXT } from "./helpers/mocks";

function refusalCode(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof Refusal) return e.code;
    throw e;
  }
}

describe("panel spec + panel-size rule n = min(jurors, floor(cap/cpi))", () => {
  it("tiers, paid extra jurors, and legacy extra5 / rush", () => {
    expect(panelSpec({ tier: "proof", addons: [], price_usd: 299 })).toMatchObject({ maxJurors: 20, minJurors: 14, costCap: 80, deadlineHours: 8 });
    expect(panelSpec({ tier: "proof", addons: [], price_usd: 334, extra_jurors: 5 })).toMatchObject({ maxJurors: 25, minJurors: 14, costCap: 100 });
    expect(panelSpec({ tier: "launch_pack", addons: ["extra5"], price_usd: 214 })).toMatchObject({ maxJurors: 20, costCap: 80 });
    expect(panelSpec({ tier: "retest", addons: [], price_usd: 59 })).toMatchObject({ format: "proof", maxJurors: 8, minJurors: 6, costCap: 32 });
    expect(panelSpec({ tier: "pulse", addons: ["rush"], price_usd: 58 }).deadlineHours).toBe(2);
    // specialist cap keeps the 30% margin at the quoted price
    const s = panelSpec({ tier: "specialist", addons: [], price_usd: 499 });
    expect(s.costCap).toBeCloseTo(499 * 0.7 - (499 * 0.027 + 0.3), 2);
  });

  it("panelSize", () => {
    expect(panelSize({ maxJurors: 15, costCap: 60, cpi: 4 })).toBe(15);
    expect(panelSize({ maxJurors: 15, costCap: 60, cpi: 5 })).toBe(12);
    expect(panelSize({ maxJurors: 15, costCap: 60, cpi: 12 })).toBe(5);
    expect(panelSize({ maxJurors: 3, costCap: 7, cpi: 2.33 })).toBe(3);
    expect(panelSize({ maxJurors: 3, costCap: 7, cpi: 0 })).toBe(0);
  });

  it("margin math: price − (cpi·n + Whop fee) ≥ 30%·price", () => {
    expect(grossMargin(149, 4, 15)).toBeCloseTo(149 - 60 - (149 * 0.027 + 0.3), 6);
    expect(marginOk(149, 4, 15)).toBe(true);
    expect(marginOk(149, 7, 15)).toBe(false);
    expect(marginOk(11, 7 / 3, 3)).toBe(true); // spark at its full cap still clears the floor
  });
});

describe("checkLaunch refusals", () => {
  // Verdict: 20 jurors (min 14), cap $80, $299.
  const spec = panelSpec({ tier: "proof", addons: [], price_usd: 299 });
  it("ok at the default size", () => expect(checkLaunch({ price: 299, cpi: 4, spec })).toEqual({ n: 20, budget: 80 }));
  it("quote_not_ready", () => expect(refusalCode(() => checkLaunch({ price: 299, cpi: null, spec }))).toBe("quote_not_ready"));
  it("infeasible_cost (3× cap)", () => expect(refusalCode(() => checkLaunch({ price: 299, cpi: 12, spec }))).toBe("infeasible_cost"));
  it("n_out_of_range below min", () => expect(refusalCode(() => checkLaunch({ price: 299, cpi: 4, n: 13, spec }))).toBe("n_out_of_range"));
  it("n_out_of_range above max", () => expect(refusalCode(() => checkLaunch({ price: 299, cpi: 4, n: 21, spec }))).toBe("n_out_of_range"));
  it("n_out_of_range non-integer", () => expect(refusalCode(() => checkLaunch({ price: 299, cpi: 4, n: 14.5, spec }))).toBe("n_out_of_range"));
  it("over_cost_cap", () => expect(refusalCode(() => checkLaunch({ price: 299, cpi: 5, n: 17, spec }))).toBe("over_cost_cap"));
  it("shrinking within the cap is allowed", () => expect(checkLaunch({ price: 299, cpi: 5, n: 16, spec })).toEqual({ n: 16, budget: 80 }));
  it("HALF + credit at full cap with 20 extra jurors still launches", () => {
    const big = panelSpec({ tier: "proof", addons: [], price_usd: 278, extra_jurors: 20 });
    expect(checkLaunch({ price: 278, cpi: 4, spec: big })).toEqual({ n: 40, budget: 160 });
  });
  it("margin_too_low (discounted upgrade price)", () =>
    expect(refusalCode(() => checkLaunch({ price: 80, cpi: 4, spec }))).toBe("margin_too_low"));
  it("budget_below_minimum ($5 Terac minimum)", () => {
    const spark = panelSpec({ tier: "spark", addons: [], price_usd: 11 });
    expect(refusalCode(() => checkLaunch({ price: 11, cpi: 1.5, spec: spark }))).toBe("budget_below_minimum");
  });
});

describe("refund math and policy", () => {
  it("pro-rata price × (requested − approved)/requested", () => {
    expect(proRataRefund(149, 15, 12)).toBe(29.8);
    expect(proRataRefund(49, 10, 8)).toBe(9.8);
    expect(proRataRefund(149, 15, 15)).toBe(0);
    expect(proRataRefund(149, 15, 16)).toBe(0);
  });

  const base = { price: 149, refunded: 0, amount: 50, policy: "support", supportUsed: false, stage: "DELIVERED" as const, paid: true };
  it("ok", () => expect(checkRefund(base)).toBe(50));
  it("amount_exceeds_paid (cap = price − refund_usd)", () => {
    expect(refusalCode(() => checkRefund({ ...base, amount: 150 }))).toBe("amount_exceeds_paid");
    expect(refusalCode(() => checkRefund({ ...base, refunded: 100, amount: 49.01 }))).toBe("amount_exceeds_paid");
    expect(checkRefund({ ...base, refunded: 100, amount: 49 })).toBe(49);
  });
  it("invalid_policy", () => expect(refusalCode(() => checkRefund({ ...base, policy: "goodwill" }))).toBe("invalid_policy"));
  it("support_refund_used (support once per order)", () => expect(refusalCode(() => checkRefund({ ...base, supportUsed: true }))).toBe("support_refund_used"));
  it("invalid_amount", () => expect(refusalCode(() => checkRefund({ ...base, amount: 0 }))).toBe("invalid_amount"));
  it("not_paid", () => expect(refusalCode(() => checkRefund({ ...base, paid: false }))).toBe("not_paid"));
  it("policy_stage_mismatch", () => {
    expect(refusalCode(() => checkRefund({ ...base, policy: "infeasible", stage: "DELIVERED" }))).toBe("policy_stage_mismatch");
    expect(refusalCode(() => checkRefund({ ...base, policy: "failed", stage: "QUOTING" }))).toBe("policy_stage_mismatch");
    expect(refusalCode(() => checkRefund({ ...base, stage: "REFUNDED" }))).toBe("policy_stage_mismatch");
    expect(checkRefund({ ...base, policy: "infeasible", stage: "QUOTING" })).toBe(50);
  });
});

describe("change_price checks", () => {
  const now = new Date("2026-10-24T12:00:00Z");
  // Verdict (proof): base $199, band ±25% = $149.25–$248.75, cost floor ≈ $89.60.
  const row = { base_usd: 199, current_usd: 199, min_usd: 149.25, max_usd: 248.75, last_changed_at: null as string | null };
  it("ok within band", () => expect(checkPriceChange({ tier: "proof", price: 189, row, now })).toBe(189));
  it("outside_price_band", () => {
    expect(refusalCode(() => checkPriceChange({ tier: "proof", price: 149, row, now }))).toBe("outside_price_band");
    expect(refusalCode(() => checkPriceChange({ tier: "proof", price: 249, row, now }))).toBe("outside_price_band");
  });
  it("below_cost_floor (jurorCostCap/0.7 + fees)", () => {
    expect(priceFloor("spark")).toBeGreaterThan(10.5);
    const spark = { base_usd: 11, current_usd: 11, min_usd: 8.25, max_usd: 13.75, last_changed_at: null };
    expect(refusalCode(() => checkPriceChange({ tier: "spark", price: 9, row: spark, now }))).toBe("below_cost_floor");
    expect(priceFloor("proof")).toBe(119.32);
    const lowProof = { ...row, base_usd: 149, min_usd: 111.75, max_usd: 186.25 };
    expect(refusalCode(() => checkPriceChange({ tier: "proof", price: 115, row: lowProof, now }))).toBe("below_cost_floor");
  });
  it("retest: $59 base, floor $48 at its $32 cap", () => {
    const retest = { base_usd: 59, current_usd: 59, min_usd: 44.25, max_usd: 73.75, last_changed_at: null };
    expect(priceFloor("retest")).toBe(48);
    expect(checkPriceChange({ tier: "retest", price: 55, row: retest, now })).toBe(55);
    expect(refusalCode(() => checkPriceChange({ tier: "retest", price: 45, row: retest, now }))).toBe("below_cost_floor");
  });
  it("price_changed_recently (once per 24h per tier)", () => {
    const recent = { ...row, last_changed_at: new Date(now.getTime() - 23 * 3_600_000).toISOString() };
    expect(refusalCode(() => checkPriceChange({ tier: "proof", price: 189, row: recent, now }))).toBe("price_changed_recently");
    const old = { ...row, last_changed_at: new Date(now.getTime() - 25 * 3_600_000).toISOString() };
    expect(checkPriceChange({ tier: "proof", price: 189, row: old, now })).toBe(189);
  });
  it("unknown_tier / no_change", () => {
    expect(refusalCode(() => checkPriceChange({ tier: "specialist", price: 499, row, now }))).toBe("unknown_tier");
    expect(refusalCode(() => checkPriceChange({ tier: "proof", price: 199, row, now }))).toBe("no_change");
  });
  it("retired tiers are not repriced (tier_not_offered)", () => {
    const pulse = { base_usd: 49, current_usd: 49, min_usd: 36.75, max_usd: 61.25, last_changed_at: null };
    expect(refusalCode(() => checkPriceChange({ tier: "pulse", price: 44, row: pulse, now }))).toBe("tier_not_offered");
    expect(refusalCode(() => checkPriceChange({ tier: "launch_pack", price: 189, row: pulse, now }))).toBe("tier_not_offered");
  });
});

describe("ads caps", () => {
  it("≤ $20 per campaign", () => expect(refusalCode(() => checkAdsBudget({ campaignId: "c1", dailyUsd: 21, current: {} }))).toBe("over_campaign_cap"));
  it("≤ $50 total", () => {
    expect(refusalCode(() => checkAdsBudget({ campaignId: "c3", dailyUsd: 15, current: { c1: 20, c2: 20 } }))).toBe("over_total_cap");
    expect(checkAdsBudget({ campaignId: "c2", dailyUsd: 15, current: { c1: 20, c2: 20 } })).toBe(15); // replacing c2's own budget
  });
});

describe("Card B fact check (numbers / brand terms must be on the page)", () => {
  it("accepts a card built only from page facts", () => expect(unsupportedClaims(CARD_B, PAGE_TEXT)).toEqual([]));
  it("flags invented numbers and brands", () => {
    const bad = { ...CARD_B, subheadline: "Join 10,000 sellers. Rated #1 by QuickBooks.", bullets: ["Save 5 hours a week", "Works with ShopifyPOS", "Plans from $12 per month"] as [string, string, string] };
    const terms = unsupportedClaims(bad, PAGE_TEXT);
    expect(terms).toEqual(expect.arrayContaining(["10000", "1", "5", "QuickBooks", "ShopifyPOS"]));
    expect(terms).not.toContain("12");
  });
  it("brand terms that are on the page pass", () => {
    expect(unsupportedClaims({ ...CARD_B, cta: "As used by HubSpot partners" }, PAGE_TEXT)).toEqual([]);
  });
  it("product label from URL", () => {
    expect(productLabelFromUrl("https://www.ledgerly.example/pricing")).toBe("ledgerly");
    expect(productLabelFromUrl(null)).toBeNull();
  });
});

// ---------------------------------------------------------------- provenance

function provenanceFixture() {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const approved = ids.map((id, i) => ({ id, juror_number: i + 1, answers: answers({ preferred: i === 0 ? "A" : "B" }) }));
  const stats: OrderStats = {
    test_id: randomUUID(), order_id: randomUUID(), n_approved: 3, prefer_a: 1, prefer_b: 2,
    clarity_a: 5, clarity_b: 6, intent_a: 4, intent_b: 5, understanding_rate_a: 0.67, understanding_rate_b: 1,
  };
  const q = (i: number, text: string) => ({ response_id: ids[i], text, juror_label: `Juror ${i + 1}` });
  const fix = (title: string) => ({
    title,
    detail: "Say what the product does up front.",
    evidence_quotes: [q(0, "Not sure what tax-ready means"), q(1, "told me exactly what I get")],
  });
  const report: Report = {
    headline_verdict: "No clear winner (2 of 3 preferred B)",
    winner: "none",
    scorecard: { n_approved: 3, prefer_a: 1, prefer_b: 2, clarity_a: 5, clarity_b: 6, intent_a: 4, intent_b: 5, understanding_rate_a: 0.67, understanding_rate_b: 1 },
    top_fixes: [fix("Explain tax-ready"), fix("Lead with the outcome"), fix("Show the price after month one")],
    winning_copy: CARD_B,
    rewritten_headline: null,
    still_unsolved: [],
    method_caveats: `3 ${REPORT_CAVEAT}. Each juror saw the first card for 5 seconds.`,
  };
  const input: ProvenanceInput = { report, format: "proof", hasCardB: true, stats, requestedN: 3, approved };
  return { input, ids };
}

const codes = (i: ProvenanceInput) => checkProvenance(i).map((x) => x.code);

describe("submit_report provenance checker", () => {
  it("valid report → no issues", () => expect(checkProvenance(provenanceFixture().input)).toEqual([]));

  it("fabricated quote → quote_not_verbatim", () => {
    const { input } = provenanceFixture();
    input.report.top_fixes[0].evidence_quotes[0].text = "This product changed my life completely";
    expect(codes(input)).toContain("quote_not_verbatim");
  });

  it("paraphrased quote (one word changed) → refused", () => {
    const { input } = provenanceFixture();
    input.report.top_fixes[1].evidence_quotes[1].text = "told me precisely what I get";
    expect(codes(input)).toContain("quote_not_verbatim");
  });

  it("quote from a response not in this test → quote_unknown_response", () => {
    const { input } = provenanceFixture();
    input.report.top_fixes[0].evidence_quotes[0].response_id = randomUUID();
    expect(codes(input)).toContain("quote_unknown_response");
  });

  it("wrong juror label → quote_wrong_label", () => {
    const { input } = provenanceFixture();
    input.report.top_fixes[0].evidence_quotes[0].juror_label = "Juror 3";
    expect(codes(input)).toContain("quote_wrong_label");
  });

  it("wrong scorecard number → scorecard_mismatch", () => {
    const { input } = provenanceFixture();
    input.report.scorecard.clarity_b = 6.1;
    expect(codes(input)).toContain("scorecard_mismatch");
    const f2 = provenanceFixture().input;
    f2.report.scorecard.understanding_rate_a = null;
    expect(codes(f2)).toContain("scorecard_mismatch");
  });

  it("invented number in the headline → headline_number_mismatch", () => {
    const { input } = provenanceFixture();
    input.report.headline_verdict = "B wins 12 of 15";
    expect(codes(input)).toContain("headline_number_mismatch");
  });

  it("missing caveat → caveat_missing", () => {
    const { input } = provenanceFixture();
    input.report.method_caveats = "Three people looked at it. Results may vary.";
    expect(codes(input)).toContain("caveat_missing");
  });

  it("winner must follow the SQL counts (|A−B| ≤ 1 → none)", () => {
    const { input } = provenanceFixture();
    input.report.winner = "B";
    expect(codes(input)).toContain("winner_mismatch");
    expect(expectedWinner({ prefer_a: 3, prefer_b: 12 })).toBe("B");
    expect(expectedWinner({ prefer_a: 7, prefer_b: 8 })).toBe("none");
  });

  it("winning_copy present iff card_b", () => {
    const a = provenanceFixture().input;
    a.report.winning_copy = null;
    expect(codes(a)).toContain("winning_copy_missing");
    const b = provenanceFixture().input;
    b.hasCardB = false;
    b.format = "pulse";
    b.report.winner = null;
    b.report.top_fixes = b.report.top_fixes.slice(0, 2);
    expect(codes(b)).toContain("winning_copy_unexpected");
    b.report.winning_copy = null;
    expect(codes(b)).toEqual([]);
  });

  it("top_fixes counts per tier: proof exactly 3 with ≥ 2 distinct jurors each", () => {
    const a = provenanceFixture().input;
    a.report.top_fixes = a.report.top_fixes.slice(0, 2);
    expect(codes(a)).toContain("top_fixes_count");
    const b = provenanceFixture().input;
    b.report.top_fixes[2].evidence_quotes = [b.report.top_fixes[2].evidence_quotes[0], { ...b.report.top_fixes[2].evidence_quotes[0] }];
    expect(codes(b)).toContain("fix_needs_two_jurors");
  });

  it("pulse: 1–2 fixes; spark: rewritten_headline required", () => {
    const p = provenanceFixture().input;
    Object.assign(p, { format: "pulse", hasCardB: false });
    p.report.winner = null;
    p.report.winning_copy = null;
    expect(codes(p)).toContain("top_fixes_count");
    const s = provenanceFixture().input;
    Object.assign(s, { format: "spark", hasCardB: false });
    s.report.winner = null;
    s.report.winning_copy = null;
    s.report.top_fixes = [{ ...s.report.top_fixes[0], evidence_quotes: [s.report.top_fixes[0].evidence_quotes[0]] }];
    expect(codes(s)).toContain("rewritten_headline_missing");
    s.report.rewritten_headline = "Tax-ready books from your Etsy sales";
    expect(codes(s)).toEqual([]);
  });

  it("no juror PII", () => {
    const { input } = provenanceFixture();
    input.report.still_unsolved = ["Juror jane@example.com wanted a call"];
    expect(codes(input)).toContain("pii_detected");
  });

  it("CARD_A fixture sanity", () => expect(CARD_A.bullets.length).toBe(3));
});
