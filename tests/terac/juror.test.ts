// getPublicTest + POST /api/juror/submit + GET /api/juror/test/[testId] against an in-memory db.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fakeDb";
import { ORDER_ID, PANEL_ID, TEST_ID, cardAnswers, panelRow, questions, submission, testRow } from "./fixtures";

const h = vi.hoisted(() => ({ fake: null as unknown as FakeDb, logEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/db", () => ({ db: () => h.fake, logEvent: h.logEvent }));

const { getPublicTest } = await import("@/lib/juror");
const { POST: submit } = await import("@/app/api/juror/submit/route");
const { GET: getTest } = await import("@/app/api/juror/test/[testId]/route");
const rules = await import("@/app/t/rules");

const CALLBACK = "https://terac.com/api/external/callback";

function post(body: unknown) {
  return submit(new Request("https://juryhour.test/api/juror/submit", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
  h.fake = new FakeDb().seed("tests", [testRow()]).seed("panels", [panelRow()]);
  h.logEvent.mockClear();
});

describe("getPublicTest", () => {
  it("never leaks the attention-check answer", async () => {
    const t = await getPublicTest(TEST_ID);
    expect(t).not.toBeNull();
    expect(JSON.stringify(t)).not.toContain("correct");
    expect(t!.attention).toEqual({ prompt: questions.attention_check.prompt, options: questions.attention_check.options });
    expect(t).toMatchObject({ test_id: TEST_ID, format: "proof", live: true, specialist: false });
    expect(t!.card_b).not.toBeNull();
  });

  it("live reflects the latest panel only", async () => {
    h.fake.seed("panels", [panelRow({ id: "44444444-4444-4444-8444-444444444444", status: "stopped", created_at: "2026-10-24T11:00:00.000Z" })]);
    expect((await getPublicTest(TEST_ID))!.live).toBe(false);
  });

  it("not live without a panel; spark/pulse never expose card B; unknown/invalid ids → null", async () => {
    h.fake = new FakeDb().seed("tests", [testRow({ format: "pulse", card_b: null })]);
    const t = await getPublicTest(TEST_ID);
    expect(t).toMatchObject({ live: false, card_b: null, format: "pulse" });
    expect(await getPublicTest("33333333-0000-4000-8000-000000000000")).toBeNull();
    expect(await getPublicTest("not-a-uuid")).toBeNull();
  });

  it("GET /api/juror/test/[testId] returns the bare PublicTest without `correct`", async () => {
    const res = await getTest(new Request("https://juryhour.test"), { params: Promise.resolve({ testId: TEST_ID }) });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('"correct"');
    expect(JSON.parse(text)).toMatchObject({ test_id: TEST_ID, live: true });
    const missing = await getTest(new Request("https://juryhour.test"), { params: Promise.resolve({ testId: "nope" }) });
    expect(missing.status).toBe(404);
  });
});

describe("POST /api/juror/submit", () => {
  it("stores the response (decision null) and redirects with result=completed", async () => {
    const res = await post(submission());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, redirect: `${CALLBACK}?teracSubmissionId=sub_abc123&result=completed` });
    const rows = h.fake.rows("responses");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      test_id: TEST_ID,
      panel_id: PANEL_ID,
      terac_submission_id: "sub_abc123",
      first_card: "B",
      attention_passed: true,
      decision: null,
    });
    expect(rows[0].seconds_spent).toBeGreaterThanOrEqual(119);
    expect(h.logEvent).toHaveBeenCalledWith(expect.objectContaining({ order_id: ORDER_ID, action: "juror_response_received" }));
  });

  it("failed attention check → stored with attention_passed=false, result=rejected", async () => {
    const res = await post(submission({}, { attention_choice: "Free pizza on Fridays" }));
    expect((await res.json()).redirect).toBe(`${CALLBACK}?teracSubmissionId=sub_abc123&result=rejected`);
    expect(h.fake.rows("responses")[0].attention_passed).toBe(false);
  });

  it("under JUROR_MIN_SECONDS → result=rejected", async () => {
    const res = await post(submission({ started_at: Date.now() - 30_000 }));
    expect((await res.json()).redirect).toContain("result=rejected");
    expect(h.fake.rows("responses")[0].seconds_spent).toBeLessThan(60);
  });

  it("enforces the word minimum server-side (both cards)", async () => {
    let res = await post(submission({}, { cards: { A: cardAnswers(14), B: cardAnswers() } }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("too_few_words");
    res = await post(submission({}, { cards: { A: cardAnswers(), B: { ...cardAnswers(), what_it_does: "!!! ??? ... " + "a ".repeat(5) } } }));
    expect((await res.json()).code).toBe("too_few_words");
    expect(h.fake.rows("responses")).toHaveLength(0);
  });

  it("duplicate sid → ok, duplicate:true, completed redirect, no second row", async () => {
    await post(submission({}, { attention_choice: "Free pizza on Fridays" }));
    const res = await post(submission());
    expect(await res.json()).toEqual({ ok: true, duplicate: true, redirect: `${CALLBACK}?teracSubmissionId=sub_abc123&result=completed` });
    expect(h.fake.rows("responses")).toHaveLength(1);
  });

  it("duplicate even after the panel stopped still redirects as completed", async () => {
    await post(submission());
    h.fake.tables.panels[0].status = "stopped";
    expect(await (await post(submission())).json()).toMatchObject({ duplicate: true });
  });

  it("unique-violation race on insert is treated as duplicate", async () => {
    // A concurrent request inserted the row after our duplicate lookup ran.
    h.fake.seed("responses", [{ terac_submission_id: "sub_abc123" }]);
    const orig = h.fake.from.bind(h.fake);
    h.fake.from = (t: string) => {
      const q = orig(t);
      if (t === "responses") Object.assign(q, { maybeSingle: async () => ({ data: null, error: null }) });
      return q;
    };
    const res = await post(submission());
    expect(await res.json()).toEqual({ ok: true, duplicate: true, redirect: `${CALLBACK}?teracSubmissionId=sub_abc123&result=completed` });
    expect(h.fake.rows("responses")).toHaveLength(1);
  });

  it("panel not live → 409, nothing stored", async () => {
    h.fake.tables.panels[0].status = "stopped";
    const res = await post(submission());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("test_not_live");
    expect(h.fake.rows("responses")).toHaveLength(0);
  });

  it("unknown test → 404; invalid body → 400; placeholder sid → 400", async () => {
    expect((await post(submission({ test_id: "55555555-5555-4555-8555-555555555555" }))).status).toBe(404);
    expect((await post({ hello: "world" })).status).toBe(400);
    const res = await post(submission({ sid: "{TERAC_SUBMISSION_ID}" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_sid");
  });

  it("validates shape against the format", async () => {
    // proof test without card B answers
    let res = await post(submission({}, { cards: { A: cardAnswers() } }));
    expect((await res.json()).code).toBe("missing_card_b");
    // spark/pulse test with card B answers
    h.fake = new FakeDb().seed("tests", [testRow({ format: "pulse", card_b: null })]).seed("panels", [panelRow()]);
    res = await post(submission({ first_card: "A" }));
    expect((await res.json()).code).toBe("unexpected_card_b");
    // attention choice must be one of the options
    res = await post(submission({ first_card: "A" }, { cards: { A: cardAnswers() }, preferred: undefined, why: undefined, attention_choice: "made up" }));
    expect((await res.json()).code).toBe("invalid_attention_choice");
    // valid pulse submission
    res = await post(submission({ first_card: "A" }, { cards: { A: cardAnswers() }, preferred: undefined, why: undefined }));
    expect(await res.json()).toMatchObject({ ok: true });
    expect(h.fake.rows("responses")[0].first_card).toBe("A");
  });

  it("specialist tests require specialist answers", async () => {
    h.fake = new FakeDb()
      .seed("tests", [testRow({ format: "specialist", questions: { ...questions, specialist: true } })])
      .seed("panels", [panelRow()]);
    let res = await post(submission());
    expect((await res.json()).code).toBe("missing_specialist");
    res = await post(
      submission({}, {
        specialist: { would_buy: "maybe", would_buy_why: "Depends on price", objections: "Setup time", price_reaction: "fair", expected_price: "$20/mo", your_words: "Chasing late invoices" },
      }),
    );
    expect(await res.json()).toMatchObject({ ok: true, redirect: expect.stringContaining("result=completed") });
  });

  it("Terac demo redirect ids are answered but never stored", async () => {
    const res = await post(submission({ sid: "demo_abc" }));
    expect(await res.json()).toMatchObject({ ok: true, demo: true, redirect: `${CALLBACK}?teracSubmissionId=demo_abc&result=completed` });
    expect(h.fake.rows("responses")).toHaveLength(0);
  });

  it("db failure → 500 with a retryable message", async () => {
    h.fake.failNext = { table: "responses", message: "connection reset" };
    const res = await post(submission());
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("internal");
  });
});

describe("rules", () => {
  it("countWords ignores punctuation-only tokens", () => {
    expect(rules.countWords("  It helps   freelancers get paid — on time!  ")).toBe(7);
    expect(rules.countWords("")).toBe(0);
  });
  it("pickSid accepts sid, teracSubmissionId, submissionId and rejects placeholders", () => {
    expect(rules.pickSid({ sid: "a1" })).toBe("a1");
    expect(rules.pickSid({ teracSubmissionId: "b2" })).toBe("b2");
    expect(rules.pickSid({ submissionId: "c3" })).toBe("c3");
    expect(rules.pickSid({ sid: "{TERAC_SUBMISSION_ID}", teracSubmissionId: "real_1" })).toBe("real_1");
    expect(rules.pickSid({ sid: "" })).toBeNull();
    expect(rules.pickSid({})).toBeNull();
  });
  it("shuffle keeps every option", () => {
    const opts = questions.attention_check.options;
    expect(rules.shuffle(opts, () => 0).sort()).toEqual([...opts].sort());
  });
});
