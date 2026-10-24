import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => (await import("./helpers/fakeDb")).dbModule);
vi.mock("@/lib/whop", async () => (await import("./helpers/mocks")).whopModule);
vi.mock("@/lib/terac", async () => (await import("./helpers/mocks")).teracModule);
vi.mock("@/lib/llm", async () => (await import("./helpers/mocks")).llmModule);
vi.mock("@/lib/agents", async () => (await import("./helpers/mocks")).agentsModule);
vi.mock("@/lib/email", async () => (await import("./helpers/mocks")).emailModule);
vi.mock("@/lib/exa", async () => (await import("./helpers/mocks")).exaModule);

import { POST } from "@/app/api/reconcile/route";
import { AUTO_PAUSE_PREFIX, runReconcile } from "@/lib/orders/reconcile";
import { fake } from "./helpers/fakeDb";
import { m, resetMocks, terac } from "./helpers/mocks";
import { events, incidents, ledger, row, seedBase, seedOrder, seedPaidOrder, seedPanel, seedResponse, seedTest } from "./helpers/seed";

const T0 = new Date("2026-10-24T12:01:00.000Z"); // minute 1: the Whop sweep is not due
const MIN = 60_000;
let now = T0.getTime();
const at = (offsetMin: number) => {
  now = T0.getTime() + offsetMin * MIN;
  vi.setSystemTime(new Date(now));
};
const runs = (agent?: string) => fake.rows("agent_runs").filter((r) => !agent || r.agent === agent);
const stage = (o: Record<string, unknown>) => row("orders", o.id).stage;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(0);
  seedBase();
  resetMocks();
});
afterEach(() => vi.useRealTimers());

describe("POST /api/reconcile", () => {
  it("requires the cron bearer", async () => {
    const res = await POST(new Request("https://x/api/reconcile", { method: "POST", headers: { authorization: "Bearer wrong" } }));
    expect(res.status).toBe(401);
    const ok = await POST(new Request("https://x/api/reconcile", { method: "POST", headers: { authorization: `Bearer ${process.env.INTERNAL_CRON_SECRET}` } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).ok).toBe(true);
  });

  it("stops early when the time budget is spent (rest left for the next minute)", async () => {
    const o = seedPaidOrder({ stage: "PAID" });
    const s = await runReconcile({ budgetMs: 0 });
    expect(s.out_of_time).toBe(true);
    expect(s.orders).toHaveLength(0);
    expect(stage(o)).toBe("PAID");
  });

  it("processes at most maxOrders, oldest stage first", async () => {
    const a = seedPaidOrder({ stage: "PAID", stage_entered_at: "2026-10-24T11:00:00.000Z" });
    const b = seedPaidOrder({ stage: "PAID", stage_entered_at: "2026-10-24T10:00:00.000Z" });
    const s = await runReconcile({ maxOrders: 1 });
    expect(s.orders.map((x) => x.order_id)).toEqual([b.id]);
    expect(stage(a)).toBe("PAID");
  });
});

describe("PAID / RESEARCHING / SYNTHESIZING: agent stages with timeouts", () => {
  it("PAID with no run → fire researcher → RESEARCHING", async () => {
    const o = seedPaidOrder({ stage: "PAID" });
    await runReconcile();
    expect(stage(o)).toBe("RESEARCHING");
    expect(m.fireAgent).toHaveBeenCalledWith("researcher", { order_id: o.id, attempt: 1 });
  });

  it("PAID after 3 failed fires → FAILED → full refund → REFUNDED", async () => {
    m.fireAgent.mockRejectedValue(Object.assign(new Error("Agent researcher fire rate-limited"), { name: "AgentRateLimitError" }));
    const o = seedPaidOrder({ stage: "PAID" });
    for (let i = 0; i < 4; i++) await runReconcile();
    expect(stage(o)).toBe("REFUNDED");
    expect(m.refundPayment).toHaveBeenCalledWith({ paymentId: o.whop_payment_id, amountUsd: undefined, mode: "sandbox" });
    expect(m.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ template: "refunded" }));
  });

  it("RESEARCHING: waits 10 min, then times out, re-fires with attempt+1, and refunds after 3", async () => {
    const o = seedPaidOrder({ stage: "RESEARCHING" });
    fake.insert("agent_runs", { order_id: o.id, agent: "researcher", session_id: "s0", status: "fired", attempt: 1 });
    at(9);
    await runReconcile();
    expect(m.fireAgent).not.toHaveBeenCalled();
    at(11);
    await runReconcile();
    expect(runs("researcher")[0].status).toBe("timed_out");
    expect(m.fireAgent).toHaveBeenLastCalledWith("researcher", { order_id: o.id, attempt: 2 });
    expect(row("orders", o.id).attempts).toBe(1);
    at(15);
    await runReconcile(); // 4 min after the re-fire: still waiting
    expect(m.fireAgent).toHaveBeenCalledTimes(1);
    at(22);
    await runReconcile();
    expect(m.fireAgent).toHaveBeenLastCalledWith("researcher", { order_id: o.id, attempt: 3 });
    at(33);
    await runReconcile();
    expect(stage(o)).toBe("REFUNDED");
    expect(events("stage_timeout")).toHaveLength(3);
    expect(ledger("refund")).toHaveLength(1);
  });

  it("RESEARCHING with a stored test (handoff happened) → QUOTING + quote", async () => {
    const o = seedPaidOrder({ stage: "RESEARCHING" });
    seedTest(o);
    await runReconcile();
    expect(stage(o)).toBe("QUOTING");
    expect(fake.rows("panels")).toHaveLength(1);
  });

  it("SYNTHESIZING times out after 15 min → analyst re-fired", async () => {
    const o = seedPaidOrder({ stage: "SYNTHESIZING" });
    at(16);
    await runReconcile();
    expect(m.fireAgent).toHaveBeenCalledWith("analyst", { order_id: o.id, attempt: 2 });
  });
});

describe("QUOTING", () => {
  function quoting(panel: Record<string, unknown> = {}) {
    const o = seedPaidOrder({ stage: "QUOTING" });
    const t = seedTest(o);
    const p = seedPanel(o, t, { status: "quoting", ...panel });
    return { o, t, p };
  }

  it("one getQuote per order per run; priced → launch with the same checks → PANEL_LIVE", async () => {
    const { o, p } = quoting();
    await runReconcile();
    expect(m.getQuote).toHaveBeenCalledTimes(1);
    expect(row("panels", p.id)).toMatchObject({ status: "live", cost_per_participant: 3 });
    expect(stage(o)).toBe("PANEL_LIVE");
  });

  it("pending quote → nothing", async () => {
    m.getQuote.mockImplementation(async (id: string) => ({ id, status: "RECEIVED", costPerParticipant: null }));
    const { o } = quoting();
    await runReconcile();
    expect(stage(o)).toBe("QUOTING");
    expect(m.createOpportunity).not.toHaveBeenCalled();
  });

  it("cpi 3× cap → launch refused → procurement fired once (not every minute)", async () => {
    terac.cpi = 32;
    const { o } = quoting();
    await runReconcile();
    at(1);
    await runReconcile();
    expect(stage(o)).toBe("QUOTING");
    expect(runs("procurement")).toHaveLength(1);
    expect(events("launch_refused")[0].payload).toMatchObject({ code: "infeasible_cost" });
    expect(m.createOpportunity).not.toHaveBeenCalled();
  });

  it("infeasible quote → procurement", async () => {
    m.getQuote.mockImplementation(async (id: string) => ({ id, status: "LOST", costPerParticipant: null }));
    const { p } = quoting();
    await runReconcile();
    expect(row("panels", p.id).status).toBe("infeasible");
    expect(runs("procurement")).toHaveLength(1);
  });

  it("sales paused → launch deferred, no procurement", async () => {
    fake.rows("company_state")[0].sales_paused = true;
    fake.rows("company_state")[0].pause_reason = "ceo: manual";
    const { o } = quoting();
    const s = await runReconcile();
    expect(stage(o)).toBe("QUOTING");
    expect(s.orders[0].result).toContain("sales_paused");
    expect(runs("procurement")).toHaveLength(0);
  });

  it("legacy feasibility quote still pending → keeps polling (no human-quote fallback any more)", async () => {
    m.getQuote.mockImplementation(async (id: string) => ({ id, status: "RECEIVED", costPerParticipant: null }));
    const { o } = quoting();
    at(11);
    await runReconcile();
    expect(m.createOpportunity).not.toHaveBeenCalled();
    expect(stage(o)).toBe("QUOTING");
  });

  it("> 90 min → procurement; > 110 min → full refund (infeasible) → REFUNDED", async () => {
    m.getQuote.mockImplementation(async (id: string) => ({ id, status: "RECEIVED", costPerParticipant: null }));
    // Terac can't price the draft either, so nothing launches
    m.createOpportunity.mockRejectedValue(Object.assign(new Error("Terac opportunity was created without pricing"), { name: "TeracError", code: "UNPRICED" }));
    const { o } = quoting();
    at(91);
    await runReconcile();
    expect(runs("procurement")).toHaveLength(1);
    at(111);
    await runReconcile();
    expect(stage(o)).toBe("REFUNDED");
    expect(m.refundPayment).toHaveBeenCalledTimes(1);
  });

  it("instant pricing: unpriced panel → reconciler prices the draft and launches; a failed try cools down", async () => {
    const { o, p } = quoting({ terac_feasibility_id: null });
    m.createOpportunity.mockRejectedValueOnce(new Error("The operation was aborted due to timeout"));
    await runReconcile();
    expect(stage(o)).toBe("QUOTING");
    expect(fake.rows("events").some((e) => e.action === "instant_price_failed" && e.order_id === o.id)).toBe(true);
    at(1);
    await runReconcile(); // within the retry cool-down: no new Terac call
    expect(m.createOpportunity).toHaveBeenCalledTimes(1);
    at(4);
    await runReconcile();
    // priced, then launched (the launch re-estimates if the cost cap shrinks the panel)
    expect(m.createOpportunity.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(row("panels", p.id).terac_opportunity_id).toMatch(/^opp_/);
    expect(stage(o)).toBe("PANEL_LIVE");
  });
});

describe("PANEL_LIVE", () => {
  function live(o: { requested?: number; deadlineMin?: number } = {}) {
    const order = seedPaidOrder({ stage: "PANEL_LIVE", tier: "pulse", price_usd: 49, deadline_at: new Date(now + (o.deadlineMin ?? 240) * MIN).toISOString() });
    const t = seedTest(order);
    const p = seedPanel(order, t, { status: "live", requested_n: o.requested ?? 10, cost_per_participant: 2, terac_opportunity_id: `opp_${String(order.id).slice(0, 6)}`, launched_at: new Date(now).toISOString() });
    return { order, t, p };
  }

  it("race fix: grades undecided responses Terac lists as awaiting_review (webhook missed)", async () => {
    const { t, p } = live();
    const r = seedResponse(t, p);
    const notYet = seedResponse(t, p);
    m.listSubmissions.mockResolvedValue([{ id: r.terac_submission_id, status: "awaiting_review" }]);
    await runReconcile();
    expect(row("responses", r.id).decision).toBe("approved");
    expect(row("responses", notYet.id).decision).toBeNull();
    expect(m.listSubmissions).toHaveBeenCalledTimes(1);
  });

  it("closes Terac-auto-rejected answers locally without Terac calls", async () => {
    const { t, p } = live();
    const junk = seedResponse(t, p, { attention_passed: false, seconds_spent: 30 });
    await runReconcile();
    expect(row("responses", junk.id).decision).toBe("rejected");
    expect(row("panels", p.id).rejected_n).toBe(1);
    expect(m.rejectSubmission).not.toHaveBeenCalled();
    expect(m.listSubmissions).not.toHaveBeenCalled();
  });

  it("deadline with approved ≥ minJurors → stop → GRADING", async () => {
    const { order, t, p } = live({ deadlineMin: 10 });
    for (let i = 0; i < 8; i++) seedResponse(t, p, { decision: "approved" });
    row("panels", p.id).approved_n = 8;
    at(5);
    await runReconcile();
    expect(stage(order)).toBe("PANEL_LIVE");
    at(11);
    await runReconcile();
    expect(m.stopOpportunity).toHaveBeenCalledTimes(1);
    expect(stage(order)).toBe("GRADING");
  });

  it("deadline: Terac refuses to stop while submissions await review → retry next minute", async () => {
    const { order, t, p } = live({ deadlineMin: 0 });
    for (let i = 0; i < 8; i++) seedResponse(t, p, { decision: "approved" });
    m.stopOpportunity.mockRejectedValueOnce(Object.assign(new Error("409 pending submissions"), { name: "TeracConflictError" }));
    at(1);
    await runReconcile();
    expect(stage(order)).toBe("PANEL_LIVE");
    expect(row("panels", p.id).status).toBe("live");
    at(2);
    await runReconcile();
    expect(stage(order)).toBe("GRADING");
  });

  it("deadline: orphan awaiting_review submissions (no stored answers) are rejected with a reason", async () => {
    live({ deadlineMin: 0 });
    m.listSubmissions.mockResolvedValue([{ id: "sub_orphan", status: "awaiting_review" }]);
    at(1);
    await runReconcile();
    expect(m.rejectSubmission).toHaveBeenCalledWith("sub_orphan", "incomplete", expect.stringContaining("No answers"));
  });

  it("deadline with approved < min → wait PANEL_GRACE_HOURS, then full refund → REFUNDED", async () => {
    const { order, t, p } = live({ deadlineMin: 0 });
    for (let i = 0; i < 3; i++) seedResponse(t, p, { decision: "approved" });
    at(30);
    await runReconcile();
    expect(stage(order)).toBe("PANEL_LIVE");
    at(61);
    await runReconcile();
    expect(stage(order)).toBe("REFUNDED");
    expect(m.refundPayment).toHaveBeenCalledWith({ paymentId: order.whop_payment_id, amountUsd: undefined, mode: "sandbox" });
  });

  it("transient Terac errors bump attempts; 3 in a row → FAILED → refund", async () => {
    const { order, t, p } = live();
    seedResponse(t, p);
    m.listSubmissions.mockRejectedValue(Object.assign(new Error("Terac 503"), { name: "TeracError" }));
    for (let i = 0; i < 3; i++) await runReconcile();
    expect(incidents("reconcile_error")).toHaveLength(1);
    expect(stage(order)).toBe("REFUNDED");
  });
});

describe("GRADING / FAILED / PARTIAL", () => {
  it("GRADING with everything decided → analyst fired → SYNTHESIZING", async () => {
    const o = seedPaidOrder({ stage: "GRADING" });
    const t = seedTest(o);
    const p = seedPanel(o, t, { status: "stopped", launched_at: new Date().toISOString() });
    seedResponse(t, p, { decision: "approved" });
    await runReconcile();
    expect(m.fireAgent).toHaveBeenCalledWith("analyst", { order_id: o.id, attempt: 1 });
    expect(stage(o)).toBe("SYNTHESIZING");
  });

  it("GRADING with undecided answers waits, then proceeds after the 10 min timeout", async () => {
    const o = seedPaidOrder({ stage: "GRADING" });
    const t = seedTest(o);
    const p = seedPanel(o, t, { status: "stopped", launched_at: new Date().toISOString(), terac_opportunity_id: "opp_g" });
    seedResponse(t, p);
    await runReconcile();
    expect(stage(o)).toBe("GRADING");
    at(11);
    await runReconcile();
    expect(stage(o)).toBe("SYNTHESIZING");
  });

  it("FAILED → refund retried until it succeeds", async () => {
    m.refundPayment.mockRejectedValueOnce(Object.assign(new Error("Whop down"), { name: "WhopError" }));
    const o = seedPaidOrder({ stage: "FAILED" });
    await runReconcile();
    expect(stage(o)).toBe("FAILED");
    expect(row("orders", o.id).refund_usd).toBe(0);
    await runReconcile();
    expect(stage(o)).toBe("REFUNDED");
    expect(row("orders", o.id).refund_usd).toBe(149);
  });

  it("PARTIAL with the pro-rata refund still owed → settled", async () => {
    const o = seedPaidOrder({ stage: "PARTIAL", delivered_at: new Date().toISOString() });
    const t = seedTest(o);
    const p = seedPanel(o, t, { status: "stopped", requested_n: 15, launched_at: new Date().toISOString() });
    for (let i = 0; i < 12; i++) seedResponse(t, p, { decision: "approved" });
    await runReconcile();
    expect(row("orders", o.id).refund_usd).toBe(29.8);
    await runReconcile();
    expect(m.refundPayment).toHaveBeenCalledTimes(1);
  });
});

describe("company-level steps", () => {
  it("auto-pause below $40 and auto-resume above $60 (only its own pause)", async () => {
    fake.rows("company_state")[0].terac_balance_usd = 10;
    await runReconcile();
    expect(fake.rows("company_state")[0]).toMatchObject({ sales_paused: true });
    expect(String(fake.rows("company_state")[0].pause_reason)).toContain(AUTO_PAUSE_PREFIX);
    fake.rows("company_state")[0].terac_balance_usd = 50;
    await runReconcile();
    expect(fake.rows("company_state")[0].sales_paused).toBe(true); // hysteresis
    fake.rows("company_state")[0].terac_balance_usd = 100;
    await runReconcile();
    expect(fake.rows("company_state")[0].sales_paused).toBe(false);
    // a CEO / human pause is never auto-resumed
    Object.assign(fake.rows("company_state")[0], { sales_paused: true, pause_reason: "ceo: incident" });
    await runReconcile();
    expect(fake.rows("company_state")[0].sales_paused).toBe(true);
  });

  it("refreshes the Terac balance every 10 minutes (one call)", async () => {
    process.env.TERAC_API_KEY = "test-terac";
    (await import("@/lib/env")).resetEnvCache();
    try {
      fake.rows("company_state")[0].terac_balance_checked_at = new Date(now - 11 * MIN).toISOString();
      m.getTeracContext.mockResolvedValue({ balanceDollars: 25 });
      await runReconcile();
      await runReconcile();
      expect(m.getTeracContext).toHaveBeenCalledTimes(1);
      expect(fake.rows("company_state")[0]).toMatchObject({ terac_balance_usd: 25, sales_paused: true });
    } finally {
      delete process.env.TERAC_API_KEY;
      (await import("@/lib/env")).resetEnvCache();
    }
  });

  it("missing Terac key: recorded once as an incident, run continues", async () => {
    fake.rows("company_state")[0].terac_balance_checked_at = null;
    const o = seedPaidOrder({ stage: "PAID" });
    await runReconcile();
    await runReconcile();
    expect(incidents("not_configured").filter((i) => String(i.detail).includes("TERAC"))).toHaveLength(1);
    expect(stage(o)).toBe("RESEARCHING");
  });

  it("agent runs older than 20 min → timed_out", async () => {
    const o = seedOrder();
    fake.insert("agent_runs", { order_id: o.id, agent: "disputes", session_id: "d1", status: "fired", started_at: new Date(now - 21 * MIN).toISOString() });
    fake.insert("agent_runs", { order_id: o.id, agent: "disputes", session_id: "d2", status: "fired", started_at: new Date(now - 5 * MIN).toISOString() });
    await runReconcile();
    expect(runs("disputes").map((r) => r.status)).toEqual(["timed_out", "fired"]);
  });

  it("Whop sweep every 5 minutes recovers a payment whose webhook was lost", async () => {
    process.env.WHOP_SANDBOX_API_KEY = "k";
    process.env.WHOP_SANDBOX_COMPANY_ID = "biz_x";
    (await import("@/lib/env")).resetEnvCache();
    try {
      const o = seedOrder();
      m.listRecentPayments.mockResolvedValue([{ paymentId: "pay_lost", orderId: o.id, amountUsd: 149, status: "paid", substatus: "succeeded", checkoutId: null, createdAt: "" }]);
      await runReconcile(); // minute 1: not due
      expect(m.listRecentPayments).not.toHaveBeenCalled();
      at(4); // 12:05
      await runReconcile();
      expect(m.listRecentPayments).toHaveBeenCalledWith({ sinceMinutes: 60, mode: "sandbox" });
      expect(row("orders", o.id).whop_payment_id).toBe("pay_lost");
      expect(stage(o)).toBe("RESEARCHING");
      expect(events("whop_sweep")).toHaveLength(1);
    } finally {
      delete process.env.WHOP_SANDBOX_API_KEY;
      delete process.env.WHOP_SANDBOX_COMPANY_ID;
      (await import("@/lib/env")).resetEnvCache();
    }
  });
});

describe("preview follow-ups", () => {
  const preview = (createdMinAgo: number, over: Record<string, unknown> = {}) =>
    fake.insert("previews", { email: "lead@example.com", safety_verdict: "allow", weakest_line: "We help you grow", created_at: new Date(now - createdMinAgo * MIN).toISOString(), ...over }).rows[0];

  it("+15 min first, +24h second, max 2", async () => {
    const p = preview(10);
    await runReconcile();
    expect(m.sendEmail).not.toHaveBeenCalled();
    at(6);
    await runReconcile();
    expect(m.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ template: "preview_followup_1", vars: expect.objectContaining({ preview_id: p.id }) }));
    at(60);
    await runReconcile();
    expect(m.sendEmail).toHaveBeenCalledTimes(1);
    at(24 * 60);
    await runReconcile();
    expect(m.sendEmail).toHaveBeenLastCalledWith(expect.objectContaining({ template: "preview_followup_2" }));
    at(48 * 60);
    await runReconcile();
    expect(m.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("never after a purchase; unsubscribed is marked handled without sending", async () => {
    const a = preview(20, { email: "buyer@example.com" });
    seedPaidOrder();
    const b = preview(20, { email: "gone@example.com" });
    fake.insert("email_suppressions", { email: "gone@example.com" });
    await runReconcile();
    expect(m.sendEmail).not.toHaveBeenCalled();
    expect(row("previews", a.id).followup_1_sent_at).toBeTruthy();
    expect(row("previews", b.id).followup_1_sent_at).toBeTruthy();
  });

  it("skipped: 'unsubscribed' from sendEmail still marks; not_configured does not", async () => {
    const a = preview(20);
    m.sendEmail.mockResolvedValueOnce({ id: null, skipped: "unsubscribed" });
    await runReconcile();
    expect(row("previews", a.id).followup_1_sent_at).toBeTruthy();
    const b = preview(20, { email: "x@example.com" });
    m.sendEmail.mockResolvedValue({ id: null, skipped: "not_configured" });
    await runReconcile();
    expect(row("previews", b.id).followup_1_sent_at).toBeNull();
  });
});

describe("specialist quotes", () => {
  it("request → priced → Whop checkout + quote_ready email; expires after 48h", async () => {
    const o = seedOrder({ tier: "specialist", price_usd: null, quote_expires_at: new Date(now + 48 * 60 * MIN).toISOString(), buyer_desc: "CFOs at Ledgerly-sized SaaS companies", url: "https://ledgerly.example" });
    await runReconcile();
    expect(m.requestQuote).toHaveBeenCalledWith(expect.objectContaining({ submissionCount: 8 }));
    expect(String(m.requestQuote.mock.calls[0][0].panelDescription).toLowerCase()).not.toContain("ledgerly");
    terac.cpi = 40;
    await runReconcile();
    expect(row("orders", o.id).price_usd).toBe(Math.max(499, 2 * 40 * 8 + 50));
    expect(m.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ template: "quote_ready", vars: expect.objectContaining({ price_usd: 690 }) }));
    const expired = seedOrder({ tier: "specialist", price_usd: null, quote_expires_at: new Date(now - MIN).toISOString() });
    await runReconcile();
    expect(events("specialist_quote_expired").filter((e) => e.order_id === expired.id)).toHaveLength(1);
  });
});
