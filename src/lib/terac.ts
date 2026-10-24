// Terac External API v2 client (SPEC §11.2, CONTRACTS §3 C).
// Verified against https://terac.com/docs/developers/openapi.json (v2.0.0) — see docs/discrepancies/terac.md.
//
// Rules:
// - One HTTP request per exported call. Never loop/poll here: a key gets 100 requests, then is refused
//   until 60s pass with no accepted request. The reconciler + webhooks drive progress.
// - Field casing is mixed in Terac's API: feasibility uses camelCase, everything else snake_case.
// - Every POST sends a JSON body (`{}` when empty); a bodyless POST returns 415.
// - Server-only (reads secrets).
import { createHmac, timingSafeEqual } from "node:crypto";
import { env, need } from "@/lib/env";
import type { JurorProfile } from "@/lib/types";

export const TERAC_API_BASE = "https://terac.com/api/external/v2";
export const TERAC_SIGNATURE_HEADER = "X-Terac-Request-Signature";
export const TERAC_TIMESTAMP_HEADER = "X-Terac-Request-Timestamp";
export const TERAC_EVENT_ID_HEADER = "X-Event-ID";
export const TERAC_WEBHOOK_MAX_AGE_SECONDS = 300;
/** Event types we subscribe to. `submission.approved` is omitted on purpose: it duplicates the
 *  `submission.status.change` (to=approved) delivery with a different X-Event-ID. */
export const TERAC_EVENT_TYPES = ["submission.status.change"] as const;
const REQUEST_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------- errors

/** Any non-2xx from Terac. `code` is the Terac error code (BAD_REQUEST, CONFLICT, ...). */
export class TeracError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly issues: { message: string; path?: (string | number)[] }[] = [],
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "TeracError";
  }
}
/** 412 PRECONDITION_FAILED: balance, screener, $5 minimum or unanswered quote (launch), failed ping (confirm). */
export class TeracPreconditionError extends TeracError {
  constructor(message: string, status: number, code: string, issues: TeracError["issues"] = []) {
    super(message, status, code, issues);
    this.name = "TeracPreconditionError";
  }
}
/** 409 CONFLICT: wrong state (launch a non-draft, approve a non-awaiting submission, URL already subscribed). */
export class TeracConflictError extends TeracError {
  constructor(message: string, status: number, code: string, issues: TeracError["issues"] = []) {
    super(message, status, code, issues);
    this.name = "TeracConflictError";
  }
}
/** 429 RATE_LIMITED. Wait `retryAfterSeconds`; never retry in a loop here. */
export class TeracRateLimitError extends TeracError {
  constructor(message: string, retryAfterSeconds: number | null) {
    super(message, 429, "RATE_LIMITED", [], retryAfterSeconds);
    this.name = "TeracRateLimitError";
  }
}
/** Webhook rejected before processing (bad/missing signature, stale timestamp, unparsable body). */
export class TeracWebhookError extends Error {
  constructor(
    message: string,
    readonly reason: "missing_headers" | "stale" | "bad_signature" | "bad_payload",
  ) {
    super(message);
    this.name = "TeracWebhookError";
  }
}

// ---------------------------------------------------------------- transport

type Json = Record<string, unknown>;

async function teracRequest<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: Json): Promise<T> {
  const key = need("TERAC_API_KEY");
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  const init: RequestInit = { method, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  if (method === "POST" || method === "PATCH") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body ?? {});
  }
  const res = await fetch(`${TERAC_API_BASE}${path}`, init);
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) throw toTeracError(res, parsed, text, `${method} ${path}`);
  return parsed as T;
}

function toTeracError(res: Response, body: unknown, text: string, what: string): TeracError {
  // Two shapes: operation errors are flat { code, message, issues? }; key-check errors nest under `error`.
  const b = (body ?? {}) as { code?: string; message?: string; issues?: TeracError["issues"]; error?: { code?: string; message?: string } };
  const code = b.code ?? b.error?.code ?? `HTTP_${res.status}`;
  const detail = b.message ?? b.error?.message ?? (text.slice(0, 300) || res.statusText);
  const issues = Array.isArray(b.issues) ? b.issues : [];
  const msg = `Terac ${what} failed (${res.status} ${code}): ${detail}`;
  if (res.status === 412) return new TeracPreconditionError(msg, res.status, code, issues);
  if (res.status === 409) return new TeracConflictError(msg, res.status, code, issues);
  if (res.status === 429) {
    const ra = Number(res.headers.get("Retry-After"));
    return new TeracRateLimitError(msg, Number.isFinite(ra) && ra > 0 ? ra : null);
  }
  return new TeracError(msg, res.status, code, issues);
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------- organization

export async function getTeracContext(): Promise<{ balanceDollars: number }> {
  const r = await teracRequest<{ balanceDollars: number }>("GET", "/organizations/current/context");
  return { balanceDollars: Number(r.balanceDollars) };
}

// ---------------------------------------------------------------- feasibility (quote)

type FeasibilityResponse = {
  id: string;
  status: "RECEIVED" | "RESPONDED" | "WON" | "LOST" | "NOT_PURSUED" | string;
  costPerParticipant: string | null; // decimal string, all-in USD per participant
};

/** POST /feasibility/requests. Never put the product name in the descriptions (SPEC §21). */
export async function requestQuote(i: {
  taskDescription: string;
  panelDescription: string;
  submissionCount: number;
  timelineHours: number;
  loiMinutes?: number;
}): Promise<{ id: string; status: string }> {
  const body: Json = {
    taskDescription: i.taskDescription,
    panelDescription: i.panelDescription,
    submissionCount: Math.max(1, Math.round(i.submissionCount)),
    timelineHours: Math.max(1, Math.round(i.timelineHours)),
    payRateFrequency: "ONE_TIME", // we pay per completed juror
  };
  if (i.loiMinutes) body.loiMinutes = Math.max(1, Math.round(i.loiMinutes));
  const r = await teracRequest<FeasibilityResponse>("POST", "/feasibility/requests", body);
  return { id: r.id, status: r.status };
}

/** GET /feasibility/requests/{id}. One call; the reconciler decides when to look again. */
export async function getQuote(id: string): Promise<{ id: string; status: string; costPerParticipant: number | null }> {
  const r = await teracRequest<FeasibilityResponse>("GET", `/feasibility/requests/${enc(id)}`);
  const cpi = r.costPerParticipant == null ? null : Number.parseFloat(r.costPerParticipant);
  return { id: r.id, status: r.status, costPerParticipant: cpi != null && Number.isFinite(cpi) ? cpi : null };
}

// ---------------------------------------------------------------- opportunities

type OpportunityResponse = {
  id: string;
  status: string;
  pricing: { cost_per_participant_cents: number; total_cost_cents: number; currency: string } | null;
  funding?: { affordable: boolean; draws_on_credit: boolean; balance_cents: number; shortfall_cents: number } | null;
  submission_stats?: Record<string, number> | null;
};

/** Our juror-profile screening question → Terac single-select with reject on non-accepted answers. */
export function toTeracScreeningQuestions(qs: JurorProfile["screening_questions"]) {
  return qs.map((q, n) => ({
    key: `q${n}`,
    text: q.question,
    pick: "one" as const,
    // On pick "one" may/must collapse to the same qualifying disposition; only "reject" screens out.
    answers: q.options.map((o) => ({ text: o, qualify_logic: q.accept.includes(o) ? ("may" as const) : ("reject" as const) })),
  }));
}

/** Our `{slug, options}` filters → Terac Mongo-style `{ "<type>--<attr>": { $op: ... } }` filters. */
export function toTeracFilters(fs: JurorProfile["filters"]) {
  return fs.map((f) => {
    if (f.slug.startsWith("integer--")) {
      // options = [min, max]; either may be empty
      const [min, max] = f.options.map((o) => (o.trim() === "" ? null : Number(o)));
      const op: Record<string, number> = {};
      if (min != null && Number.isFinite(min)) op.$gte = min;
      if (max != null && Number.isFinite(max)) op.$lte = max;
      return { [f.slug]: op };
    }
    return { [f.slug]: { $in: f.options } };
  });
}

/** Absolute task URL handed to Terac. `{TERAC_SUBMISSION_ID}` is Terac's documented placeholder; Terac
 *  also appends `teracSubmissionId`, `submissionId` and `taskId` itself. */
export function jurorTaskUrl(testId: string): string {
  const base = env().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  return `${base}/t/${enc(testId)}?sid={TERAC_SUBMISSION_ID}`;
}

export function buildOpportunityBody(i: {
  title: string;
  numParticipants: number;
  businessType: "b2c" | "b2b";
  description: string;
  feasibilityRequestId: string;
  durationMinutes: number;
  testId: string;
  screeningQuestions: JurorProfile["screening_questions"];
  filters: JurorProfile["filters"];
  projectId: string;
}): Json {
  const body: Json = {
    title: i.title.slice(0, 200),
    description: i.description.slice(0, 8000),
    project_id: i.projectId,
    num_participants: i.numParticipants,
    business_type: i.businessType,
    feasibility_request_id: i.feasibilityRequestId,
    customer_screening_review: "auto_invite",
    expected_days_to_complete: 5, // OpenAPI minimum (SPEC said 1)
    device_types: ["desktop", "mobile_ios", "mobile_android"],
    tasks: [
      {
        sequence: 1,
        task_type: "interview", // "a page where they do the work and submit it" (SPEC said "activity", which discards work)
        review_type: "manual_review", // the completion callback never pays; we approve/reject via API
        task_url: jurorTaskUrl(i.testId),
        title: "Read a short description and answer a few questions",
        description: "Read a short product description, then answer a few questions about it in your own words.",
        duration_minutes: Math.max(1, Math.round(i.durationMinutes)),
      },
    ],
  };
  if (i.screeningQuestions.length) body.screening_questions = toTeracScreeningQuestions(i.screeningQuestions);
  // A create with neither filters nor unrestricted_audience is rejected; the base audience is US 18+.
  if (i.filters.length) body.filters = toTeracFilters(i.filters);
  else body.unrestricted_audience = true;
  return body;
}

/** POST /opportunities (draft). Throws TeracError code "UNPRICED" if Terac returns no pricing. */
export async function createOpportunity(i: {
  title: string;
  numParticipants: number;
  businessType: "b2c" | "b2b";
  description: string;
  feasibilityRequestId: string;
  durationMinutes: number;
  testId: string;
  screeningQuestions: JurorProfile["screening_questions"];
  filters: JurorProfile["filters"];
}): Promise<{ id: string; totalCostCents: number; affordable: boolean; costPerParticipantCents: number }> {
  const projectId = need("TERAC_PROJECT_ID");
  const r = await teracRequest<OpportunityResponse>("POST", "/opportunities", buildOpportunityBody({ ...i, projectId }));
  if (!r.pricing) {
    // Never report $0 cost: it would pass every margin check. The draft exists; caller may delete or retry.
    throw new TeracError(`Terac opportunity ${r.id} was created without pricing`, 200, "UNPRICED");
  }
  return {
    id: r.id,
    totalCostCents: r.pricing.total_cost_cents,
    costPerParticipantCents: r.pricing.cost_per_participant_cents,
    affordable: r.funding?.affordable ?? false,
  };
}

/** POST /opportunities/{id}/launch. 412 → TeracPreconditionError (balance, screener, $5 min, quote). */
export async function launchOpportunity(id: string, opts: { withoutScreener?: boolean } = {}): Promise<void> {
  await teracRequest("POST", `/opportunities/${enc(id)}/launch`, opts.withoutScreener ? { without_screener: true } : {});
}

export async function getOpportunity(id: string): Promise<{ id: string; status: string; submissionStats: Record<string, number> }> {
  const r = await teracRequest<OpportunityResponse>("GET", `/opportunities/${enc(id)}`);
  return { id: r.id, status: r.status, submissionStats: r.submission_stats ?? {} };
}

/** One page (newest first, up to 100). Participant names/emails are deliberately not returned. */
export async function listSubmissions(opportunityId: string, status?: string): Promise<{ id: string; status: string }[]> {
  const q = new URLSearchParams({ limit: "100" });
  if (status) q.set("status", status);
  const r = await teracRequest<{ data: { id: string; status: string }[] }>(
    "GET",
    `/opportunities/${enc(opportunityId)}/submissions?${q.toString()}`,
  );
  return (r.data ?? []).map((s) => ({ id: s.id, status: s.status }));
}

export async function getSubmission(id: string): Promise<{ id: string; status: string; opportunityId: string }> {
  const r = await teracRequest<{ id: string; status: string; opportunity_id: string }>("GET", `/submissions/${enc(id)}`);
  return { id: r.id, status: r.status, opportunityId: r.opportunity_id };
}

/** Pays the juror. 409 if the submission is not awaiting_review. */
export async function approveSubmission(id: string): Promise<void> {
  await teracRequest("POST", `/submissions/${enc(id)}/approve`, {});
}

export async function rejectSubmission(
  id: string,
  category: "low_quality" | "failed_instructions" | "incomplete" | "suspicious_patterns" | "other",
  reason: string,
): Promise<void> {
  await teracRequest("POST", `/submissions/${enc(id)}/reject`, { rejection_category: category, rejection_reason: reason });
}

/** Ends the opportunity and refunds unused budget. Pending awaiting_review submissions block it (409). */
export async function stopOpportunity(id: string, reason: string): Promise<void> {
  await teracRequest("POST", `/opportunities/${enc(id)}/stop`, { reason: reason.slice(0, 5000) });
}

/** Sandbox orgs only (403 elsewhere): a fake participant walks the opportunity and fires real webhooks. */
export async function createTestSubmission(
  opportunityId: string,
  opts: { screeningOutcome?: "passed" | "failed" | "filtered_out"; taskCompletion?: "automatic" | "redirect" } = {},
): Promise<{ id: string; taskUrl: string | null }> {
  const body: Json = {};
  if (opts.screeningOutcome) body.screening_outcome = opts.screeningOutcome;
  if (opts.taskCompletion) body.task_completion = opts.taskCompletion;
  const r = await teracRequest<{ id: string; task_url: string | null }>(
    "POST",
    `/opportunities/${enc(opportunityId)}/test-submissions`,
    body,
  );
  return { id: r.id, taskUrl: r.task_url };
}

// ---------------------------------------------------------------- webhook subscriptions (setup script)

type Subscription = { id: string; target_url: string; event_types: string[]; is_enabled: boolean; confirmed_at: string | null };

export async function createWebhookSubscription(targetUrl: string, eventTypes: readonly string[] = TERAC_EVENT_TYPES) {
  return teracRequest<Subscription & { secret: string }>("POST", "/hooks/subscriptions", {
    target_url: targetUrl,
    event_types: [...eventTypes],
  });
}
export async function listWebhookSubscriptions() {
  return (await teracRequest<{ data: Subscription[] }>("GET", "/hooks/subscriptions")).data ?? [];
}
/** Terac POSTs a signed `webhook.ping` to the target; non-2xx → 412 (TeracPreconditionError). */
export async function confirmWebhookSubscription(id: string) {
  return teracRequest<Subscription>("POST", `/hooks/subscriptions/${enc(id)}`, {});
}
export async function getWebhookSubscriptionSecret(id: string): Promise<string> {
  return (await teracRequest<{ secret: string }>("GET", `/hooks/subscriptions/${enc(id)}/secret`)).secret;
}

// ---------------------------------------------------------------- webhook verification

export type TeracEvent = {
  /** X-Event-ID (stable across retries) — dedupe on this. */
  id: string;
  /** `submission.status.change` | `submission.approved` | `webhook.ping` | future types */
  type: string;
  /** X-Terac-Request-Timestamp, unix seconds */
  timestamp: number;
  data: {
    resource_id?: string; // submission id
    opportunity_id?: string;
    from?: string;
    to?: string;
    occurred_at?: string;
    [k: string]: unknown;
  };
};

/** Signature = base64(HMAC-SHA256(secret, X-Terac-Request-Timestamp + rawBody)), no separator. */
export function signTeracPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
}

/**
 * Verifies a Terac delivery (including the `webhook.ping` confirmation) and returns the normalized
 * event. Throws TeracWebhookError on any failure; throws "TERAC_WEBHOOK_SECRET is not configured" if unset.
 */
export function verifyTeracWebhook(rawBody: string, headers: Headers, nowMs: number = Date.now()): TeracEvent {
  const secret = need("TERAC_WEBHOOK_SECRET");
  const timestamp = headers.get(TERAC_TIMESTAMP_HEADER);
  const signature = headers.get(TERAC_SIGNATURE_HEADER);
  if (!timestamp || !signature) throw new TeracWebhookError("missing Terac signature headers", "missing_headers");

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > TERAC_WEBHOOK_MAX_AGE_SECONDS) {
    throw new TeracWebhookError("stale or invalid Terac timestamp", "stale");
  }

  const expected = Buffer.from(signTeracPayload(secret, timestamp, rawBody), "base64");
  const given = Buffer.from(signature.trim(), "base64");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new TeracWebhookError("bad Terac signature", "bad_signature");
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    throw new TeracWebhookError("unparsable Terac webhook body", "bad_payload");
  }

  const id = headers.get(TERAC_EVENT_ID_HEADER) ?? (typeof body.event_id === "string" ? body.event_id : null);
  const type = typeof body.event_type === "string" ? body.event_type : typeof body.type === "string" ? body.type : null;
  if (!type) throw new TeracWebhookError("Terac webhook without event_type", "bad_payload");
  if (!id && type !== "webhook.ping") throw new TeracWebhookError("Terac webhook without event id", "bad_payload");

  return { id: id ?? `ping:${timestamp}`, type, timestamp: ts, data: body as TeracEvent["data"] };
}
