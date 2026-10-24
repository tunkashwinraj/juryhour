import { describe, expect, it } from "vitest";
import { Report } from "@/lib/types";
import { JUROR_MIN_WORDS, REPORT_CAVEAT } from "@/lib/constants";
import {
  SAMPLE_REPORT,
  SAMPLE_REPORT_DATA,
  SAMPLE_REPORT_SOURCE,
  SAMPLE_RESPONSES,
} from "../../../content/sample-report";
import { ALL_FAQ, FAQ_GROUPS, faqByIds } from "../../../content/faq";
import { CHANGELOG } from "../../../content/changelog";
import { PICKFU, SOURCES, USERTESTING, WYNTER } from "../../../content/compare";

const round2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0) / xs.length);
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

describe("sample report fixture", () => {
  it("is flagged as an example", () => {
    expect(SAMPLE_REPORT_SOURCE).toBe("example");
  });

  it("passes the Report schema", () => {
    const parsed = Report.safeParse(SAMPLE_REPORT);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe(true);
  });

  it("has a scorecard that matches the juror answers (as order_stats would compute it)", () => {
    const j = SAMPLE_RESPONSES.map((r) => r.juror);
    const sc = SAMPLE_REPORT.scorecard;
    expect(sc.n_approved).toBe(j.length);
    expect(sc.prefer_a).toBe(j.filter((x) => x.answers.preferred === "A").length);
    expect(sc.prefer_b).toBe(j.filter((x) => x.answers.preferred === "B").length);
    expect((sc.prefer_a ?? 0) + (sc.prefer_b ?? 0)).toBe(sc.n_approved);
    expect(sc.clarity_a).toBe(mean(j.map((x) => x.answers.cards.A.clarity)));
    expect(sc.clarity_b).toBe(mean(j.map((x) => x.answers.cards.B!.clarity)));
    expect(sc.intent_a).toBe(mean(j.map((x) => x.answers.cards.A.would_try)));
    expect(sc.intent_b).toBe(mean(j.map((x) => x.answers.cards.B!.would_try)));
    expect(sc.understanding_rate_a).toBe(round2(j.filter((x) => x.understood_a).length / j.length));
    expect(sc.understanding_rate_b).toBe(round2(j.filter((x) => x.understood_b).length / j.length));
    // ReportData.stats mirrors the scorecard
    expect(SAMPLE_REPORT_DATA.stats).toMatchObject({ ...sc });
  });

  it("states the winner and count consistently", () => {
    const sc = SAMPLE_REPORT.scorecard;
    const winner = (sc.prefer_b ?? 0) > (sc.prefer_a ?? 0) ? "B" : "A";
    expect(SAMPLE_REPORT.winner).toBe(winner);
    expect(SAMPLE_REPORT.headline_verdict).toContain(`${Math.max(sc.prefer_a ?? 0, sc.prefer_b ?? 0)} of ${sc.n_approved}`);
    expect(SAMPLE_REPORT.method_caveats).toContain(REPORT_CAVEAT);
    expect(SAMPLE_REPORT.winning_copy).toEqual(SAMPLE_REPORT_DATA.cardB);
  });

  it("quotes jurors verbatim, with matching labels, ≥2 distinct jurors per fix", () => {
    const byId = new Map(SAMPLE_RESPONSES.map((r) => [r.response_id, r.juror]));
    expect(SAMPLE_REPORT.top_fixes).toHaveLength(3);
    for (const fix of SAMPLE_REPORT.top_fixes) {
      const jurors = new Set<number>();
      for (const q of fix.evidence_quotes) {
        const j = byId.get(q.response_id);
        expect(j, `unknown response ${q.response_id}`).toBeDefined();
        expect(q.juror_label).toBe(`Juror ${j!.juror_number}`);
        const a = j!.answers;
        const fields = [a.cards.A.what_it_does, a.cards.A.confusing, a.cards.B?.what_it_does, a.cards.B?.confusing, a.why];
        expect(fields.some((f) => f?.includes(q.text)), `"${q.text}" not verbatim in ${q.juror_label}`).toBe(true);
        jurors.add(j!.juror_number);
      }
      expect(jurors.size).toBeGreaterThanOrEqual(2);
    }
  });

  it("has juror answers that would pass the juror page rules", () => {
    for (const { juror } of SAMPLE_RESPONSES) {
      expect(words(juror.answers.cards.A.what_it_does)).toBeGreaterThanOrEqual(JUROR_MIN_WORDS);
      expect(words(juror.answers.cards.B!.what_it_does)).toBeGreaterThanOrEqual(JUROR_MIN_WORDS);
      for (const c of [juror.answers.cards.A, juror.answers.cards.B!]) {
        expect(c.clarity).toBeGreaterThanOrEqual(1);
        expect(c.clarity).toBeLessThanOrEqual(7);
        expect(c.would_try).toBeGreaterThanOrEqual(1);
        expect(c.would_try).toBeLessThanOrEqual(7);
      }
    }
    const numbers = SAMPLE_RESPONSES.map((r) => r.juror.juror_number);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });
});

describe("FAQ content", () => {
  it("every item has a question and a plain-text aText", () => {
    expect(ALL_FAQ.length).toBeGreaterThan(10);
    for (const i of ALL_FAQ) {
      expect(i.q.trim().length).toBeGreaterThan(5);
      expect(i.q.trim().endsWith("?")).toBe(true);
      expect(typeof i.aText).toBe("string");
      expect(i.aText.trim().length).toBeGreaterThan(20);
    }
  });

  it("has unique ids and the required groups", () => {
    const ids = ALL_FAQ.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(FAQ_GROUPS.map((g) => g.id)).toEqual(["product", "jurors", "privacy", "pricing", "agencies", "agents"]);
    expect(() => faqByIds(["nope"])).toThrow();
  });

  it("never promises a code discount", () => {
    const text = ALL_FAQ.map((i) => i.aText).join(" ").toLowerCase();
    expect(text).not.toMatch(/\b\d+% off\b/);
    expect(faqByIds(["codes"])[0].aText).toMatch(/doesn't change the price/);
  });
});

describe("changelog and compare content", () => {
  it("changelog entries are dated ISO days, newest first", () => {
    for (const e of CHANGELOG) expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("every competitor fact cites a known https source", () => {
    for (const fact of [...Object.values(WYNTER), ...Object.values(PICKFU), ...Object.values(USERTESTING)]) {
      expect(fact.src.length).toBeGreaterThan(0);
      for (const s of fact.src) expect(SOURCES[s].url).toMatch(/^https:\/\//);
    }
  });
});
