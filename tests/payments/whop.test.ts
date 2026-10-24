import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import {
  createCheckout,
  createWebhook,
  listRecentPayments,
  refundPayment,
  setAdCampaignBudget,
  submitDisputeEvidence,
  whopConfig,
  WhopError,
} from "@/lib/whop";

const LIVE_KEY = "live-key-test-xxxxxxxx";
const SBX_KEY = "sandbox-key-test-yyyyyyyy";

type Captured = { url: URL; method: string; headers: Record<string, string>; body: unknown };
let captured: Captured[] = [];
let replies: (() => Response)[] = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  process.env.WHOP_API_KEY = LIVE_KEY;
  process.env.WHOP_COMPANY_ID = "biz_live";
  process.env.WHOP_SANDBOX_API_KEY = SBX_KEY;
  process.env.WHOP_SANDBOX_COMPANY_ID = "biz_sbx";
  resetEnvCache();
  captured = [];
  replies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string, init: RequestInit) => {
      captured.push({
        url: new URL(String(input)),
        method: init.method ?? "GET",
        headers: init.headers as Record<string, string>,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      const next = replies.shift();
      return next ? next() : json({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ["WHOP_API_KEY", "WHOP_COMPANY_ID", "WHOP_SANDBOX_API_KEY", "WHOP_SANDBOX_COMPANY_ID"]) delete process.env[k];
  resetEnvCache();
});

// Recorded from sandbox-api.whop.com at Api-Version-Date 2026-07-01 (trimmed).
const CHECKOUT_REPLY = {
  id: "ch_s2WZSSfx6amAFKF",
  created_at: 1792856897,
  mode: "payment",
  plan: { id: "plan_w7gQgRo8cUJU0", visibility: "hidden", plan_type: "one_time", currency: "usd", initial_price: 11.0 },
  metadata: { order_id: "11111111-1111-4111-8111-111111111111" },
  redirect_url: "https://juryhour.test/o/tok?paid=1",
  purchase_url: "https://sandbox.whop.com/checkout/ch_s2WZSSfx6amAFKF/",
  company_id: "biz_sbx",
};

describe("mode routing", () => {
  it("sandbox uses sandbox host, sandbox key and sandbox company", async () => {
    replies.push(() => json(CHECKOUT_REPLY));
    await createCheckout({ orderId: "o1", amountUsd: 11, title: "JuryHour Spark", mode: "sandbox", redirectUrl: "https://x/o/t?paid=1" });
    const c = captured[0];
    expect(c.url.origin).toBe("https://sandbox-api.whop.com");
    expect(c.url.pathname).toBe("/api/v1/checkout_configurations");
    expect(c.headers.Authorization).toBe(`Bearer ${SBX_KEY}`);
    expect(c.headers["Api-Version-Date"]).toBe("2026-07-01");
    expect((c.body as { plan: { company_id: string } }).plan.company_id).toBe("biz_sbx");
  });

  it("live uses api.whop.com, live key and live company", async () => {
    replies.push(() => json(CHECKOUT_REPLY));
    await createCheckout({ orderId: "o1", amountUsd: 11, title: "JuryHour Spark", mode: "live", redirectUrl: "https://x/o/t?paid=1" });
    const c = captured[0];
    expect(c.url.origin).toBe("https://api.whop.com");
    expect(c.headers.Authorization).toBe(`Bearer ${LIVE_KEY}`);
    expect((c.body as { plan: { company_id: string } }).plan.company_id).toBe("biz_live");
  });

  it("missing key fails with a clear not-configured error", () => {
    delete process.env.WHOP_SANDBOX_API_KEY;
    resetEnvCache();
    expect(() => whopConfig("sandbox")).toThrow("WHOP_SANDBOX_API_KEY is not configured");
  });
});

describe("createCheckout", () => {
  it("sends an inline one-time plan with metadata.order_id and redirect_url", async () => {
    replies.push(() => json(CHECKOUT_REPLY));
    const r = await createCheckout({
      orderId: "11111111-1111-4111-8111-111111111111",
      amountUsd: 163.999,
      title: "JuryHour Proof + 5 extra jurors",
      mode: "sandbox",
      redirectUrl: "https://juryhour.test/o/tok?paid=1",
    });
    expect(r).toEqual({ checkoutId: "ch_s2WZSSfx6amAFKF", purchaseUrl: "https://sandbox.whop.com/checkout/ch_s2WZSSfx6amAFKF/" });
    expect(captured[0].method).toBe("POST");
    expect(captured[0].body).toEqual({
      plan: {
        company_id: "biz_sbx",
        currency: "usd",
        plan_type: "one_time",
        initial_price: 164,
        renewal_price: 0,
        title: "JuryHour Proof + 5 extra jurors",
        visibility: "hidden",
        product: { external_identifier: "juryhour-verdict", title: "JuryHour verdict" },
      },
      metadata: { order_id: "11111111-1111-4111-8111-111111111111" },
      redirect_url: "https://juryhour.test/o/tok?paid=1",
    });
  });

  it("rejects amounts under $1 without calling Whop", async () => {
    await expect(createCheckout({ orderId: "o", amountUsd: 0.5, title: "t", mode: "sandbox", redirectUrl: "https://x" })).rejects.toThrow(/invalid amount/);
    expect(captured).toHaveLength(0);
  });

  it("surfaces Whop errors as WhopError without leaking the key", async () => {
    replies.push(() => json({ error: { type: "invalid_request_error", code: "parameter_invalid", message: "bad plan" } }, 400));
    const err = await createCheckout({ orderId: "o", amountUsd: 11, title: "t", mode: "sandbox", redirectUrl: "https://x" }).catch((e) => e);
    expect(err).toBeInstanceOf(WhopError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("parameter_invalid");
    expect(err.message).toContain("bad plan");
    expect(err.message).not.toContain(SBX_KEY);
  });

  it("times out with a clear error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    }));
    await expect(createCheckout({ orderId: "o", amountUsd: 11, title: "t", mode: "sandbox", redirectUrl: "https://x" })).rejects.toThrow(/timed out after 20s/);
  });
});

describe("refundPayment", () => {
  const paymentAfterRefund = (amount: number, substatus: string) => ({
    id: "pay_1",
    status: "paid",
    substatus,
    refunded_amount: amount,
    refunds: [{ id: "rf_new", amount, currency: "usd", status: "pending", created_at: "2026-10-24T12:00:00Z" }],
  });

  it("full refund sends an empty body", async () => {
    replies.push(() => json(paymentAfterRefund(149, "refunded")));
    const r = await refundPayment({ paymentId: "pay_1", mode: "sandbox" });
    expect(captured[0].method).toBe("POST");
    expect(captured[0].url.pathname).toBe("/api/v1/payments/pay_1/refund");
    expect(captured[0].body).toEqual({});
    expect(r).toEqual({ refundId: "rf_new", status: "pending" });
  });

  it("partial refund sends partial_amount rounded to cents", async () => {
    replies.push(() => json(paymentAfterRefund(49.67, "partially_refunded")));
    await refundPayment({ paymentId: "pay_1", amountUsd: 49.666, mode: "live" });
    expect(captured[0].url.origin).toBe("https://api.whop.com");
    expect(captured[0].body).toEqual({ partial_amount: 49.67 });
  });

  it("falls back to the payment substatus when no refund is embedded", async () => {
    replies.push(() => json({ id: "pay_1", status: "paid", substatus: "refunded", refunds: null }));
    expect(await refundPayment({ paymentId: "pay_1", mode: "sandbox" })).toEqual({ refundId: null, status: "refunded" });
  });

  it("refuses zero / negative partial amounts", async () => {
    await expect(refundPayment({ paymentId: "pay_1", amountUsd: 0, mode: "sandbox" })).rejects.toThrow(/invalid amount/);
    await expect(refundPayment({ paymentId: "pay_1", amountUsd: -5, mode: "sandbox" })).rejects.toThrow(/invalid amount/);
    expect(captured).toHaveLength(0);
  });
});

describe("listRecentPayments", () => {
  it("filters by company + created_after, paginates, and maps metadata.order_id", async () => {
    replies.push(() =>
      json({
        data: [
          { id: "pay_a", status: "paid", substatus: "succeeded", total: 149, usd_total: 149, created_at: "2026-10-24T11:30:00Z", metadata: { order_id: "o-a" }, checkout_configuration_id: "ch_a" },
        ],
        page_info: { end_cursor: "cur1", has_next_page: true },
      }),
    );
    replies.push(() =>
      json({
        data: [{ id: "pay_b", status: "open", substatus: "pending", total: 11, usd_total: null, created_at: "2026-10-24T11:40:00Z", metadata: null, checkout_configuration_id: null }],
        page_info: { end_cursor: null, has_next_page: false },
      }),
    );
    const rows = await listRecentPayments({ sinceMinutes: 60, mode: "sandbox" });
    expect(captured).toHaveLength(2);
    expect(captured[0].url.searchParams.get("company_id")).toBe("biz_sbx");
    expect(captured[0].url.searchParams.get("created_after")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(captured[1].url.searchParams.get("after")).toBe("cur1");
    expect(rows).toEqual([
      { paymentId: "pay_a", orderId: "o-a", amountUsd: 149, status: "paid", substatus: "succeeded", checkoutId: "ch_a", createdAt: "2026-10-24T11:30:00Z" },
      { paymentId: "pay_b", orderId: null, amountUsd: 11, status: "open", substatus: "pending", checkoutId: null, createdAt: "2026-10-24T11:40:00Z" },
    ]);
  });
});

describe("submitDisputeEvidence", () => {
  it("updates evidence then submits it (legacy endpoints)", async () => {
    await submitDisputeEvidence({
      disputeId: "dspt_1",
      mode: "sandbox",
      evidence: { notes: "Report delivered with 15 juror responses.", product_description: "Research report", customer_name: "  " },
    });
    expect(captured.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "POST /api/v1/disputes/dspt_1/update_evidence",
      "POST /api/v1/disputes/dspt_1/submit_evidence",
    ]);
    expect(captured[0].body).toEqual({ notes: "Report delivered with 15 juror responses.", product_description: "Research report" });
  });

  it("refuses empty evidence", async () => {
    await expect(submitDisputeEvidence({ disputeId: "d", mode: "sandbox", evidence: {} })).rejects.toThrow(/no evidence/);
  });
});

describe("setAdCampaignBudget", () => {
  it("patches a daily budget", async () => {
    await setAdCampaignBudget({ campaignId: "adcamp_1", dailyUsd: 15, mode: "live" });
    expect(captured[0].method).toBe("PATCH");
    expect(captured[0].url.pathname).toBe("/api/v1/ad_campaigns/adcamp_1");
    expect(captured[0].body).toEqual({ budget_amount: 15, budget_type: "daily" });
  });

  it("enforces the per-campaign daily cap in code", async () => {
    await expect(setAdCampaignBudget({ campaignId: "a", dailyUsd: 21, mode: "live" })).rejects.toThrow(/0\.\.20/);
    expect(captured).toHaveLength(0);
  });

  it("maps 403/404 to 'ads not available'", async () => {
    replies.push(() => json({ error: { type: "not_found", message: "Ad campaign not found" } }, 404));
    await expect(setAdCampaignBudget({ campaignId: "a", dailyUsd: 5, mode: "sandbox" })).rejects.toThrow(/^ads not available/);
  });
});

describe("createWebhook", () => {
  it("registers v1 + api_version_date pin + our five events for the company", async () => {
    replies.push(() => json({ id: "hook_1", url: "https://app/api/whop-webhook?mode=sandbox", events: [], webhook_secret: "ws_x" }));
    await createWebhook("sandbox", "https://app/api/whop-webhook?mode=sandbox");
    expect(captured[0].body).toEqual({
      url: "https://app/api/whop-webhook?mode=sandbox",
      api_version: "v1",
      api_version_date: "2026-07-01",
      events: ["payment.succeeded", "payment.failed", "refund.created", "dispute.created", "dispute.updated"],
      resource_id: "biz_sbx",
      enabled: true,
    });
  });
});
