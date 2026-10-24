import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, filterValue, type DbCall, type DbResult } from "./fakeDb";

const h = vi.hoisted(() => ({
  respond: (() => undefined) as (c: unknown) => unknown,
  fake: null as null | { client: unknown; calls: unknown[] },
  logEvent: null as unknown,
  openIncident: null as unknown,
  createCheckout: null as unknown,
}));

vi.mock("@/lib/db", () => {
  h.logEvent = vi.fn(async () => {});
  h.openIncident = vi.fn(async () => {});
  return { db: () => h.fake!.client, logEvent: h.logEvent, openIncident: h.openIncident };
});

vi.mock("@/lib/whop", () => {
  h.createCheckout = vi.fn(async () => ({ checkoutId: "ch_test123", purchaseUrl: "https://sandbox.whop.com/checkout/ch_test123/" }));
  return { createCheckout: h.createCheckout };
});

const { POST: checkout } = await import("@/app/api/checkout/route");
const { POST: quote } = await import("@/app/api/quote/route");

type Mocked = ReturnType<typeof vi.fn>;
const m = (x: unknown) => x as Mocked;

const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const PARENT_ID = "44444444-4444-4444-8444-444444444444";
const PREVIEW_ID = "55555555-5555-4555-8555-555555555555";

type State = {
  paused: boolean;
  prices: { tier: string; current_usd: number | string }[];
  parent: Record<string, unknown> | null;
  parentUsed: number;
  preview: { id: string; safety_verdict: string } | null;
};
let state: State;

function respond(c: DbCall): DbResult | undefined {
  if (c.table === "company_state") return { data: { sales_paused: state.paused, pause_reason: state.paused ? "low terac balance" : null } };
  if (c.table === "prices") return { data: state.prices };
  if (c.table === "previews") return { data: state.preview };
  if (c.table === "orders") {
    if (c.op === "insert") return { data: { id: ORDER_ID } };
    if (c.op === "update") return { data: null };
    if (c.op === "select" && filterValue(c, "parent_order_id")) return { count: state.parentUsed };
    if (c.op === "select" && filterValue(c, "id") === PARENT_ID) return { data: state.parent };
  }
  return { data: null };
}

function post(handler: (r: NextRequest) => Promise<Response>, body: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return handler(
    new NextRequest("https://juryhour.test/api/x", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers,
    }),
  );
}

const inserted = () => (h.fake!.calls as DbCall[]).find((c) => c.table === "orders" && c.op === "insert")?.payload as Record<string, unknown> | undefined;

const VALID = { tier: "proof", addons: ["extra5"], email: "Founder@Example.com ", buyer_desc: "indie SaaS founders", url: "https://example.com" };

beforeEach(() => {
  state = {
    paused: false,
    prices: [
      { tier: "spark", current_usd: 11 },
      { tier: "pulse", current_usd: 49 },
      { tier: "proof", current_usd: "149.00" },
      { tier: "launch_pack", current_usd: 199 },
    ],
    parent: null,
    parentUsed: 0,
    preview: null,
  };
  h.fake = createFakeDb(respond);
  for (const fn of [h.logEvent, h.openIncident, h.createCheckout]) m(fn).mockClear();
});

afterEach(() => vi.useRealTimers());

describe("POST /api/checkout — validation", () => {
  const bad: [string, unknown][] = [
    ["non-JSON body", "not json"],
    ["missing tier", { ...VALID, tier: undefined }],
    ["specialist is not buyable", { ...VALID, tier: "specialist" }],
    ["unknown tier", { ...VALID, tier: "gold" }],
    ["unknown add-on", { ...VALID, addons: ["vip"] }],
    ["bad email", { ...VALID, email: "nope" }],
    ["no url or pitch", { ...VALID, url: undefined }],
    ["both url and pitch", { ...VALID, pitch_text: "x".repeat(60) }],
    ["non-http url", { ...VALID, url: "ftp://example.com" }],
    ["short buyer_desc", { ...VALID, buyer_desc: "a" }],
    ["bad preview_id", { ...VALID, preview_id: "123" }],
    ["bad parent_order_id", { ...VALID, parent_order_id: "abc" }],
  ];
  it.each(bad)("400 on %s", async (_n, body) => {
    const res = await post(checkout, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "bad_request" });
    expect(inserted()).toBeUndefined();
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it("treats empty strings as absent (pitch_text with url: '')", async () => {
    const res = await post(checkout, { ...VALID, url: "", pitch_text: "We help indie founders test landing pages with real buyers fast." });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/checkout — business rules", () => {
  it("refuses when sales are paused (503, no order, no Whop call)", async () => {
    state.paused = true;
    const res = await post(checkout, VALID);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, code: "sales_paused" });
    expect(inserted()).toBeUndefined();
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it("refuses a preview the safety screen refused", async () => {
    state.preview = { id: PREVIEW_ID, safety_verdict: "refuse" };
    const res = await post(checkout, { ...VALID, preview_id: PREVIEW_ID });
    expect(res.status).toBe(403);
    expect(inserted()).toBeUndefined();
  });

  it("creates a CREATED order with the contract shape and returns purchase_url + token", async () => {
    state.preview = { id: PREVIEW_ID, safety_verdict: "allow" };
    const res = await post(checkout, { ...VALID, preview_id: PREVIEW_ID, src: "x_launch" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, purchase_url: "https://sandbox.whop.com/checkout/ch_test123/", token: expect.any(String) });
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url

    expect(inserted()).toEqual({
      token: body.token,
      mode: "sandbox",
      stage: "CREATED",
      tier: "proof",
      addons: ["extra5"],
      price_usd: 164,
      email: "founder@example.com",
      url: "https://example.com",
      pitch_text: null,
      buyer_desc: "indie SaaS founders",
      src: "x_launch",
      preview_id: PREVIEW_ID,
      parent_order_id: null,
      retest_available: false,
      promo_code: null,
      deadline_at: null,
    });

    expect(h.createCheckout).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      amountUsd: 164,
      title: "JuryHour Proof + 5 extra jurors",
      mode: "sandbox",
      redirectUrl: `https://juryhour.test/o/${body.token}?paid=1`,
    });

    const upd = (h.fake!.calls as DbCall[]).find((c) => c.table === "orders" && c.op === "update")!;
    expect(upd.payload).toEqual({ whop_checkout_id: "ch_test123" });
    expect(filterValue(upd, "id")).toBe(ORDER_ID);

    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: ORDER_ID, actor: "code", action: "checkout_created", payload: expect.objectContaining({ price_usd: 164, whop_checkout_id: "ch_test123" }) }),
    );
  });

  it("launch_pack sets retest_available", async () => {
    await post(checkout, { ...VALID, tier: "launch_pack", addons: [] });
    expect(inserted()).toMatchObject({ tier: "launch_pack", price_usd: 199, retest_available: true });
  });

  it("uses the CEO-adjusted price from the prices table", async () => {
    state.prices = [{ tier: "pulse", current_usd: 55.5 }];
    await post(checkout, { ...VALID, tier: "pulse", addons: [] });
    expect(inserted()).toMatchObject({ price_usd: 55.5 });
  });

  it("reads src from the jh_src cookie when the body has none", async () => {
    await post(checkout, VALID, "jh_src=reddit");
    expect(inserted()).toMatchObject({ src: "reddit" });
  });

  it("applies upgrade credit from a paid spark parent (same email, same mode)", async () => {
    state.parent = { id: PARENT_ID, tier: "spark", price_usd: "11.00", paid_at: new Date(Date.now() - 3600_000).toISOString(), email: "founder@example.com", mode: "sandbox" };
    await post(checkout, { ...VALID, addons: [], parent_order_id: PARENT_ID });
    expect(inserted()).toMatchObject({ price_usd: 138, parent_order_id: PARENT_ID });
    expect(m(h.createCheckout).mock.calls[0][0]).toMatchObject({ amountUsd: 138, title: "JuryHour Proof (upgrade credit applied)" });
  });

  it("no second credit when the parent was already used by a paid order", async () => {
    state.parent = { id: PARENT_ID, tier: "spark", price_usd: 11, paid_at: new Date(Date.now() - 3600_000).toISOString(), email: "founder@example.com", mode: "sandbox" };
    state.parentUsed = 1;
    await post(checkout, { ...VALID, addons: [], parent_order_id: PARENT_ID });
    expect(inserted()).toMatchObject({ price_usd: 149 });
  });

  it("rejects a parent order belonging to another email", async () => {
    state.parent = { id: PARENT_ID, tier: "spark", price_usd: 11, paid_at: new Date().toISOString(), email: "other@example.com", mode: "sandbox" };
    const res = await post(checkout, { ...VALID, parent_order_id: PARENT_ID });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "bad_parent" });
    expect(inserted()).toBeUndefined();
  });

  it("Whop failure → 502, incident opened, order left CREATED without checkout id", async () => {
    m(h.createCheckout).mockRejectedValueOnce(new Error("Whop sandbox POST /checkout_configurations → 500"));
    const res = await post(checkout, VALID);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, code: "checkout_unavailable" });
    expect(h.openIncident).toHaveBeenCalledWith("whop_checkout_failed", expect.any(String), ORDER_ID);
    expect((h.fake!.calls as DbCall[]).some((c) => c.op === "update")).toBe(false);
  });

  it("DB failure → 500 internal", async () => {
    h.fake = createFakeDb((c) => (c.table === "orders" && c.op === "insert" ? { error: { message: "boom" } } : respond(c)));
    const res = await post(checkout, VALID);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, code: "internal" });
  });
});

describe("POST /api/quote", () => {
  it("creates a specialist order with null price and a 48h quote expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    const res = await post(quote, { email: "a@b.co", buyer_desc: "hospital procurement leads", url: "https://example.com" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    expect(inserted()).toEqual({
      token: body.token,
      mode: "sandbox",
      stage: "CREATED",
      tier: "specialist",
      addons: [],
      price_usd: null,
      email: "a@b.co",
      url: "https://example.com",
      pitch_text: null,
      buyer_desc: "hospital procurement leads",
      src: null,
      preview_id: null,
      quote_expires_at: "2026-10-26T12:00:00.000Z",
      deadline_at: null,
    });
    expect(h.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "quote_requested", actor: "code", order_id: ORDER_ID }));
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it("validates input and refuses when paused", async () => {
    expect((await post(quote, { email: "a@b.co", buyer_desc: "x" })).status).toBe(400);
    state.paused = true;
    expect((await post(quote, { email: "a@b.co", buyer_desc: "buyers", url: "https://example.com" })).status).toBe(503);
    expect(inserted()).toBeUndefined();
  });
});
