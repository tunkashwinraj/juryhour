// Terac webhook: signature (valid / invalid / stale / replayed), confirmation ping, routing to E's handler.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { TeracWebhookError, signTeracPayload, verifyTeracWebhook } from "@/lib/terac";

const h = vi.hoisted(() => ({
  claimed: new Set<string>(),
  claimWebhook: vi.fn(),
  logEvent: vi.fn(async () => {}),
  openIncident: vi.fn(async () => {}),
  onSubmissionAwaitingReview: vi.fn(async (id: string) => void id),
  afterTasks: [] as Promise<unknown>[],
}));

vi.mock("@/lib/db", () => ({
  db: () => {
    throw new Error("db() should not be called directly by the webhook route");
  },
  claimWebhook: h.claimWebhook,
  logEvent: h.logEvent,
  openIncident: h.openIncident,
}));
vi.mock("@/lib/orders/handlers", () => ({ onSubmissionAwaitingReview: h.onSubmissionAwaitingReview }));
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    h.afterTasks.push(Promise.resolve().then(fn));
  },
}));

const { POST } = await import("@/app/api/terac-webhook/route");

const SECRET = "whsec_test_secret";
const nowSec = () => Math.floor(Date.now() / 1000);

function signed(body: unknown, opts: { ts?: number; eventId?: string | null; secret?: string; sig?: string } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const ts = String(opts.ts ?? nowSec());
  const headers = new Headers({
    "content-type": "application/json",
    "X-Terac-Request-Timestamp": ts,
    "X-Terac-Request-Signature": opts.sig ?? signTeracPayload(opts.secret ?? SECRET, ts, raw),
    "X-Timestamp": new Date().toISOString(),
  });
  if (opts.eventId !== null) headers.set("X-Event-ID", opts.eventId ?? "dlv_1");
  return { raw, headers };
}
const statusChange = (to: string, id = "sub_abc123") => ({
  event_type: "submission.status.change",
  event_id: "dlv_1",
  resource_id: id,
  occurred_at: "2026-10-24T12:00:00.000Z",
  opportunity_id: "opp_1",
  from: "in_progress",
  to,
});
function req(raw: string, headers: Headers) {
  return new Request("https://juryhour.test/api/terac-webhook", { method: "POST", body: raw, headers });
}
async function drainAfter() {
  await Promise.all(h.afterTasks.splice(0));
}

beforeEach(() => {
  process.env.TERAC_WEBHOOK_SECRET = SECRET;
  resetEnvCache();
  h.claimed.clear();
  h.claimWebhook.mockImplementation(async (provider: string, id: string) => {
    const k = `${provider}:${id}`;
    if (h.claimed.has(k)) return false;
    h.claimed.add(k);
    return true;
  });
  h.logEvent.mockClear();
  h.openIncident.mockClear();
  h.onSubmissionAwaitingReview.mockReset();
  h.onSubmissionAwaitingReview.mockImplementation(async () => {});
});
afterEach(() => {
  delete process.env.TERAC_WEBHOOK_SECRET;
  resetEnvCache();
});

describe("verifyTeracWebhook", () => {
  it("accepts base64(HMAC-SHA256(secret, timestamp + rawBody)) and normalizes the event", () => {
    const { raw, headers } = signed(statusChange("awaiting_review"), { eventId: "dlv_42" });
    const e = verifyTeracWebhook(raw, headers);
    expect(e).toMatchObject({ id: "dlv_42", type: "submission.status.change", data: { resource_id: "sub_abc123", to: "awaiting_review" } });
  });

  it("signs the exact raw bytes (re-serialized JSON fails)", () => {
    const raw = '{"event_type":"submission.status.change",  "resource_id":"sub_1","to":"approved"}';
    const { headers } = signed(raw);
    expect(() => verifyTeracWebhook(raw, headers)).not.toThrow();
    expect(() => verifyTeracWebhook(JSON.stringify(JSON.parse(raw)), headers)).toThrow(TeracWebhookError);
  });

  it("rejects a wrong secret, a tampered body and a malformed signature", () => {
    const { raw, headers } = signed(statusChange("approved"), { secret: "whsec_other" });
    expect(() => verifyTeracWebhook(raw, headers)).toThrow(expect.objectContaining({ reason: "bad_signature" }));
    const good = signed(statusChange("approved"));
    expect(() => verifyTeracWebhook(good.raw.replace("approved", "rejected"), good.headers)).toThrow(expect.objectContaining({ reason: "bad_signature" }));
    const bad = signed(statusChange("approved"), { sig: "not-base64!!" });
    expect(() => verifyTeracWebhook(bad.raw, bad.headers)).toThrow(expect.objectContaining({ reason: "bad_signature" }));
  });

  it("rejects timestamps more than 5 minutes old (or ahead)", () => {
    const old = signed(statusChange("approved"), { ts: nowSec() - 301 });
    expect(() => verifyTeracWebhook(old.raw, old.headers)).toThrow(expect.objectContaining({ reason: "stale" }));
    const future = signed(statusChange("approved"), { ts: nowSec() + 301 });
    expect(() => verifyTeracWebhook(future.raw, future.headers)).toThrow(expect.objectContaining({ reason: "stale" }));
    const edge = signed(statusChange("approved"), { ts: nowSec() - 290 });
    expect(() => verifyTeracWebhook(edge.raw, edge.headers)).not.toThrow();
  });

  it("rejects missing headers", () => {
    const { raw } = signed(statusChange("approved"));
    expect(() => verifyTeracWebhook(raw, new Headers())).toThrow(expect.objectContaining({ reason: "missing_headers" }));
  });

  it("falls back to body event_id when X-Event-ID is absent", () => {
    const { raw, headers } = signed(statusChange("approved"), { eventId: null });
    expect(verifyTeracWebhook(raw, headers).id).toBe("dlv_1");
  });

  it("throws the not-configured error when TERAC_WEBHOOK_SECRET is unset", () => {
    delete process.env.TERAC_WEBHOOK_SECRET;
    resetEnvCache();
    const { raw, headers } = signed(statusChange("approved"));
    expect(() => verifyTeracWebhook(raw, headers)).toThrow("TERAC_WEBHOOK_SECRET is not configured");
  });
});

describe("POST /api/terac-webhook", () => {
  it("awaiting_review → claims the event and calls onSubmissionAwaitingReview(submissionId)", async () => {
    const { raw, headers } = signed(statusChange("awaiting_review"));
    const res = await POST(req(raw, headers));
    expect(res.status).toBe(200);
    await drainAfter();
    expect(h.claimWebhook).toHaveBeenCalledWith("terac", "dlv_1");
    expect(h.onSubmissionAwaitingReview).toHaveBeenCalledWith("sub_abc123");
    expect(h.logEvent).not.toHaveBeenCalled();
  });

  it("replayed X-Event-ID → 200 without reprocessing", async () => {
    const first = signed(statusChange("awaiting_review"), { eventId: "dlv_replay" });
    await POST(req(first.raw, first.headers));
    await drainAfter();
    // Terac retries re-sign with a new timestamp but keep X-Event-ID.
    const retry = signed(statusChange("awaiting_review"), { eventId: "dlv_replay", ts: nowSec() - 5 });
    const res = await POST(req(retry.raw, retry.headers));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, replay: true });
    await drainAfter();
    expect(h.onSubmissionAwaitingReview).toHaveBeenCalledTimes(1);
  });

  it("answers the webhook.ping confirmation with 2xx without claiming", async () => {
    const { raw, headers } = signed({ event_type: "webhook.ping" }, { eventId: "ping_1" });
    const res = await POST(req(raw, headers));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ping: true });
    expect(h.claimWebhook).not.toHaveBeenCalled();
  });

  it("other events are logged, not routed", async () => {
    const { raw, headers } = signed(statusChange("approved"), { eventId: "dlv_2" });
    const res = await POST(req(raw, headers));
    expect(res.status).toBe(200);
    await drainAfter();
    expect(h.onSubmissionAwaitingReview).not.toHaveBeenCalled();
    expect(h.logEvent).toHaveBeenCalledWith(expect.objectContaining({ actor: "code", action: "terac_webhook" }));
  });

  it("bad signature → 401, stale → 401, nothing claimed", async () => {
    const bad = signed(statusChange("awaiting_review"), { secret: "nope" });
    expect((await POST(req(bad.raw, bad.headers))).status).toBe(401);
    const stale = signed(statusChange("awaiting_review"), { ts: nowSec() - 3600 });
    expect((await POST(req(stale.raw, stale.headers))).status).toBe(401);
    expect(h.claimWebhook).not.toHaveBeenCalled();
    expect(h.onSubmissionAwaitingReview).not.toHaveBeenCalled();
  });

  it("missing secret → 503 so Terac retries later", async () => {
    delete process.env.TERAC_WEBHOOK_SECRET;
    resetEnvCache();
    const { raw, headers } = signed(statusChange("awaiting_review"));
    const res = await POST(req(raw, headers));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("TERAC_WEBHOOK_SECRET is not configured");
  });

  it("handler failure opens an incident (delivery already acknowledged)", async () => {
    h.onSubmissionAwaitingReview.mockRejectedValueOnce(new Error("grader down"));
    const { raw, headers } = signed(statusChange("awaiting_review"), { eventId: "dlv_fail" });
    expect((await POST(req(raw, headers))).status).toBe(200);
    await drainAfter();
    expect(h.openIncident).toHaveBeenCalledWith("terac_webhook_handler_failed", expect.stringContaining("grader down"));
  });
});
