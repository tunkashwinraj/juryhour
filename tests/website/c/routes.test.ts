// /api/leads and /api/order-lookup: validation, rate limits, identical responses, no customer leak.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, filter, type Call, type Result } from "./fakeDb";

const h = vi.hoisted(() => ({
  respond: (() => undefined) as (c: unknown) => unknown,
  fake: null as null | { client: unknown; calls: unknown[] },
  sendEmail: vi.fn(async () => ({ id: "email_1" })),
}));

vi.mock("@/lib/db", () => ({ db: () => h.fake!.client, logEvent: vi.fn(), openIncident: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: h.sendEmail }));

const { POST: leads } = await import("@/app/api/leads/route");
const { POST: lookup } = await import("@/app/api/order-lookup/route");
const { LOOKUP_MESSAGE } = await import("@/app/api/leads/_lib");

type State = {
  ipCount: number;
  emailCount: number;
  dupCount: number;
  orders: Record<string, unknown>[];
};
let state: State;
let calls: Call[];

function respond(c: Call): Result | undefined {
  if (c.table === "leads") {
    if (c.op === "insert") return { data: { id: "lead_1" } };
    if (filter(c, "eq", "ip_hash")) return { count: state.ipCount };
    if (filter(c, "eq", "kind")) return { count: state.dupCount };
    if (filter(c, "eq", "email")) return { count: state.emailCount };
  }
  if (c.table === "orders") return { data: state.orders };
  return {};
}

beforeEach(() => {
  state = { ipCount: 0, emailCount: 0, dupCount: 0, orders: [] };
  const f = createFakeDb(respond);
  h.fake = f;
  calls = f.calls;
  h.sendEmail.mockClear();
});

function post(handler: (r: NextRequest) => Promise<Response>, body: unknown, raw = false) {
  return handler(
    new NextRequest("https://juryhour.test/api/x", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", cookie: "jh_src=reddit" },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );
}

const inserts = (table: string) => calls.filter((c) => c.table === table && c.op === "insert");

describe("POST /api/leads", () => {
  it("stores a waitlist lead with hashed ip and src from the cookie", async () => {
    const res = await post(leads, { kind: "waitlist", email: " Me@Example.com ", payload: { tier: "proof" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const ins = inserts("leads");
    expect(ins).toHaveLength(1);
    const row = ins[0].payload as Record<string, unknown>;
    expect(row).toMatchObject({ kind: "waitlist", email: "me@example.com", payload: { tier: "proof" }, src: "reddit" });
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("203.0.113.9");
  });

  it("agency_offer payload accepted; body src wins over cookie", async () => {
    const res = await post(leads, { kind: "agency_offer", email: "a@agency.co", payload: { agency: "Acme", client_url: "https://c.com/", note: null }, src: "Partner_1" });
    expect(res.status).toBe(200);
    expect((inserts("leads")[0].payload as Record<string, unknown>).src).toBe("partner_1");
  });

  it.each([
    ["not json", "{", true],
    ["unknown kind", { kind: "order_lookup", email: "a@b.co" }, false],
    ["bad email", { kind: "waitlist", email: "nope" }, false],
    ["too many payload keys", { kind: "waitlist", email: "a@b.co", payload: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, 1])) }, false],
    ["nested payload", { kind: "waitlist", email: "a@b.co", payload: { x: { y: 1 } } }, false],
  ])("400 bad_request: %s", async (_n, body, raw) => {
    const res = await post(leads, body, raw as boolean);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "bad_request" });
    expect(inserts("leads")).toHaveLength(0);
  });

  it("429 after 5 leads from one network in 24h", async () => {
    state.ipCount = 5;
    const res = await post(leads, { kind: "waitlist", email: "a@b.co" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, code: "rate_limited" });
    expect(inserts("leads")).toHaveLength(0);
  });

  it("repeat of the same kind+email is a silent no-op", async () => {
    state.dupCount = 1;
    const res = await post(leads, { kind: "waitlist", email: "a@b.co" });
    expect(await res.json()).toEqual({ ok: true });
    expect(inserts("leads")).toHaveLength(0);
  });

  it("honeypot filled → ok, nothing stored", async () => {
    const res = await post(leads, { kind: "waitlist", email: "a@b.co", hp: "http://spam" });
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });

  it("db failure → 500 internal (structured)", async () => {
    h.fake = createFakeDb(() => ({ error: { message: "down" } }));
    const res = await post(leads, { kind: "waitlist", email: "a@b.co" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, code: "internal" });
  });
});

describe("POST /api/order-lookup", () => {
  const paid = { token: "tok_paid_0123456789abcdefghij", tier: "proof", stage: "DELIVERED", created_at: "2026-10-24T10:00:00Z", paid_at: "2026-10-24T10:01:00Z" };
  const abandoned = { token: "tok_abandoned_0123456789abcd", tier: "spark", stage: "CREATED", created_at: "2026-10-24T09:00:00Z", paid_at: null };
  const quote = { token: "tok_quote_0123456789abcdefgh", tier: "specialist", stage: "CREATED", created_at: "2026-10-24T08:00:00Z", paid_at: null };

  async function bodyOf(email: string) {
    const res = await post(lookup, { email });
    return { status: res.status, body: await res.json() };
  }

  it("customer, non-customer and per-email-limited requests get the identical answer", async () => {
    state.orders = [paid];
    const a = await bodyOf("customer@example.com");
    state.orders = [];
    const b = await bodyOf("stranger@example.com");
    state.orders = [paid];
    state.emailCount = 3;
    const c = await bodyOf("customer@example.com");
    expect(a).toEqual({ status: 200, body: { ok: true, message: LOOKUP_MESSAGE } });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("sends one email with paid orders and quote requests only", async () => {
    state.orders = [paid, abandoned, quote];
    await bodyOf("Customer@Example.com");
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const arg = (h.sendEmail.mock.calls[0] as unknown[])[0] as { template: string; to: string; vars: { orders: string }; idempotencyKey: string };
    expect(arg.template).toBe("order_lookup");
    expect(arg.to).toBe("customer@example.com");
    expect(arg.idempotencyKey).toBe("order_lookup:lead_1");
    const sent = JSON.parse(arg.vars.orders) as { token: string }[];
    expect(sent.map((o) => o.token)).toEqual([paid.token, quote.token]);
    const orderQuery = calls.find((c) => c.table === "orders")!;
    expect(filter(orderQuery, "eq", "email")).toBe("customer@example.com");
    expect(filter(orderQuery, "eq", "mode")).toBe("sandbox");
    expect(inserts("leads")[0].payload).toMatchObject({ kind: "order_lookup", email: "customer@example.com" });
  });

  it("no orders → no email", async () => {
    state.orders = [abandoned];
    await bodyOf("x@example.com");
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("3 lookups per email per day: the 4th is answered the same but not sent", async () => {
    state.orders = [paid];
    state.emailCount = 3;
    await bodyOf("customer@example.com");
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("429 after 10 lookups from one network", async () => {
    state.ipCount = 10;
    const res = await post(lookup, { email: "a@b.co" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, code: "rate_limited" });
    expect(inserts("leads")).toHaveLength(0);
  });

  it("400 on a bad email or body", async () => {
    expect((await post(lookup, { email: "nope" })).status).toBe(400);
    expect((await post(lookup, "{", true)).status).toBe(400);
  });

  it("an email failure never changes the response", async () => {
    state.orders = [paid];
    h.sendEmail.mockRejectedValueOnce(new Error("resend down"));
    const r = await bodyOf("customer@example.com");
    expect(r).toEqual({ status: 200, body: { ok: true, message: LOOKUP_MESSAGE } });
  });
});
