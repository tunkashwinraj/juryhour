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
const { resetEnvCache } = await import("@/lib/env");
const TIER_JURORS: Record<string, number> = { spark: 3, proof: 20, retest: 8 };

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
  retestsUsed: number;
  /** Paid Verdicts already on this email + mode (HALF is first-Verdict only). */
  priorVerdicts: number;
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
    if (c.op === "select" && filterValue(c, "parent_order_id")) {
      return { count: filterValue(c, "tier") === "retest" ? state.retestsUsed : state.parentUsed };
    }
    if (c.op === "select" && filterValue(c, "id") === PARENT_ID) return { data: state.parent };
    if (c.op === "select" && filterValue(c, "email") && filterValue(c, "tier") === "proof") return { count: state.priorVerdicts };
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

const VALID = { tier: "proof", email: "Founder@Example.com ", buyer_desc: "indie SaaS founders", url: "https://example.com" };

beforeEach(() => {
  state = {
    paused: false,
    prices: [
      { tier: "spark", current_usd: 11 },
      { tier: "pulse", current_usd: 49 },
      { tier: "proof", current_usd: "299.00" },
      { tier: "retest", current_usd: 59 },
      { tier: "launch_pack", current_usd: 199 },
    ],
    parent: null,
    parentUsed: 0,
    retestsUsed: 0,
    priorVerdicts: 0,
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

describe("POST /api/checkout — retired tiers and add-ons", () => {
  it.each(["pulse", "launch_pack", "specialist", "gold"])("400 tier_not_offered for %s", async (tier) => {
    const res = await post(checkout, { ...VALID, tier });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "tier_not_offered" });
    expect(body.error).toMatch(/Quick Read \(spark\), Verdict \(proof\), Retest \(retest\)/);
    expect(inserted()).toBeUndefined();
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it.each([[["extra5"]], [["rush"]], [["extra5", "rush"]], [["secondPage"]], [["vip"]]])("400 addons_not_offered for %j", async (addons) => {
    const res = await post(checkout, { ...VALID, addons });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "addons_not_offered" });
    expect(inserted()).toBeUndefined();
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it("an empty add-on list is fine", async () => {
    const res = await post(checkout, { ...VALID, addons: [] });
    expect(res.status).toBe(200);
    expect(inserted()).toMatchObject({ addons: [], price_usd: 299 });
    expect(inserted()).not.toHaveProperty("extra_jurors"); // only sent when used (pre-migration safe)
  });
});

describe("POST /api/checkout — retest", () => {
  const RETEST = { ...VALID, tier: "retest", url: "https://example.com/v2", parent_order_id: PARENT_ID };
  const deliveredVerdict = (over: Record<string, unknown> = {}) => ({
    id: PARENT_ID,
    tier: "proof",
    stage: "DELIVERED",
    price_usd: "99.00",
    paid_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    delivered_at: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    email: "founder@example.com",
    mode: "sandbox",
    ...over,
  });
  const refusal = async (body: unknown) => {
    const res = await post(checkout, body);
    expect(res.status).toBe(400);
    expect(inserted()).toBeUndefined();
    expect(h.createCheckout).not.toHaveBeenCalled();
    return (await res.json()) as { ok: boolean; code: string; error: string };
  };

  it("happy path: $59 order linked to the Verdict, no credit, no retest flag", async () => {
    state.parent = deliveredVerdict();
    const res = await post(checkout, RETEST);
    expect(res.status).toBe(200);
    expect(inserted()).toMatchObject({
      tier: "retest",
      addons: [],
      price_usd: 59,
      url: "https://example.com/v2",
      parent_order_id: PARENT_ID,
      retest_available: false,
    });
    expect(m(h.createCheckout).mock.calls[0][0]).toMatchObject({ amountUsd: 59, title: "JuryHour Retest · JH-33333333" });
    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "checkout_created", reasoning: `retest of ${PARENT_ID}`, payload: expect.objectContaining({ tier: "retest", credit_usd: 0 }) }),
    );
    // One-retest-per-parent lookup counts only paid retests of this parent.
    const usage = (h.fake!.calls as DbCall[]).find((c) => c.table === "orders" && c.op === "select" && filterValue(c, "parent_order_id"))!;
    expect(filterValue(usage, "parent_order_id")).toBe(PARENT_ID);
    expect(filterValue(usage, "tier")).toBe("retest");
    expect(usage.filters).toContainEqual(["not.is", "paid_at", null]);
  });

  it("a PARTIAL Verdict qualifies too", async () => {
    state.parent = deliveredVerdict({ stage: "PARTIAL" });
    expect((await post(checkout, RETEST)).status).toBe(200);
  });

  it("uses the CEO-adjusted retest price", async () => {
    state.parent = deliveredVerdict();
    state.prices = [{ tier: "retest", current_usd: 62 }];
    await post(checkout, RETEST);
    expect(inserted()).toMatchObject({ price_usd: 62 });
  });

  it("a Retest can carry extra jurors; HALF doesn't apply to it", async () => {
    state.parent = deliveredVerdict();
    const res = await post(checkout, { ...RETEST, extra_jurors: 4 });
    expect(res.status).toBe(200);
    expect(inserted()).toMatchObject({ tier: "retest", price_usd: 59 + 28, extra_jurors: 4 });
    m(h.createCheckout).mockClear();
    h.fake = createFakeDb(respond);
    expect((await refusal({ ...RETEST, coupon: "HALF" })).code).toBe("coupon_not_applicable");
  });

  it("retest_needs_parent without parent_order_id (before any DB read)", async () => {
    const { parent_order_id: _drop, ...noParent } = RETEST;
    void _drop;
    const body = await refusal(noParent);
    expect(body.code).toBe("retest_needs_parent");
    expect((h.fake!.calls as DbCall[]).length).toBe(0);
  });

  it.each<[string, Record<string, unknown> | null]>([
    ["unknown parent", null],
    ["Quick Read parent", { tier: "spark", stage: "DELIVERED" }],
    ["retest parent", { tier: "retest" }],
    ["Launch Pack parent", { tier: "launch_pack" }],
    ["Verdict not delivered yet", { stage: "PANEL_LIVE", delivered_at: null }],
    ["refunded Verdict", { stage: "REFUNDED" }],
    ["other email", { email: "other@example.com" }],
    ["other mode", { mode: "live" }],
  ])("retest_parent_not_eligible: %s", async (_n, over) => {
    state.parent = over === null ? null : deliveredVerdict(over);
    expect((await refusal(RETEST)).code).toBe("retest_parent_not_eligible");
  });

  it("retest_window_expired more than 30 days after delivery", async () => {
    state.parent = deliveredVerdict({ delivered_at: new Date(Date.now() - 31 * 86_400_000).toISOString() });
    const body = await refusal(RETEST);
    expect(body.code).toBe("retest_window_expired");
    expect(body.error).toMatch(/30 days/);
  });

  it("retest_already_used when a paid retest already names the Verdict", async () => {
    state.parent = deliveredVerdict();
    state.retestsUsed = 1;
    expect((await refusal(RETEST)).code).toBe("retest_already_used");
  });

  it("an unpaid (abandoned) retest checkout does not block a new one", async () => {
    state.parent = deliveredVerdict();
    state.parentUsed = 0;
    state.retestsUsed = 0;
    expect((await post(checkout, RETEST)).status).toBe(200);
  });

  it("refuses retest add-ons before checking the parent", async () => {
    state.parent = deliveredVerdict();
    expect((await refusal({ ...RETEST, addons: ["rush"] })).code).toBe("addons_not_offered");
  });
});

describe("POST /api/checkout — coupon HALF", () => {
  afterEach(() => {
    delete process.env.COUPON_HALF_ENDS_AT;
  });
  const at = (iso: string) => vi.useFakeTimers({ now: new Date(iso), toFake: ["Date"] });
  const firstVerdictLookup = () =>
    (h.fake!.calls as DbCall[]).find((c) => c.table === "orders" && c.op === "select" && filterValue(c, "email"));

  it("happy path: explicit HALF → first Verdict $149, stored as promo_code, titled with the code", async () => {
    at("2026-11-10T12:00:00Z");
    const res = await post(checkout, { ...VALID, coupon: "half" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, price_usd: 149, coupon_applied: "HALF", credit_usd: 0 });
    expect(inserted()).toMatchObject({ tier: "proof", price_usd: 149, promo_code: "HALF" });
    expect(m(h.createCheckout).mock.calls[0][0]).toMatchObject({ amountUsd: 149, title: "JuryHour Verdict (HALF) · JH-33333333" });
    // first-Verdict check: paid proof orders for this email + mode
    const q = firstVerdictLookup()!;
    expect([filterValue(q, "email"), filterValue(q, "mode"), filterValue(q, "tier")]).toEqual(["founder@example.com", "sandbox", "proof"]);
    expect(q.filters).toContainEqual(["not.is", "paid_at", null]);
  });

  it("auto-applies from ?code=HALF (attribution code)", async () => {
    at("2026-11-10T12:00:00Z");
    await post(checkout, { ...VALID, code: "HALF", src: "reddit" });
    expect(inserted()).toMatchObject({ price_usd: 149, promo_code: "HALF", src: "reddit" });
  });

  it("an attribution HALF that can't apply is attribution only (no refusal)", async () => {
    at("2026-11-10T12:00:00Z");
    await post(checkout, { ...VALID, tier: "spark", code: "HALF" });
    expect(inserted()).toMatchObject({ tier: "spark", price_usd: 11, promo_code: "HALF" });
    h.fake = createFakeDb(respond);
    state.priorVerdicts = 1;
    await post(checkout, { ...VALID, code: "HALF" });
    expect(inserted()).toMatchObject({ price_usd: 299, promo_code: "HALF" });
    h.fake = createFakeDb(respond);
    state.priorVerdicts = 0;
    at("2026-12-02T00:00:00Z");
    await post(checkout, { ...VALID, code: "HALF" });
    expect(inserted()).toMatchObject({ price_usd: 299, promo_code: "HALF" });
  });

  it("partner codes never change the price", async () => {
    at("2026-11-10T12:00:00Z");
    await post(checkout, { ...VALID, code: "whop" });
    expect(inserted()).toMatchObject({ price_usd: 299, promo_code: "WHOP" });
  });

  it.each<[string, Record<string, unknown>, string, number, string]>([
    ["unknown code", { coupon: "LOVABLE" }, "2026-11-10T12:00:00Z", 0, "coupon_unknown"],
    ["the retired TODAY50", { coupon: "TODAY50" }, "2026-10-25T12:00:00Z", 0, "coupon_unknown"],
    ["expired at the end of Nov 30 ET", { coupon: "HALF" }, "2026-12-01T05:00:00Z", 0, "coupon_expired"],
    ["Quick Read", { coupon: "HALF", tier: "spark" }, "2026-11-10T12:00:00Z", 0, "coupon_not_applicable"],
    ["returning Verdict customer", { coupon: "HALF" }, "2026-11-10T12:00:00Z", 1, "coupon_already_used"],
  ])("400 %s → %s", async (_n, over, now, prior, code) => {
    at(now);
    state.priorVerdicts = prior;
    const res = await post(checkout, { ...VALID, ...over });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code });
    expect(body.error.length).toBeGreaterThan(10);
    expect(inserted()).toBeUndefined();
    expect(h.createCheckout).not.toHaveBeenCalled();
  });

  it("still valid one second before the end", async () => {
    at("2026-12-01T04:59:59Z");
    expect((await post(checkout, { ...VALID, coupon: "HALF" })).status).toBe(200);
    expect(inserted()).toMatchObject({ price_usd: 149 });
  });

  it("never discounts extra jurors: $149 + 10 × $7", async () => {
    at("2026-11-10T12:00:00Z");
    await post(checkout, { ...VALID, coupon: "HALF", extra_jurors: 10 });
    expect(inserted()).toMatchObject({ price_usd: 219, extra_jurors: 10 });
    expect(m(h.createCheckout).mock.calls[0][0]).toMatchObject({ amountUsd: 219, title: "JuryHour Verdict + 10 extra jurors (HALF) · JH-33333333" });
  });

  it("HALF + Quick Read credit = $138 (and + 20 extra jurors = $278, margin still ≥ 30%)", async () => {
    at("2026-11-10T12:00:00Z");
    state.parent = { id: PARENT_ID, tier: "spark", price_usd: "11.00", paid_at: new Date(Date.now() - 3600_000).toISOString(), email: "founder@example.com", mode: "sandbox" };
    const res = await post(checkout, { ...VALID, parent_order_id: PARENT_ID, coupon: "HALF" });
    expect(await res.json()).toMatchObject({ ok: true, price_usd: 138, coupon_applied: "HALF", credit_usd: 11 });
    expect(inserted()).toMatchObject({ price_usd: 138, promo_code: "HALF", parent_order_id: PARENT_ID });
    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "checkout_created", payload: expect.objectContaining({ coupon: "HALF", discount_usd: 150, credit_usd: 11 }) }),
    );
    h.fake = createFakeDb(respond);
    await post(checkout, { ...VALID, parent_order_id: PARENT_ID, coupon: "HALF", extra_jurors: 20 });
    expect(inserted()).toMatchObject({ price_usd: 278, extra_jurors: 20 });
  });

  it("env COUPON_HALF_ENDS_AT in the past switches HALF off", async () => {
    at("2026-11-10T12:00:00Z");
    process.env.COUPON_HALF_ENDS_AT = "2026-11-01T00:00:00Z";
    const res = await post(checkout, { ...VALID, coupon: "HALF" });
    expect(await res.json()).toMatchObject({ code: "coupon_expired" });
  });

  it("margin_too_low when HALF meets a CEO price at the bottom of the band", async () => {
    at("2026-11-10T12:00:00Z");
    state.prices = [{ tier: "proof", current_usd: 224.25 }];
    const res = await post(checkout, { ...VALID, coupon: "HALF" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "margin_too_low" });
    expect(inserted()).toBeUndefined();
  });
});

describe("POST /api/checkout — extra jurors", () => {
  it.each<[string, number, number]>([
    ["spark", 3, 11 + 21],
    ["proof", 20, 299 + 140],
  ])("%s + %d extra jurors", async (tier, n, price) => {
    const res = await post(checkout, { ...VALID, tier, extra_jurors: n });
    expect(res.status).toBe(200);
    expect(inserted()).toMatchObject({ tier, extra_jurors: n, price_usd: price, addons: [] });
    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ extra_jurors: n, jurors: TIER_JURORS[tier] + n }) }),
    );
  });

  it.each([-1, 21, 2.5])("400 extra_jurors_out_of_range for %s", async (n) => {
    const res = await post(checkout, { ...VALID, extra_jurors: n });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "extra_jurors_out_of_range" });
    expect(inserted()).toBeUndefined();
  });

  it("non-numeric extra_jurors is a bad request", async () => {
    expect((await post(checkout, { ...VALID, extra_jurors: "five" })).status).toBe(400);
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
    expect(body).toEqual({
      ok: true,
      purchase_url: "https://sandbox.whop.com/checkout/ch_test123/",
      token: expect.any(String),
      price_usd: 299,
      coupon_applied: null,
      credit_usd: 0,
    });
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url

    expect(inserted()).toEqual({
      token: body.token,
      mode: "sandbox",
      stage: "CREATED",
      tier: "proof",
      addons: [],
      price_usd: 299,
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
      amountUsd: 299,
      title: "JuryHour Verdict · JH-33333333",
      mode: "sandbox",
      redirectUrl: `https://juryhour.test/o/${body.token}?paid=1`,
    });

    const upd = (h.fake!.calls as DbCall[]).find((c) => c.table === "orders" && c.op === "update")!;
    expect(upd.payload).toEqual({ whop_checkout_id: "ch_test123" });
    expect(filterValue(upd, "id")).toBe(ORDER_ID);

    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: ORDER_ID, actor: "code", action: "checkout_created", payload: expect.objectContaining({ price_usd: 299, whop_checkout_id: "ch_test123" }) }),
    );
  });

  it("uses the CEO-adjusted price from the prices table", async () => {
    state.prices = [{ tier: "proof", current_usd: 279.5 }];
    await post(checkout, VALID);
    expect(inserted()).toMatchObject({ price_usd: 279.5 });
  });

  it("falls back to the constant price when the prices row is missing", async () => {
    state.prices = [];
    await post(checkout, { ...VALID, tier: "spark" });
    expect(inserted()).toMatchObject({ tier: "spark", price_usd: 11 });
  });

  it("a launch-offer env left set changes nothing: the prices table is the price", async () => {
    process.env.LAUNCH_OFFER_ENDS_AT = new Date(Date.now() + 3600_000).toISOString();
    process.env.LAUNCH_OFFER_PRICE = "79";
    resetEnvCache();
    try {
      await post(checkout, VALID);
      expect(inserted()).toMatchObject({ price_usd: 299 });
    } finally {
      delete process.env.LAUNCH_OFFER_ENDS_AT;
      delete process.env.LAUNCH_OFFER_PRICE;
      resetEnvCache();
    }
  });

  it("reads src from the jh_src cookie when the body has none", async () => {
    await post(checkout, VALID, "jh_src=reddit");
    expect(inserted()).toMatchObject({ src: "reddit" });
  });

  it("applies upgrade credit from a paid Quick Read parent (same email, same mode): Verdict for $288", async () => {
    state.parent = { id: PARENT_ID, tier: "spark", price_usd: "11.00", paid_at: new Date(Date.now() - 3600_000).toISOString(), email: "founder@example.com", mode: "sandbox" };
    await post(checkout, { ...VALID, parent_order_id: PARENT_ID });
    expect(inserted()).toMatchObject({ price_usd: 288, parent_order_id: PARENT_ID });
    expect(m(h.createCheckout).mock.calls[0][0]).toMatchObject({ amountUsd: 288, title: "JuryHour Verdict (upgrade credit applied) · JH-33333333" });
  });

  it("no second credit when the parent was already used by a paid order", async () => {
    state.parent = { id: PARENT_ID, tier: "spark", price_usd: 11, paid_at: new Date(Date.now() - 3600_000).toISOString(), email: "founder@example.com", mode: "sandbox" };
    state.parentUsed = 1;
    await post(checkout, { ...VALID, parent_order_id: PARENT_ID });
    expect(inserted()).toMatchObject({ price_usd: 299 });
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

describe("POST /api/quote (retired)", () => {
  it("refuses new specialist quotes with tier_not_offered and creates nothing", async () => {
    const res = await post(quote, { email: "a@b.co", buyer_desc: "hospital procurement leads", url: "https://example.com" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "tier_not_offered" });
    expect(inserted()).toBeUndefined();
    expect(h.createCheckout).not.toHaveBeenCalled();
  });
});
