import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { signWhopWebhook, verifyWhopWebhook, WhopWebhookError } from "@/lib/whop";
import { createFakeDb, filterValue, type DbCall, type DbResult } from "./fakeDb";

const h = vi.hoisted(() => ({
  respond: (() => undefined) as (c: unknown) => unknown,
  claimed: new Set<string>(),
  claimWebhook: null as unknown,
  logEvent: null as unknown,
  openIncident: null as unknown,
  onPaymentSucceeded: null as unknown,
  onRefundCreated: null as unknown,
  onDisputeCreated: null as unknown,
  fake: null as null | { client: unknown; calls: unknown[] },
}));

vi.mock("@/lib/db", () => {
  h.claimWebhook = vi.fn(async (provider: string, id: string) => {
    const k = `${provider}|${id}`;
    if (h.claimed.has(k)) return false;
    h.claimed.add(k);
    return true;
  });
  h.logEvent = vi.fn(async () => {});
  h.openIncident = vi.fn(async () => {});
  return {
    db: () => h.fake!.client,
    claimWebhook: h.claimWebhook,
    logEvent: h.logEvent,
    openIncident: h.openIncident,
  };
});

vi.mock("@/lib/orders/handlers", () => {
  h.onPaymentSucceeded = vi.fn(async () => {});
  h.onRefundCreated = vi.fn(async () => {});
  h.onDisputeCreated = vi.fn(async () => {});
  return {
    onPaymentSucceeded: h.onPaymentSucceeded,
    onRefundCreated: h.onRefundCreated,
    onDisputeCreated: h.onDisputeCreated,
  };
});

const { POST } = await import("@/app/api/whop-webhook/route");

const SBX_SECRET = "ws_sandbox0123456789abcdef0123456789abcdef0123456789abcdef01234567";
const LIVE_SECRET = "ws_live0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab";
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

type Mocked = ReturnType<typeof vi.fn>;
const m = (x: unknown) => x as Mocked;

function signedHeaders(secret: string, raw: string, msgId: string, at = new Date()) {
  return new Headers({
    "content-type": "application/json",
    "webhook-id": msgId,
    "webhook-timestamp": String(Math.floor(at.getTime() / 1000)),
    "webhook-signature": signWhopWebhook(secret, msgId, at, raw),
  });
}

function request(raw: string, headers: Headers, query = "?mode=sandbox") {
  return new NextRequest(`https://juryhour.test/api/whop-webhook${query}`, { method: "POST", body: raw, headers });
}

beforeEach(() => {
  process.env.WHOP_SANDBOX_WEBHOOK_SECRET = SBX_SECRET;
  process.env.WHOP_WEBHOOK_SECRET = LIVE_SECRET;
  resetEnvCache();
  h.claimed.clear();
  h.respond = (c) => {
    const call = c as DbCall;
    if (call.table === "orders" && call.op === "select" && filterValue(call, "id") === ORDER_ID) return { data: { id: ORDER_ID } };
    return { data: null };
  };
  h.fake = createFakeDb((c) => h.respond(c) as DbResult | undefined);
  for (const fn of [h.claimWebhook, h.logEvent, h.openIncident, h.onPaymentSucceeded, h.onRefundCreated, h.onDisputeCreated]) m(fn).mockClear();
});

afterEach(() => {
  delete process.env.WHOP_SANDBOX_WEBHOOK_SECRET;
  delete process.env.WHOP_WEBHOOK_SECRET;
  resetEnvCache();
});

describe("verifyWhopWebhook (Standard Webhooks, literal ws_ secret bytes)", () => {
  const raw = fixture("payment-succeeded.json");
  const msgId = JSON.parse(raw).id as string;

  it("accepts a signature made exactly as Whop documents it (HMAC-SHA256 over id.ts.body, key = secret bytes)", () => {
    const ts = Math.floor(Date.now() / 1000);
    const manual = createHmac("sha256", Buffer.from(SBX_SECRET, "utf8")).update(`${msgId}.${ts}.${raw}`).digest("base64");
    const headers = new Headers({ "webhook-id": msgId, "webhook-timestamp": String(ts), "webhook-signature": `v1,${manual}` });
    const ev = verifyWhopWebhook(raw, headers, "sandbox");
    expect(ev).toMatchObject({ id: msgId, type: "payment.succeeded", companyId: "biz_sbx" });
    expect(ev.data.metadata.order_id).toBe(ORDER_ID);
  });

  it("accepts one valid signature among several (key rotation)", () => {
    const h1 = signedHeaders(SBX_SECRET, raw, msgId);
    h1.set("webhook-signature", `v1,AAAA ${h1.get("webhook-signature")}`);
    expect(verifyWhopWebhook(raw, h1, "sandbox").type).toBe("payment.succeeded");
  });

  it("rejects a tampered body", () => {
    const headers = signedHeaders(SBX_SECRET, raw, msgId);
    expect(() => verifyWhopWebhook(raw.replace("149.0", "1.0"), headers, "sandbox")).toThrow(WhopWebhookError);
  });

  it("rejects the other mode's secret", () => {
    const headers = signedHeaders(LIVE_SECRET, raw, msgId);
    expect(() => verifyWhopWebhook(raw, headers, "sandbox")).toThrow(/bad signature/);
  });

  it("rejects a stale timestamp (> 5 min) even with a valid signature", () => {
    const old = new Date(Date.now() - 6 * 60_000);
    expect(() => verifyWhopWebhook(raw, signedHeaders(SBX_SECRET, raw, msgId, old), "sandbox")).toThrow(/stale/);
  });

  it("rejects a timestamp too far in the future", () => {
    const future = new Date(Date.now() + 6 * 60_000);
    expect(() => verifyWhopWebhook(raw, signedHeaders(SBX_SECRET, raw, msgId, future), "sandbox")).toThrow(/stale/);
  });

  it("rejects missing headers", () => {
    expect(() => verifyWhopWebhook(raw, new Headers(), "sandbox")).toThrow(/missing webhook-id/);
  });

  it("fails clearly when the secret is not configured", () => {
    delete process.env.WHOP_WEBHOOK_SECRET;
    resetEnvCache();
    expect(() => verifyWhopWebhook(raw, signedHeaders(LIVE_SECRET, raw, msgId), "live")).toThrow("WHOP_WEBHOOK_SECRET is not configured");
  });
});

describe("POST /api/whop-webhook", () => {
  it("payment.succeeded → onPaymentSucceeded with order id from metadata", async () => {
    const raw = fixture("payment-succeeded.json");
    const res = await POST(request(raw, signedHeaders(SBX_SECRET, raw, "msg_ps_1")));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, type: "payment.succeeded", order_id: ORDER_ID });
    expect(h.claimWebhook).toHaveBeenCalledWith("whop:sandbox", "msg_ps_1");
    expect(h.onPaymentSucceeded).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      paymentId: "pay_8kQ2mN4rT6vW1x",
      amountUsd: 149,
      receiptUrl: null,
      mode: "sandbox",
    });
  });

  it("replayed event → 200 duplicate, handler not called twice", async () => {
    const raw = fixture("payment-succeeded.json");
    const headers = signedHeaders(SBX_SECRET, raw, "msg_ps_replay");
    expect((await POST(request(raw, headers))).status).toBe(200);
    const res2 = await POST(request(raw, headers));
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ ok: true, duplicate: true });
    expect(h.onPaymentSucceeded).toHaveBeenCalledTimes(1);
  });

  it("invalid signature → 401, nothing claimed", async () => {
    const raw = fixture("payment-succeeded.json");
    const headers = signedHeaders("ws_wrong", raw, "msg_bad");
    const res = await POST(request(raw, headers));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, code: "bad_signature" });
    expect(h.claimWebhook).not.toHaveBeenCalled();
    expect(h.onPaymentSucceeded).not.toHaveBeenCalled();
  });

  it("stale delivery → 401", async () => {
    const raw = fixture("payment-succeeded.json");
    const res = await POST(request(raw, signedHeaders(SBX_SECRET, raw, "msg_old", new Date(Date.now() - 10 * 60_000))));
    expect(res.status).toBe(401);
  });

  it("no ?mode → live secret and whop:live provider", async () => {
    const raw = fixture("payment-succeeded.json");
    h.respond = (c) => {
      const call = c as DbCall;
      if (call.table === "orders" && filterValue(call, "mode") === "live") return { data: { id: ORDER_ID } };
      return { data: null };
    };
    const res = await POST(request(raw, signedHeaders(LIVE_SECRET, raw, "msg_live"), ""));
    expect(res.status).toBe(200);
    expect(h.claimWebhook).toHaveBeenCalledWith("whop:live", "msg_live");
    expect(m(h.onPaymentSucceeded).mock.calls[0][0]).toMatchObject({ mode: "live" });
  });

  it("sandbox-signed event sent to the live URL is rejected", async () => {
    const raw = fixture("payment-succeeded.json");
    expect((await POST(request(raw, signedHeaders(SBX_SECRET, raw, "msg_x"), ""))).status).toBe(401);
  });

  it("bad ?mode → 400", async () => {
    const raw = fixture("payment-succeeded.json");
    expect((await POST(request(raw, signedHeaders(SBX_SECRET, raw, "msg_y"), "?mode=prod"))).status).toBe(400);
  });

  it("falls back to whop_checkout_id when metadata has no order id", async () => {
    const body = JSON.parse(fixture("payment-succeeded.json"));
    body.data.metadata = {};
    const raw = JSON.stringify(body);
    h.respond = (c) => {
      const call = c as DbCall;
      if (call.table === "orders" && filterValue(call, "whop_checkout_id") === "ch_s2WZSSfx6amAFKF") return { data: { id: ORDER_ID } };
      return { data: null };
    };
    const res = await POST(request(raw, signedHeaders(SBX_SECRET, raw, "msg_fallback")));
    expect(res.status).toBe(200);
    expect(m(h.onPaymentSucceeded).mock.calls[0][0]).toMatchObject({ orderId: ORDER_ID });
  });

  it("unmatched payment → incident, 200, no handler", async () => {
    const body = JSON.parse(fixture("payment-succeeded.json"));
    body.data.metadata = { order_id: "22222222-2222-4222-8222-222222222222" };
    body.data.checkout_configuration_id = "ch_unknown";
    const raw = JSON.stringify(body);
    const res = await POST(request(raw, signedHeaders(SBX_SECRET, raw, "msg_unmatched")));
    expect(res.status).toBe(200);
    expect(h.onPaymentSucceeded).not.toHaveBeenCalled();
    expect(h.openIncident).toHaveBeenCalledWith("whop_payment_unmatched", expect.stringContaining("pay_8kQ2mN4rT6vW1x"));
  });

  it("refund.created → onRefundCreated", async () => {
    const raw = fixture("refund-created.json");
    const res = await POST(request(raw, signedHeaders(SBX_SECRET, raw, "msg_rf")));
    expect(res.status).toBe(200);
    expect(h.onRefundCreated).toHaveBeenCalledWith({ paymentId: "pay_8kQ2mN4rT6vW1x", refundId: "rf_xxxxxxxxxxxxxxx", amountUsd: 49.67, mode: "sandbox" });
  });

  it("dispute.created → onDisputeCreated", async () => {
    const raw = fixture("dispute-created.json");
    const res = await POST(request(raw, signedHeaders(SBX_SECRET, raw, "msg_dp")));
    expect(res.status).toBe(200);
    expect(h.onDisputeCreated).toHaveBeenCalledWith({ disputeId: "dspt_xxxxxxxxxxxxx", paymentId: "pay_8kQ2mN4rT6vW1x", mode: "sandbox" });
  });

  it("payment.failed and dispute.updated → logEvent only", async () => {
    for (const [type, id] of [["payment.failed", "msg_pf"], ["dispute.updated", "msg_du"]] as const) {
      const body = JSON.parse(fixture(type === "payment.failed" ? "payment-succeeded.json" : "dispute-created.json"));
      body.type = type;
      const raw = JSON.stringify(body);
      expect((await POST(request(raw, signedHeaders(SBX_SECRET, raw, id)))).status).toBe(200);
    }
    expect(m(h.logEvent).mock.calls.map((c) => (c[0] as { action: string }).action)).toEqual(["whop_payment_failed", "whop_dispute_updated"]);
    expect(m(h.logEvent).mock.calls[0][0]).toMatchObject({ order_id: ORDER_ID });
    expect(h.onPaymentSucceeded).not.toHaveBeenCalled();
    expect(h.onDisputeCreated).not.toHaveBeenCalled();
  });

  it("unknown event → 200 ignored", async () => {
    const raw = JSON.stringify({ id: "msg_u", type: "membership.activated", data: { id: "mem_1" } });
    const res = await POST(request(raw, signedHeaders(SBX_SECRET, raw, "msg_u")));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ignored: true });
  });

  it("handler failure → 500 and the claim is released so Whop's retry is processed", async () => {
    m(h.onPaymentSucceeded).mockRejectedValueOnce(new Error("db down"));
    const raw = fixture("payment-succeeded.json");
    const headers = signedHeaders(SBX_SECRET, raw, "msg_retry");
    const res = await POST(request(raw, headers));
    expect(res.status).toBe(500);
    const del = (h.fake!.calls as DbCall[]).find((c) => c.table === "processed_webhooks" && c.op === "delete");
    expect(del && filterValue(del, "event_id")).toBe("msg_retry");
    // our fake claim store doesn't see the delete; emulate it and confirm the retry succeeds
    h.claimed.delete("whop:sandbox|msg_retry");
    expect((await POST(request(raw, headers))).status).toBe(200);
    expect(h.onPaymentSucceeded).toHaveBeenCalledTimes(2);
  });

  it("missing secret → 500 not_configured (Whop retries later)", async () => {
    delete process.env.WHOP_SANDBOX_WEBHOOK_SECRET;
    resetEnvCache();
    const raw = fixture("payment-succeeded.json");
    const res = await POST(request(raw, signedHeaders(SBX_SECRET, raw, "msg_nc")));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "not_configured", error: "WHOP_SANDBOX_WEBHOOK_SECRET is not configured" });
  });
});
