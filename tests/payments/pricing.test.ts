import { describe, expect, it } from "vitest";
import {
  checkoutTitle,
  WHOP_TITLE_MAX,
  computePrice,
  isBuyableTier,
  MIN_CHECKOUT_USD,
  PricingError,
  proRataCap,
  retestRefusal,
  type RetestParent,
} from "@/lib/pricing";
import {
  BUYABLE_TIERS,
  EXTRA_JUROR_USD,
  MARGIN_FLOOR,
  MAX_EXTRA_JURORS,
  PUBLIC_TIER_LABELS,
  RETEST_WINDOW_DAYS,
  TIERS,
  TIER_LABELS,
  VERDICT_BADGE,
  VERDICT_REGULAR_FROM,
  VERDICT_REGULAR_USD,
  WHOP_FEE,
  type TierName,
} from "@/lib/constants";
import { HALF_DEFAULT, checkCoupon, configuredCoupon, couponEndsLabel, couponPrice, type Coupon } from "@/lib/coupons";
import { checkLaunch, grossMargin, marginOk, panelSpec, priceFloor } from "@/lib/guardrails";

const BASE_PRICES = { spark: 11, proof: 299, retest: 59 };
const NOW = new Date("2026-10-24T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const HALF: Coupon = HALF_DEFAULT;
const codeOf = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return (e as PricingError).code;
  }
  return null;
};
const margin = (price: number, cap: number) => (price - cap - WHOP_FEE(price)) / price;

describe("pricing constants (v3)", () => {
  it("public plans: Quick Read $11 and Verdict $299 (20 jurors, cap $80); Retest $59; Pulse, Launch Pack and Specialist retired", () => {
    expect(BUYABLE_TIERS).toEqual(["spark", "proof", "retest"]);
    expect(TIERS.spark).toMatchObject({ price: 11, jurors: 3, minJurors: 3, jurorCostCap: 7, format: "spark", deadlineHours: 4, sold: true });
    expect(TIERS.proof).toMatchObject({ price: 299, jurors: 20, minJurors: 14, minutes: 8, jurorCostCap: 80, format: "proof", deadlineHours: 8, sold: true });
    expect(TIERS.retest).toMatchObject({ price: 59, jurors: 8, minJurors: 6, jurorCostCap: 32, format: "proof", deadlineHours: 8, sold: true });
    expect([TIERS.pulse.sold, TIERS.launch_pack.sold, TIERS.specialist.sold]).toEqual([false, false, false]);
    expect(RETEST_WINDOW_DAYS).toBe(30);
    expect([EXTRA_JUROR_USD, MAX_EXTRA_JURORS]).toEqual([7, 20]);
    expect(VERDICT_BADGE).toBe("Recommended");
    expect([VERDICT_REGULAR_USD, VERDICT_REGULAR_FROM]).toEqual([499, "Dec 1"]);
  });

  it("labels: internal TIER_LABELS; customer-facing names never show retired names", () => {
    expect(TIER_LABELS).toMatchObject({ spark: "Quick Read", proof: "Verdict", retest: "Retest", pulse: "Pulse (retired)", launch_pack: "Launch Pack (retired)" });
    for (const label of Object.values(PUBLIC_TIER_LABELS)) expect(label).not.toMatch(/Spark|Pulse|Proof|Launch Pack|Specialist/);
  });

  it("isBuyableTier: only spark, proof, retest", () => {
    expect(["spark", "proof", "retest", "pulse", "launch_pack", "specialist", "x"].map(isBuyableTier)).toEqual([
      true, true, true, false, false, false, false,
    ]);
  });
});

describe("computePrice — tiers", () => {
  it.each<[TierName, number, number, number]>([
    ["spark", 11, 3, 7],
    ["proof", 299, 20, 80],
    ["retest", 59, 8, 32],
  ])("%s → $%d, %d jurors, cap $%d", (tier, price, jurors, cap) => {
    expect(computePrice({ tier, prices: BASE_PRICES, now: NOW })).toMatchObject({
      priceUsd: price, listUsd: price, creditUsd: 0, discountUsd: 0, couponCode: null, extraJurors: 0, jurors, jurorCostCap: cap,
    });
  });

  it("uses the prices table (CEO-adjusted) over the constant, and falls back when missing", () => {
    expect(computePrice({ tier: "proof", prices: { proof: 279 }, now: NOW }).priceUsd).toBe(279);
    expect(computePrice({ tier: "proof", prices: {}, now: NOW }).priceUsd).toBe(299);
    expect(computePrice({ tier: "retest", prices: {}, now: NOW }).priceUsd).toBe(59);
  });

  it.each(["pulse", "launch_pack", "specialist"] as TierName[])("refuses %s with tier_not_offered", (tier) => {
    expect(codeOf(() => computePrice({ tier, prices: BASE_PRICES }))).toBe("tier_not_offered");
  });

  it("refuses any legacy add-on with addons_not_offered", () => {
    for (const addons of [["extra5"], ["rush"], ["secondPage"], ["extra5", "rush"]]) {
      expect(codeOf(() => computePrice({ tier: "proof", addons, prices: BASE_PRICES }))).toBe("addons_not_offered");
    }
  });

  it("refuses a non-positive price", () => {
    expect(() => computePrice({ tier: "spark", prices: { spark: 0 } })).toThrow(/no valid price/);
    expect(() => computePrice({ tier: "spark", prices: { spark: Number.NaN } })).toThrow(PricingError);
  });
});

describe("computePrice — extra jurors ($7 each, 0–20)", () => {
  it.each<[TierName, number, number, number, number]>([
    // tier, extra, price, jurors, cap (tier cap / tier jurors × jurors)
    ["spark", 1, 18, 4, 9.33],
    ["spark", 20, 151, 23, 53.67],
    ["proof", 5, 334, 25, 100],
    ["proof", 20, 439, 40, 160],
    ["retest", 20, 199, 28, 112],
  ])("%s + %d extra → $%d, %d jurors, cap $%d", (tier, extra, price, jurors, cap) => {
    const r = computePrice({ tier, extraJurors: extra, prices: BASE_PRICES, now: NOW });
    expect(r).toMatchObject({ priceUsd: price, extraJurors: extra, extraJurorsUsd: extra * 7, jurors, jurorCostCap: cap });
    expect(proRataCap(tier, jurors)).toBe(cap);
  });

  it.each([-1, 21, 1.5, Number.NaN, 100])("refuses extra_jurors = %s (extra_jurors_out_of_range)", (n) => {
    expect(codeOf(() => computePrice({ tier: "proof", extraJurors: n, prices: BASE_PRICES }))).toBe("extra_jurors_out_of_range");
  });

  it("0 and 20 are the inclusive bounds", () => {
    expect(computePrice({ tier: "proof", extraJurors: 0, prices: BASE_PRICES }).jurors).toBe(20);
    expect(computePrice({ tier: "proof", extraJurors: 20, prices: BASE_PRICES }).jurors).toBe(40);
  });
});

describe("coupon HALF", () => {
  it("defaults, env end date, and ends at the end of Nov 30 ET", () => {
    expect(configuredCoupon({})).toEqual({ code: "HALF", tier: "proof", percentOff: 50, endsAt: "2026-12-01T05:00:00.000Z", firstOrderOnly: true });
    expect(configuredCoupon({ COUPON_HALF_ENDS_AT: "2026-12-15T05:00:00Z" }).endsAt).toBe("2026-12-15T05:00:00.000Z");
    expect(configuredCoupon({ COUPON_HALF_ENDS_AT: "never" })).toEqual(HALF_DEFAULT); // a typo can't break checkout
    expect(couponEndsLabel(HALF.endsAt)).toBe("Nov 30");
  });

  it("happy path: Verdict $299 → $149 (whole dollars, rounded down)", () => {
    expect(couponPrice(299, 50)).toBe(149);
    expect(checkCoupon({ code: "half", tier: "proof", now: NOW, priorPaidOrders: 0, coupon: HALF }).ok).toBe(true);
    expect(computePrice({ tier: "proof", coupon: HALF, prices: BASE_PRICES, now: NOW })).toMatchObject({
      priceUsd: 149, listUsd: 299, discountUsd: 150, couponCode: "HALF", creditUsd: 0,
    });
  });

  it("refusals: coupon_unknown / coupon_expired / coupon_not_applicable / coupon_already_used", () => {
    const code = (c: ReturnType<typeof checkCoupon>) => (c.ok ? "ok" : c.code);
    expect(code(checkCoupon({ code: "TODAY50", tier: "proof", now: NOW, coupon: HALF }))).toBe("coupon_unknown");
    expect(code(checkCoupon({ code: "HALF", tier: "proof", now: new Date("2026-12-01T05:00:00Z"), coupon: HALF }))).toBe("coupon_expired");
    expect(code(checkCoupon({ code: "HALF", tier: "proof", now: new Date("2026-12-01T04:59:59Z"), coupon: HALF }))).toBe("ok");
    expect(code(checkCoupon({ code: "HALF", tier: "spark", now: NOW, coupon: HALF }))).toBe("coupon_not_applicable");
    expect(code(checkCoupon({ code: "HALF", tier: "retest", now: NOW, coupon: HALF }))).toBe("coupon_not_applicable");
    expect(code(checkCoupon({ code: "HALF", tier: "proof", now: NOW, priorPaidOrders: 1, coupon: HALF }))).toBe("coupon_already_used");
  });

  it("combines with the Quick Read upgrade credit: $149 − $11 = $138", () => {
    const parentOrder = { tier: "spark" as TierName, price_usd: 11, paid_at: hoursAgo(2) };
    expect(computePrice({ tier: "proof", coupon: HALF, parentOrder, prices: BASE_PRICES, now: NOW })).toMatchObject({
      priceUsd: 138, discountUsd: 150, creditUsd: 11, couponCode: "HALF",
    });
  });

  it("never discounts extra jurors (with or without the credit)", () => {
    expect(computePrice({ tier: "proof", coupon: HALF, extraJurors: 10, prices: BASE_PRICES, now: NOW })).toMatchObject({
      priceUsd: 149 + 70, discountUsd: 150, extraJurorsUsd: 70, jurors: 30, jurorCostCap: 120,
    });
    const parentOrder = { tier: "spark" as TierName, price_usd: 11, paid_at: hoursAgo(2) };
    expect(computePrice({ tier: "proof", coupon: HALF, parentOrder, extraJurors: 20, prices: BASE_PRICES, now: NOW }).priceUsd).toBe(138 + 140);
  });

  it("a coupon for another tier is ignored by computePrice (checkout refuses it earlier)", () => {
    expect(computePrice({ tier: "spark", coupon: HALF, prices: BASE_PRICES, now: NOW }).priceUsd).toBe(11);
  });
});

describe("computePrice — upgrade credit (Quick Read → Verdict)", () => {
  const spark = (paidHoursAgo: number | null, price = 11) => ({
    tier: "spark" as TierName,
    price_usd: price,
    paid_at: paidHoursAgo === null ? null : hoursAgo(paidHoursAgo),
  });
  it.each<[string, Parameters<typeof computePrice>[0], number, number]>([
    ["paid 2h ago → $288", { tier: "proof", parentOrder: spark(2), prices: BASE_PRICES, now: NOW }, 288, 11],
    ["exactly 24h is still in window", { tier: "proof", parentOrder: spark(24), prices: BASE_PRICES, now: NOW }, 288, 11],
    ["24h + 1min is out of window", { tier: "proof", parentOrder: spark(24 + 1 / 60), prices: BASE_PRICES, now: NOW }, 299, 0],
    ["parent unpaid → no credit", { tier: "proof", parentOrder: spark(null), prices: BASE_PRICES, now: NOW }, 299, 0],
    ["paid_at in the future → no credit", { tier: "proof", parentOrder: spark(-1), prices: BASE_PRICES, now: NOW }, 299, 0],
    ["Quick Read → Quick Read: no credit", { tier: "spark", parentOrder: spark(1), prices: BASE_PRICES, now: NOW }, 11, 0],
    ["Verdict parent on a Verdict → no credit", { tier: "proof", parentOrder: { tier: "proof", price_usd: 299, paid_at: hoursAgo(1) }, prices: BASE_PRICES, now: NOW }, 299, 0],
    ["Retest never takes credit", { tier: "retest", parentOrder: { tier: "proof", price_usd: 299, paid_at: hoursAgo(1) }, prices: BASE_PRICES, now: NOW }, 59, 0],
    ["historical Pulse parent still counts", { tier: "proof", parentOrder: { tier: "pulse", price_usd: 49, paid_at: hoursAgo(1) }, prices: BASE_PRICES, now: NOW }, 250, 49],
    ["cents are preserved", { tier: "proof", parentOrder: spark(1, 8.25), prices: BASE_PRICES, now: NOW }, 290.75, 8.25],
  ])("%s", (_name, input, price, credit) => {
    const r = computePrice(input);
    expect(r.priceUsd).toBe(price);
    expect(r.creditUsd).toBe(credit);
  });

  it("MIN_CHECKOUT_USD bounds the credit; the margin check then refuses such a price", () => {
    expect(MIN_CHECKOUT_USD).toBe(1);
    expect(
      codeOf(() => computePrice({ tier: "proof", parentOrder: { tier: "pulse", price_usd: 49, paid_at: hoursAgo(1) }, prices: { proof: 40 }, now: NOW })),
    ).toBe("margin_too_low");
  });
});

describe("30% margin at worst-case juror cost (checkout time)", () => {
  const credit = { tier: "spark" as TierName, price_usd: 11, paid_at: hoursAgo(1) };

  it("every allowed combination passes, up to 20 extra jurors — incl. HALF + credit ($138 base)", () => {
    for (const tier of ["spark", "proof", "retest"] as const) {
      for (let extra = 0; extra <= MAX_EXTRA_JURORS; extra++) {
        const r = computePrice({ tier, extraJurors: extra, prices: BASE_PRICES, now: NOW });
        expect(margin(r.priceUsd, r.jurorCostCap)).toBeGreaterThanOrEqual(MARGIN_FLOOR);
        if (tier === "proof") {
          const c = computePrice({ tier, extraJurors: extra, coupon: HALF, parentOrder: credit, prices: BASE_PRICES, now: NOW });
          expect(margin(c.priceUsd, c.jurorCostCap)).toBeGreaterThanOrEqual(MARGIN_FLOOR);
        }
      }
    }
  });

  it("HALF + credit with max extra jurors: $138 + 20 × $7 = $278 at a $160 cap is ~39.6%", () => {
    const r = computePrice({ tier: "proof", extraJurors: 20, coupon: HALF, parentOrder: credit, prices: BASE_PRICES, now: NOW });
    expect(r).toMatchObject({ priceUsd: 278, jurors: 40, jurorCostCap: 160 });
    expect(margin(r.priceUsd, r.jurorCostCap)).toBeCloseTo(0.396, 3);
    expect(margin(138, 80)).toBeCloseTo(0.391, 3);
  });

  it("refuses impossible combinations (margin_too_low)", () => {
    // HALF on a Verdict the CEO priced at the bottom of its band ($224.25 → $112) can't carry an $80 cap.
    expect(codeOf(() => computePrice({ tier: "proof", coupon: HALF, prices: { proof: 224.25 }, now: NOW }))).toBe("margin_too_low");
    // A deeper coupon.
    expect(codeOf(() => computePrice({ tier: "proof", coupon: { ...HALF, percentOff: 75 }, prices: BASE_PRICES, now: NOW }))).toBe("margin_too_low");
    // A Retest priced below its floor; extra jurors ($7 vs $4 cost each) can lift it back over.
    expect(codeOf(() => computePrice({ tier: "retest", prices: { retest: 40 }, now: NOW }))).toBe("margin_too_low");
    expect(computePrice({ tier: "retest", extraJurors: 20, prices: { retest: 40 }, now: NOW }).priceUsd).toBe(180);
  });
});

describe("retestRefusal — eligibility", () => {
  const verdict = (over: Partial<RetestParent> = {}): RetestParent => ({
    tier: "proof",
    stage: "DELIVERED",
    mode: "sandbox",
    email: "founder@example.com",
    delivered_at: daysAgo(3),
    ...over,
  });
  const check = (parent: RetestParent | null, over: Partial<Parameters<typeof retestRefusal>[0]> = {}) =>
    retestRefusal({
      parentOrderId: "44444444-4444-4444-8444-444444444444",
      parent,
      email: "founder@example.com",
      mode: "sandbox",
      paidRetests: 0,
      now: NOW,
      ...over,
    })?.code ?? null;

  it("happy path: a delivered Verdict of the same email + mode within 30 days", () => {
    expect(check(verdict())).toBeNull();
    expect(check(verdict({ stage: "PARTIAL" }))).toBeNull();
    expect(check(verdict({ email: "Founder@Example.com" }))).toBeNull();
    expect(check(verdict({ delivered_at: daysAgo(RETEST_WINDOW_DAYS) }))).toBeNull(); // boundary is inclusive
  });

  it("retest_needs_parent without a parent id", () => {
    expect(check(null, { parentOrderId: null })).toBe("retest_needs_parent");
    expect(check(verdict(), { parentOrderId: undefined })).toBe("retest_needs_parent");
  });

  it.each<[string, RetestParent | null]>([
    ["missing parent", null],
    ["Quick Read parent", verdict({ tier: "spark" })],
    ["retest parent (no retest of a retest)", verdict({ tier: "retest" })],
    ["retired launch_pack parent", verdict({ tier: "launch_pack" })],
    ["not delivered yet", verdict({ stage: "PANEL_LIVE", delivered_at: null })],
    ["refunded", verdict({ stage: "REFUNDED" })],
    ["delivered stage without delivered_at", verdict({ delivered_at: null })],
    ["other email", verdict({ email: "someone@else.com" })],
    ["other mode", verdict({ mode: "live" })],
  ])("retest_parent_not_eligible: %s", (_name, parent) => {
    expect(check(parent)).toBe("retest_parent_not_eligible");
  });

  it("retest_window_expired after 30 days", () => {
    expect(check(verdict({ delivered_at: daysAgo(RETEST_WINDOW_DAYS + 1 / 24) }))).toBe("retest_window_expired");
    expect(check(verdict({ delivered_at: "not a date" }))).toBe("retest_window_expired");
  });

  it("retest_already_used when a paid retest names the parent", () => {
    expect(check(verdict(), { paidRetests: 1 })).toBe("retest_already_used");
  });
});

describe("guardrails for the v3 tiers", () => {
  it("Retest ($59) keeps ≥ 30% margin at its full juror cap, and launches at the cap", () => {
    expect(margin(59, 32)).toBeGreaterThanOrEqual(MARGIN_FLOOR);
    const spec = panelSpec({ tier: "retest", addons: [], price_usd: 59 });
    expect(spec).toEqual({ format: "proof", maxJurors: 8, minJurors: 6, costCap: 32, minutes: 8, deadlineHours: 8 });
    expect(checkLaunch({ price: 59, cpi: 4, spec })).toEqual({ n: 8, budget: 32 });
    expect(marginOk(59, 4, 8)).toBe(true);
  });

  it("Verdict: 20 jurors, min 14, cap $80; cost floors clear the couponed price", () => {
    expect(panelSpec({ tier: "proof", addons: [], price_usd: 299 })).toMatchObject({ format: "proof", maxJurors: 20, minJurors: 14, costCap: 80 });
    expect(grossMargin(299, 4, 20) / 299).toBeGreaterThanOrEqual(MARGIN_FLOOR);
    expect(priceFloor("proof")).toBe(119.32);
    expect(priceFloor("proof")).toBeLessThanOrEqual(138);
    expect(priceFloor("spark")).toBeLessThanOrEqual(11);
  });

  it("panelSpec includes paid extra jurors; the launch-time real-cost check covers them", () => {
    const spec = panelSpec({ tier: "proof", addons: [], price_usd: 278, extra_jurors: 20 });
    expect(spec).toMatchObject({ maxJurors: 40, minJurors: 14, costCap: 160 });
    expect(checkLaunch({ price: 278, cpi: 4, spec })).toEqual({ n: 40, budget: 160 });
    expect(() => checkLaunch({ price: 200, cpi: 4, spec })).toThrow(/Margin/);
    expect(panelSpec({ tier: "proof", addons: [], price_usd: 299, extra_jurors: null }).maxJurors).toBe(20);
  });
});

describe("checkoutTitle", () => {
  it("names the tier by its customer-facing label and stays within Whop's 30-character limit", () => {
    expect(checkoutTitle("proof")).toBe("JuryHour Verdict");
    expect(checkoutTitle("spark")).toBe("JuryHour Quick Read");
    expect(checkoutTitle("retest")).toBe("JuryHour Retest");
    expect(checkoutTitle("proof", { extraJurors: 5, couponCode: "HALF" })).toBe("JuryHour Verdict +5");
    expect(checkoutTitle("proof", { couponCode: "HALF", creditUsd: 11, orderRef: "JH-F9DA6201" })).toBe("Verdict · JH-F9DA6201");
    expect(checkoutTitle("spark", { extraJurors: 20, orderRef: "JH-F9DA6201" })).toBe("Quick Read +20 · JH-F9DA6201");
    for (const tier of ["spark", "proof", "retest"] as const) {
      for (const extraJurors of [0, 1, 20]) {
        expect(checkoutTitle(tier, { extraJurors, couponCode: "HALF", creditUsd: 11, orderRef: "JH-ABCDEF12" }).length).toBeLessThanOrEqual(WHOP_TITLE_MAX);
      }
    }
  });
});
