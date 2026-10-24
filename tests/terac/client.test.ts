// Terac REST client: request shapes vs the OpenAPI (v2.0.0), typed errors, "not configured", one request per call.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import {
  TeracConflictError,
  TeracError,
  TeracPreconditionError,
  TeracRateLimitError,
  approveSubmission,
  createOpportunity,
  createTestSubmission,
  createWebhookSubscription,
  confirmWebhookSubscription,
  getOpportunity,
  getQuote,
  getTeracContext,
  jurorTaskUrl,
  launchOpportunity,
  listSubmissions,
  rejectSubmission,
  requestQuote,
  stopOpportunity,
  toTeracFilters,
} from "@/lib/terac";
import { TEST_ID } from "./fixtures";

const BASE = "https://terac.com/api/external/v2";
type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body == null ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const sent = (i = 0) => JSON.parse(String(calls[i].init.body));
const hdr = (i = 0) => calls[i].init.headers as Record<string, string>;

beforeEach(() => {
  calls = [];
  process.env.TERAC_API_KEY = "tk_test";
  process.env.TERAC_PROJECT_ID = "proj_1";
  resetEnvCache();
});
afterEach(() => {
  delete process.env.TERAC_API_KEY;
  delete process.env.TERAC_PROJECT_ID;
  resetEnvCache();
  vi.unstubAllGlobals();
});

describe("configuration", () => {
  it("fails with a clear message when TERAC_API_KEY is missing and never calls fetch", async () => {
    delete process.env.TERAC_API_KEY;
    resetEnvCache();
    const f = mockFetch(200, {});
    await expect(getTeracContext()).rejects.toThrow("TERAC_API_KEY is not configured");
    expect(f).not.toHaveBeenCalled();
  });
  it("createOpportunity requires TERAC_PROJECT_ID", async () => {
    delete process.env.TERAC_PROJECT_ID;
    resetEnvCache();
    mockFetch(200, {});
    await expect(
      createOpportunity({
        title: "t", numParticipants: 3, businessType: "b2c", description: "d", feasibilityRequestId: "fr",
        durationMinutes: 2, testId: TEST_ID, screeningQuestions: [], filters: [],
      }),
    ).rejects.toThrow("TERAC_PROJECT_ID is not configured");
  });
});

describe("request shapes", () => {
  it("GET /organizations/current/context with bearer auth", async () => {
    mockFetch(200, { balanceDollars: 123.45, markdown: "", organizationId: "o", organizationName: "n", organizationSlug: "s", dashboard: {} });
    await expect(getTeracContext()).resolves.toEqual({ balanceDollars: 123.45 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/organizations/current/context`);
    expect(calls[0].init.method).toBe("GET");
    expect(hdr().Authorization).toBe("Bearer tk_test");
    expect(calls[0].init.body).toBeUndefined();
  });

  it("POST /feasibility/requests uses camelCase fields", async () => {
    mockFetch(200, { id: "fr_1", status: "RECEIVED", costPerParticipant: null });
    const r = await requestQuote({ taskDescription: "Read and react", panelDescription: "US freelancers", submissionCount: 15, timelineHours: 8 });
    expect(r).toEqual({ id: "fr_1", status: "RECEIVED" });
    expect(calls[0].url).toBe(`${BASE}/feasibility/requests`);
    expect(hdr()["Content-Type"]).toBe("application/json");
    expect(sent()).toEqual({
      taskDescription: "Read and react",
      panelDescription: "US freelancers",
      submissionCount: 15,
      timelineHours: 8,
      payRateFrequency: "ONE_TIME",
    });
  });

  it("GET /feasibility/requests/{id} parses the decimal-string CPI once (no polling)", async () => {
    mockFetch(200, { id: "fr_1", status: "RESPONDED", costPerParticipant: "3.75" });
    await expect(getQuote("fr_1")).resolves.toEqual({ id: "fr_1", status: "RESPONDED", costPerParticipant: 3.75 });
    expect(calls).toHaveLength(1);
    mockFetch(200, { id: "fr_1", status: "RECEIVED", costPerParticipant: null });
    await expect(getQuote("fr_1")).resolves.toMatchObject({ costPerParticipant: null });
  });

  it("POST /opportunities: snake_case, interview task with manual_review, our task URL, mapped screener", async () => {
    mockFetch(200, {
      id: "opp_1", status: "draft",
      pricing: { cost_per_participant_cents: 400, total_cost_cents: 6000, currency: "usd" },
      funding: { affordable: true, draws_on_credit: false, balance_cents: 10000, shortfall_cents: 0, finance_url: null },
    });
    const r = await createOpportunity({
      title: "Quick reaction to a product description",
      numParticipants: 15,
      businessType: "b2c",
      description: "Read a short description and answer questions.",
      feasibilityRequestId: "fr_1",
      durationMinutes: 8,
      testId: TEST_ID,
      screeningQuestions: [{ question: "Do you invoice clients?", options: ["Yes", "No"], accept: ["Yes"] }],
      filters: [],
    });
    expect(r).toEqual({ id: "opp_1", totalCostCents: 6000, costPerParticipantCents: 400, affordable: true });
    const b = sent();
    expect(calls[0].url).toBe(`${BASE}/opportunities`);
    expect(b).toMatchObject({
      title: "Quick reaction to a product description",
      project_id: "proj_1",
      num_participants: 15,
      business_type: "b2c",
      feasibility_request_id: "fr_1",
      expected_days_to_complete: 5,
      device_types: ["desktop", "mobile_ios", "mobile_android"],
      unrestricted_audience: true,
    });
    expect(b).not.toHaveProperty("filters");
    expect(b.tasks).toEqual([
      expect.objectContaining({
        sequence: 1,
        task_type: "interview",
        review_type: "manual_review",
        task_url: `https://juryhour.test/t/${TEST_ID}?sid={TERAC_SUBMISSION_ID}`,
        duration_minutes: 8,
      }),
    ]);
    expect(b.screening_questions).toEqual([
      {
        key: "q0",
        text: "Do you invoice clients?",
        pick: "one",
        answers: [
          { text: "Yes", qualify_logic: "may" },
          { text: "No", qualify_logic: "reject" },
        ],
      },
    ]);
  });

  it("maps specialist filters to Terac operator objects and drops unrestricted_audience", async () => {
    expect(
      toTeracFilters([
        { slug: "multi_select--job_function", options: ["engineering", "product"] },
        { slug: "integer--age", options: ["25", "45"] },
      ]),
    ).toEqual([{ "multi_select--job_function": { $in: ["engineering", "product"] } }, { "integer--age": { $gte: 25, $lte: 45 } }]);
    mockFetch(200, { id: "opp_2", status: "draft", pricing: { cost_per_participant_cents: 900, total_cost_cents: 7200, currency: "usd" }, funding: { affordable: false } });
    const r = await createOpportunity({
      title: "t", numParticipants: 8, businessType: "b2b", description: "d", feasibilityRequestId: "fr_2", durationMinutes: 10,
      testId: TEST_ID, screeningQuestions: [], filters: [{ slug: "multi_select--industry", options: ["software"] }],
    });
    expect(r.affordable).toBe(false);
    expect(sent().filters).toEqual([{ "multi_select--industry": { $in: ["software"] } }]);
    expect(sent()).not.toHaveProperty("unrestricted_audience");
    expect(sent()).not.toHaveProperty("screening_questions");
  });

  it("refuses to report an unpriced draft as $0", async () => {
    mockFetch(200, { id: "opp_3", status: "draft", pricing: null });
    await expect(
      createOpportunity({ title: "t", numParticipants: 3, businessType: "b2c", description: "d", feasibilityRequestId: "f", durationMinutes: 2, testId: TEST_ID, screeningQuestions: [], filters: [] }),
    ).rejects.toMatchObject({ code: "UNPRICED" });
  });

  it("launch sends {} (never a bodyless POST) and without_screener when asked", async () => {
    mockFetch(200, { id: "opp_1", status: "active" });
    await launchOpportunity("opp_1");
    expect(calls[0].url).toBe(`${BASE}/opportunities/opp_1/launch`);
    expect(calls[0].init.method).toBe("POST");
    expect(sent()).toEqual({});
    await launchOpportunity("opp_1", { withoutScreener: true });
    expect(sent(1)).toEqual({ without_screener: true });
  });

  it("getOpportunity returns submission_stats", async () => {
    mockFetch(200, { id: "opp_1", status: "active", submission_stats: { total: 4, in_progress: 1, awaiting_review: 2, approved: 1, rejected: 0 } });
    await expect(getOpportunity("opp_1")).resolves.toEqual({
      id: "opp_1", status: "active", submissionStats: { total: 4, in_progress: 1, awaiting_review: 2, approved: 1, rejected: 0 },
    });
  });

  it("listSubmissions: one page, status filter, never exposes participant PII", async () => {
    mockFetch(200, {
      data: [{ id: "sub_1", status: "awaiting_review", participant_name: "Jane Doe", participant_email: "j@x.com" }],
      pagination: { next_cursor: "c2", has_more: true },
    });
    const r = await listSubmissions("opp_1", "awaiting_review");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/opportunities/opp_1/submissions?limit=100&status=awaiting_review`);
    expect(r).toEqual([{ id: "sub_1", status: "awaiting_review" }]);
  });

  it("approve / reject / stop bodies", async () => {
    mockFetch(200, { id: "sub_1", status: "approved" });
    await approveSubmission("sub_1");
    await rejectSubmission("sub_2", "low_quality", "Answer was 3 words.");
    await stopOpportunity("opp_1", "Panel complete");
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/submissions/sub_1/approve`,
      `${BASE}/submissions/sub_2/reject`,
      `${BASE}/opportunities/opp_1/stop`,
    ]);
    expect(sent(0)).toEqual({});
    expect(sent(1)).toEqual({ rejection_category: "low_quality", rejection_reason: "Answer was 3 words." });
    expect(sent(2)).toEqual({ reason: "Panel complete" });
  });

  it("webhook subscription + sandbox test submission shapes", async () => {
    mockFetch(200, { id: "whs_1", target_url: "https://x.test/api/terac-webhook", event_types: ["submission.status.change"], secret: "whsec_1", confirmed_at: null, is_enabled: true });
    await createWebhookSubscription("https://x.test/api/terac-webhook");
    await confirmWebhookSubscription("whs_1");
    await createTestSubmission("opp_1", { taskCompletion: "redirect" });
    expect(sent(0)).toEqual({ target_url: "https://x.test/api/terac-webhook", event_types: ["submission.status.change"] });
    expect(calls[1].url).toBe(`${BASE}/hooks/subscriptions/whs_1`);
    expect(sent(1)).toEqual({});
    expect(calls[2].url).toBe(`${BASE}/opportunities/opp_1/test-submissions`);
    expect(sent(2)).toEqual({ task_completion: "redirect" });
  });
});

describe("errors", () => {
  it("412 → TeracPreconditionError with Terac's message", async () => {
    mockFetch(412, { code: "PRECONDITION_FAILED", message: "Balance does not cover the launch" });
    const err = await launchOpportunity("opp_1").catch((e) => e);
    expect(err).toBeInstanceOf(TeracPreconditionError);
    expect(err).toBeInstanceOf(TeracError);
    expect(err.status).toBe(412);
    expect(err.message).toContain("Balance does not cover the launch");
  });
  it("409 → TeracConflictError", async () => {
    mockFetch(409, { code: "CONFLICT", message: "Submission is not awaiting review" });
    await expect(approveSubmission("sub_1")).rejects.toBeInstanceOf(TeracConflictError);
  });
  it("429 nested shape → TeracRateLimitError with Retry-After, no retry loop", async () => {
    const f = mockFetch(429, { error: { code: "RATE_LIMITED", message: "Rate limit exceeded. Retry after 42 seconds." } }, { "Retry-After": "42" });
    const err = await getTeracContext().catch((e) => e);
    expect(err).toBeInstanceOf(TeracRateLimitError);
    expect(err.retryAfterSeconds).toBe(42);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("401 nested shape and 400 issues are surfaced", async () => {
    mockFetch(401, { error: { code: "UNAUTHORIZED", message: "Invalid or expired API key" } });
    await expect(getTeracContext()).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    mockFetch(400, { code: "BAD_REQUEST", message: "Input validation failed", issues: [{ message: "Required", path: ["tasks", 0, "task_url"] }] });
    await expect(requestQuote({ taskDescription: "a", panelDescription: "b", submissionCount: 1, timelineHours: 1 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      issues: [{ message: "Required", path: ["tasks", 0, "task_url"] }],
    });
  });
});

describe("jurorTaskUrl", () => {
  it("builds from NEXT_PUBLIC_APP_URL with Terac's {TERAC_SUBMISSION_ID} placeholder", () => {
    expect(jurorTaskUrl(TEST_ID)).toBe(`https://juryhour.test/t/${TEST_ID}?sid={TERAC_SUBMISSION_ID}`);
  });
});
