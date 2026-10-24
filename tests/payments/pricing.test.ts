import { describe, expect, it } from "vitest";
import {
  checkoutTitle,
  WHOP_TITLE_MAX,
  computePrice,
  discountNote,
  isBuyableTier,
  MIN_CHECKOUT_USD,
  panelCostCap,
  PricingError,
  retestRefusal,
  type RetestParent,
} from "@/lib/pricing";
import {
  BUYABLE_TIERS,
  EXTRA_JUROR_COST_CAP_USD,
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
import {
  LAUNCH20_DEFAULT,
  bestVerdictDiscount,
  checkCoupon,
  configuredCoupon,
  couponEndsLabel,
  couponPrice,
  type Coupon,
} from "@/lib/coupons";
import { checkLaunch, grossMargin, marginOk, panelSpec, priceFloor } from "@/lib/guardrails";

const BASE_PRICES = { spark: 49, proof: 299, retest: 129 };
const NOW = new Date("2026-10-24T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const LAUNCH20: Coupon = LAUNCH20_DEFAULT;
const codeOf = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return (e as PricingError).code;
  }
  return null;
};
/** Gross margin at the worst-case juror cost (the full cap) after Whop's fee (2.7% + $0.30). */
const margin = (price: number, cap: number) => (price - cap - WHOP_FEE(price)) / price;

describe("pricing constants (v4, real Terac juror cost)", () => {
  it("Quick Read $49 (3 jurors, cap $32), Verdict $299 (15 jurors, min 10, cap $158), Retest $129 (8, cap $84); retired tiers not sold", () => {
    expect(BUYABLE_TIERS).toEqual(["spark", "proof", "retest"]);
    expect(TIERS.spark).toMatchObject({ price: 49, jurors: 3, minJurors: 3, jurorCostCap: 32, format: "spark", deadlineHours: 4, sold: true });
    expect(TIERS.proof).toMatchObject({ price: 299, jurors: 15, minJurors: 10, minutes: 8, jurorCostCap: 158, format: "proof", deadlineHours: 8, sold: true });
    expect(TIERS.retest).toMatchObject({ price: 129, jurors: 8, minJurors: 6, jurorCostCap: 84, format: "proof", deadlineHours: 8, sold: true });
    expect([TIERS.pulse.sold, TIERS.launch_pack.sold, TIERS.specialist.sold]).toEqual([false, false, false]);
    expect(RETEST_WINDOW_DAYS).toBe(30);
    expect([EXTRA_JUROR_USD, EXTRA_JUROR_COST_CAP_USD, MAX_EXTRA_JURORS]).toEqual([16, 10.5, 20]);
    expect(VERDICT_BADGE).toBe("Recommended");
    expect([VERDICT_REGULAR_USD, VERDICT_REGULAR_FROM]).toEqual([499, "Dec 1"]);
  });

  it("each tier cap covers its full panel at Terac's ~$10.50 per juror", () => {
    for (const tier of ["spark", "proof", "retest"] as const) {
      expect(TIERS[tier].jurorCostCap).toBeGreaterThanOrEqual(TIERS[tier].jurors * 10.5);
    }
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
    ["spark", 49, 3, 32],
    ["proof", 299, 15, 158],
    ["retest", 129, 8, 84],
  ])("%s → $%d, %d jurors, cap $%d", (tier, price, jurors, cap) => {
    expect(computePrice({ tier, prices: BASE_PRICES, now: NOW })).toMatchObject({
      priceUsd: price, listUsd: price, creditUsd: 0, discountUsd: 0, couponCode: null, discountApplied: null, skippedDiscount: null,
      extraJurors: 0, jurors, jurorCostCap: cap,
    });
  });

  it("uses the prices table (CEO-adjusted) over the constant, and falls back when missing", () => {
    expect(computePrice({ tier: "proof", prices: { proof: 319 }, now: NOW }).priceUsd).toBe(319);
    expect(computePrice({ tier: "proof", prices: {}, now: NOW }).priceUsd).toBe(299);
    expect(computePrice({ tier: "retest", prices: {}, now: NOW }).priceUsd).toBe(129);
    expect(computePrice({ tier: "spark", prices: {}, now: NOW }).priceUsd).toBe(49);
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

describe("computePrice — extra jurors ($16 each, 0–20, +$10.50 each to the cap)", () => {
  it.each<[TierName, number, number, number, number]>([
    // tier, extra, price, jurors, cap (tier cap + 10.50 × extra)
    ["spark", 1, 65, 4, 42.5],
    ["spark", 20, 369, 23, 242],
    ["proof", 5, 379, 20, 210.5],
    ["proof", 20, 619, 35, 368],
    ["retest", 20, 449, 28, 294],
  ])("%s + %d extra → $%d, %d jurors, cap $%d", (tier, extra, price, jurors, cap) => {
    const r = computePrice({ tier, extraJurors: extra, prices: BASE_PRICES, now: NOW });
    expect(r).toMatchObject({ priceUsd: price, extraJurors: extra, extraJurorsUsd: extra * 16, jurors, jurorCostCap: cap });
    expect(panelCostCap(tier, extra)).toBe(cap);
  });

  it.each([-1, 21, 1.5, Number.NaN, 100])("refuses extra_jurors = %s (extra_jurors_out_of_range)", (n) => {
    expect(codeOf(() => computePrice({ tier: "proof", extraJurors: n, prices: BASE_PRICES }))).toBe("extra_jurors_out_of_range");
  });

  it("0 and 20 are the inclusive bounds", () => {
    expect(computePrice({ tier: "proof", extraJurors: 0, prices: BASE_PRICES }).jurors).toBe(15);
    expect(computePrice({ tier: "proof", extraJurors: 20, prices: BASE_PRICES }).jurors).toBe(35);
  });
});

describe("coupon LAUNCH20", () => {
  it("defaults, env end date (COUPON_LAUNCH20_ENDS_AT), and ends at the end of Nov 30 ET", () => {
    expect(configuredCoupon({})).toEqual({ code: "LAUNCH20", tier: "proof", percentOff: 20, endsAt: "2026-12-01T05:00:00.000Z", firstOrderOnly: true });
    expect(configuredCoupon({ COUPON_LAUNCH20_ENDS_AT: "2026-12-15T05:00:00Z" }).endsAt).toBe("2026-12-15T05:00:00.000Z");
    expect(configuredCoupon({ COUPON_LAUNCH20_ENDS_AT: "never" })).toEqual(LAUNCH20_DEFAULT); // a typo can't break checkout
    expect(configuredCoupon({ COUPON_HALF_ENDS_AT: "2026-12-15T05:00:00Z" })).toEqual(LAUNCH20_DEFAULT); // the old env name is ignored
    expect(couponEndsLabel(LAUNCH20.endsAt)).toBe("Nov 30");
  });

  it("happy path: Verdict $299 → $239 (20% off, whole dollars, rounded down)", () => {
    expect(couponPrice(299, 20)).toBe(239);
    expect(checkCoupon({ code: "launch20", tier: "proof", now: NOW, priorPaidOrders: 0, coupon: LAUNCH20 }).ok).toBe(true);
    expect(computePrice({ tier: "proof", coupon: LAUNCH20, prices: BASE_PRICES, now: NOW })).toMatchObject({
      priceUsd: 239, listUsd: 299, discountUsd: 60, couponCode: "LAUNCH20", creditUsd: 0, discountApplied: "coupon", skippedDiscount: null,
    });
  });

  it("refusals: coupon_unknown (incl. the retired HALF) / coupon_expired / coupon_not_applicable / coupon_already_used", () => {
    const code = (c: ReturnType<typeof checkCoupon>) => (c.ok ? "ok" : c.code);
    expect(code(checkCoupon({ code: "TODAY50", tier: "proof", now: NOW, coupon: LAUNCH20 }))).toBe("coupon_unknown");
    expect(code(checkCoupon({ code: "HALF", tier: "proof", now: NOW, coupon: LAUNCH20 }))).toBe("coupon_unknown");
    expect(code(checkCoupon({ code: "half", tier: "proof", now: NOW }))).toBe("coupon_unknown"); // default config too
    expect(code(checkCoupon({ code: "LAUNCH20", tier: "proof", now: new Date("2026-12-01T05:00:00Z"), coupon: LAUNCH20 }))).toBe("coupon_expired");
    expect(code(checkCoupon({ code: "LAUNCH20", tier: "proof", now: new Date("2026-12-01T04:59:59Z"), coupon: LAUNCH20 }))).toBe("ok");
    expect(code(checkCoupon({ code: "LAUNCH20", tier: "spark", now: NOW, coupon: LAUNCH20 }))).toBe("coupon_not_applicable");
    expect(code(checkCoupon({ code: "LAUNCH20", tier: "retest", now: NOW, coupon: LAUNCH20 }))).toBe("coupon_not_applicable");
    expect(code(checkCoupon({ code: "LAUNCH20", tier: "proof", now: NOW, priorPaidOrders: 1, coupon: LAUNCH20 }))).toBe("coupon_already_used");
  });

  it("never discounts extra jurors", () => {
    expect(computePrice({ tier: "proof", coupon: LAUNCH20, extraJurors: 10, prices: BASE_PRICES, now: NOW })).toMatchObject({
      priceUsd: 239 + 160, discountUsd: 60, extraJurorsUsd: 160, jurors: 25, jurorCostCap: 263,
    });
  });

  it("a coupon for another tier is ignored by computePrice (checkout refuses it earlier)", () => {
    expect(computePrice({ tier: "spark", coupon: LAUNCH20, prices: BASE_PRICES, now: NOW }).priceUsd).toBe(49);
    expect(computePrice({ tier: "retest", coupon: LAUNCH20, prices: BASE_PRICES, now: NOW }).priceUsd).toBe(129);
  });
});

describe("one discount per order: LAUNCH20 vs the Quick Read upgrade credit", () => {
  const qr = { tier: "spark" as TierName, price_usd: 49, paid_at: hoursAgo(2) };

  it("both could apply → only the larger saving: LAUNCH20 ($60 off) beats the $49 credit → $239, never $190", () => {
    const r = computePrice({ tier: "proof", coupon: LAUNCH20, parentOrder: qr, prices: BASE_PRICES, now: NOW });
    expect(r).toMatchObject({
      priceUsd: 239, discountUsd: 60, couponCode: "LAUNCH20", creditUsd: 0, discountApplied: "coupon",
      skippedDiscount: { kind: "credit", code: null, usd: 49 },
    });
    expect(discountNote(r)).toBe("LAUNCH20 applied ($60 off). It doesn't combine with your Quick Read credit ($49), so we used the bigger saving.");
  });

  it("when the credit is larger it wins and the coupon is not used", () => {
    const small = { ...LAUNCH20, percentOff: 10 }; // a smaller coupon: $30 off vs the $49 credit
    const r = computePrice({ tier: "proof", coupon: small, parentOrder: qr, prices: BASE_PRICES, now: NOW });
    expect(r).toMatchObject({
      priceUsd: 250, discountUsd: 0, couponCode: null, creditUsd: 49, discountApplied: "credit",
      skippedDiscount: { kind: "coupon", code: "LAUNCH20", usd: 30 },
    });
    expect(discountNote(r)).toBe("Your Quick Read credit applied ($49 off). It doesn't combine with LAUNCH20 ($30 off), so we used the bigger saving.");
  });

  it("bestVerdictDiscount: ties go to the coupon; nothing to choose → null", () => {
    expect(bestVerdictDiscount({ listUsd: 299, coupon: LAUNCH20, creditUsd: 60 })).toEqual({ kind: "coupon", couponUsd: 60, creditUsd: 0, baseUsd: 239 });
    expect(bestVerdictDiscount({ listUsd: 299, coupon: LAUNCH20, creditUsd: 49 })).toEqual({ kind: "coupon", couponUsd: 60, creditUsd: 0, baseUsd: 239 });
    expect(bestVerdictDiscount({ listUsd: 299, coupon: null, creditUsd: 49 })).toEqual({ kind: "credit", couponUsd: 0, creditUsd: 49, baseUsd: 250 });
    expect(bestVerdictDiscount({ listUsd: 299, coupon: null, creditUsd: 0 })).toEqual({ kind: null, couponUsd: 0, creditUsd: 0, baseUsd: 299 });
  });

  it("single-discount notes", () => {
    expect(discountNote(computePrice({ tier: "proof", coupon: LAUNCH20, prices: BASE_PRICES, now: NOW }))).toBe("LAUNCH20 applied ($60 off).");
    expect(discountNote(computePrice({ tier: "proof", parentOrder: qr, prices: BASE_PRICES, now: NOW }))).toBe("Your Quick Read credit applied ($49 off).");
    expect(discountNote(computePrice({ tier: "proof", prices: BASE_PRICES, now: NOW }))).toBeNull();
  });

  it("extra jurors are added on top of whichever discount won", () => {
    expect(computePrice({ tier: "proof", coupon: LAUNCH20, parentOrder: qr, extraJurors: 20, prices: BASE_PRICES, now: NOW }).priceUsd).toBe(239 + 320);
  });
});

describe("computePrice — upgrade credit (Quick Read → Verdict)", () => {
  const spark = (paidHoursAgo: number | null, price = 49) => ({
    tier: "spark" as TierName,
    price_usd: price,
    paid_at: paidHoursAgo === null ? null : hoursAgo(paidHoursAgo),
  });
  it.each<[string, Parameters<typeof computePrice>[0], number, number]>([
    ["paid 2h ago → $250", { tier: "proof", parentOrder: spark(2), prices: BASE_PRICES, now: NOW }, 250, 49],
    ["exactly 24h is still in window", { tier: "proof", parentOrder: spark(24), prices: BASE_PRICES, now: NOW }, 250, 49],
    ["24h + 1min is out of window", { tier: "proof", parentOrder: spark(24 + 1 / 60), prices: BASE_PRICES, now: NOW }, 299, 0],
    ["parent unpaid → no credit", { tier: "proof", parentOrder: spark(null), prices: BASE_PRICES, now: NOW }, 299, 0],
    ["paid_at in the future → no credit", { tier: "proof", parentOrder: spark(-1), prices: BASE_PRICES, now: NOW }, 299, 0],
    ["Quick Read → Quick Read: no credit", { tier: "spark", parentOrder: spark(1), prices: BASE_PRICES, now: NOW }, 49, 0],
    ["Verdict parent on a Verdict → no credit", { tier: "proof", parentOrder: { tier: "proof", price_usd: 299, paid_at: hoursAgo(1) }, prices: BASE_PRICES, now: NOW }, 299, 0],
    ["Retest never takes credit", { tier: "retest", parentOrder: { tier: "proof", price_usd: 299, paid_at: hoursAgo(1) }, prices: BASE_PRICES, now: NOW }, 129, 0],
    ["historical Pulse parent still counts", { tier: "proof", parentOrder: { tier: "pulse", price_usd: 49, paid_at: hoursAgo(1) }, prices: BASE_PRICES, now: NOW }, 250, 49],
    ["an older, cheaper Quick Read is credited at what was paid", { tier: "proof", parentOrder: spark(1, 25), prices: BASE_PRICES, now: NOW }, 274, 25],
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

describe("30% margin after Whop's fee (2.7% + $0.30) at the worst-case juror cost cap (checkout time)", () => {
  const qr = { tier: "spark" as TierName, price_usd: 49, paid_at: hoursAgo(1) };

  it.each<[string, number, number, number]>([
    // label, price, cap, expected margin
    ["Quick Read $49 at cap $32", 49, 32, 0.3138],
    ["Verdict $299 at cap $158", 299, 158, 0.4436],
    ["Verdict with LAUNCH20 $239 at cap $158", 239, 158, 0.3107],
    ["Verdict with the Quick Read credit $250 at cap $158", 250, 158, 0.3398],
    ["Retest $129 at cap $84", 129, 84, 0.3195],
    ["Verdict $239 + 20 extra ($320) at cap $158 + $210", 559, 368, 0.3141],
    ["Quick Read $49 + 20 extra ($320) at cap $32 + $210", 369, 242, 0.3164],
    ["Retest $129 + 20 extra ($320) at cap $84 + $210", 449, 294, 0.3175],
    ["Verdict with credit $250 + 20 extra at cap $368", 570, 368, 0.3269],
  ])("%s → margin ≈ %s", (_label, price, cap, expected) => {
    expect(margin(price, cap)).toBeCloseTo(expected, 4);
    expect(margin(price, cap)).toBeGreaterThanOrEqual(MARGIN_FLOOR);
  });

  it("computePrice produces those exact prices and caps", () => {
    const at = (i: Omit<Parameters<typeof computePrice>[0], "prices" | "now">) => {
      const r = computePrice({ ...i, prices: BASE_PRICES, now: NOW });
      return [r.priceUsd, r.jurorCostCap];
    };
    expect(at({ tier: "spark" })).toEqual([49, 32]);
    expect(at({ tier: "proof" })).toEqual([299, 158]);
    expect(at({ tier: "proof", coupon: LAUNCH20 })).toEqual([239, 158]);
    expect(at({ tier: "proof", parentOrder: qr })).toEqual([250, 158]);
    expect(at({ tier: "retest" })).toEqual([129, 84]);
    expect(at({ tier: "proof", coupon: LAUNCH20, extraJurors: 20 })).toEqual([559, 368]);
    expect(at({ tier: "spark", extraJurors: 20 })).toEqual([369, 242]);
  });

  it("every allowed combination passes, 0–20 extra jurors, with LAUNCH20, the credit, or both offered", () => {
    for (const tier of ["spark", "proof", "retest"] as const) {
      for (let extra = 0; extra <= MAX_EXTRA_JURORS; extra++) {
        const r = computePrice({ tier, extraJurors: extra, prices: BASE_PRICES, now: NOW });
        expect(margin(r.priceUsd, r.jurorCostCap)).toBeGreaterThanOrEqual(MARGIN_FLOOR);
        if (tier === "proof") {
          for (const discounts of [{ coupon: LAUNCH20 }, { parentOrder: qr }, { coupon: LAUNCH20, parentOrder: qr }]) {
            const c = computePrice({ tier, extraJurors: extra, ...discounts, prices: BASE_PRICES, now: NOW });
            expect(margin(c.priceUsd, c.jurorCostCap)).toBeGreaterThanOrEqual(MARGIN_FLOOR);
          }
        }
      }
    }
  });

  it("stacking LAUNCH20 and the credit would break the floor ($190 at a $158 cap ≈ 14%), which is why they never combine", () => {
    expect(margin(190, 158)).toBeLessThan(MARGIN_FLOOR);
  });

  it("refuses combinations below 30% (margin_too_low)", () => {
    // LAUNCH20 on a Verdict moved to $294 → $235 can't carry the $158 cap ($295 → $236 can).
    expect(codeOf(() => computePrice({ tier: "proof", coupon: LAUNCH20, prices: { proof: 294 }, now: NOW }))).toBe("margin_too_low");
    expect(computePrice({ tier: "proof", coupon: LAUNCH20, prices: { proof: 295 }, now: NOW }).priceUsd).toBe(236);
    // A deeper coupon.
    expect(codeOf(() => computePrice({ tier: "proof", coupon: { ...LAUNCH20, percentOff: 50 }, prices: BASE_PRICES, now: NOW }))).toBe("margin_too_low");
    // Quick Read and Retest below their floors.
    expect(codeOf(() => computePrice({ tier: "spark", prices: { spark: 45 }, now: NOW }))).toBe("margin_too_low");
    expect(codeOf(() => computePrice({ tier: "retest", prices: { retest: 120 }, now: NOW }))).toBe("margin_too_low");
    // Extra jurors ($16 vs $10.50 cost each) can lift a thin price back over the floor.
    expect(computePrice({ tier: "retest", extraJurors: 20, prices: { retest: 120 }, now: NOW }).priceUsd).toBe(440);
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

describe("guardrails for the v4 tiers (launch time)", () => {
  it("Retest ($129) keeps ≥ 30% margin at its full juror cap, and launches 8 jurors at $10.50", () => {
    expect(margin(129, 84)).toBeGreaterThanOrEqual(MARGIN_FLOOR);
    const spec = panelSpec({ tier: "retest", addons: [], price_usd: 129 });
    expect(spec).toEqual({ format: "proof", maxJurors: 8, minJurors: 6, costCap: 84, minutes: 8, deadlineHours: 8 });
    expect(checkLaunch({ price: 129, cpi: 10.5, spec })).toEqual({ n: 8, budget: 84 });
    expect(marginOk(129, 10.5, 8)).toBe(true);
  });

  it("Quick Read ($49) launches 3 jurors at $10.50", () => {
    const spec = panelSpec({ tier: "spark", addons: [], price_usd: 49 });
    expect(spec).toMatchObject({ maxJurors: 3, minJurors: 3, costCap: 32 });
    expect(checkLaunch({ price: 49, cpi: 10.5, spec })).toEqual({ n: 3, budget: 31.5 });
  });

  it("Verdict: 15 jurors, min 10, cap $158; launches 15 at $10.50, even at the LAUNCH20 price; cost floors clear the discounted prices", () => {
    const spec = panelSpec({ tier: "proof", addons: [], price_usd: 299 });
    expect(spec).toMatchObject({ format: "proof", maxJurors: 15, minJurors: 10, costCap: 158 });
    expect(checkLaunch({ price: 299, cpi: 10.5, spec })).toEqual({ n: 15, budget: 157.5 });
    expect(checkLaunch({ price: 239, cpi: 10.5, spec: panelSpec({ tier: "proof", addons: [], price_usd: 239 }) })).toEqual({ n: 15, budget: 157.5 });
    expect(grossMargin(239, 10.5, 15) / 239).toBeGreaterThanOrEqual(MARGIN_FLOOR);
    expect(priceFloor("proof")).toBe(235.22);
    expect(priceFloor("proof")).toBeLessThanOrEqual(239);
    expect(priceFloor("spark")).toBe(48);
    expect(priceFloor("spark")).toBeLessThanOrEqual(49);
    expect(priceFloor("retest")).toBe(125.27);
    expect(priceFloor("retest")).toBeLessThanOrEqual(129);
  });

  it("panelSpec includes paid extra jurors (+$10.50 each to the cap); the launch-time real-cost check covers them", () => {
    const spec = panelSpec({ tier: "proof", addons: [], price_usd: 559, extra_jurors: 20 });
    expect(spec).toMatchObject({ maxJurors: 35, minJurors: 10, costCap: 368 });
    expect(checkLaunch({ price: 559, cpi: 10.5, spec })).toEqual({ n: 35, budget: 367.5 });
    expect(() => checkLaunch({ price: 450, cpi: 10.5, spec })).toThrow(/Margin/);
    expect(panelSpec({ tier: "proof", addons: [], price_usd: 299, extra_jurors: null }).maxJurors).toBe(15);
    expect(panelSpec({ tier: "spark", addons: [], price_usd: 369, extra_jurors: 20 })).toMatchObject({ maxJurors: 23, costCap: 242 });
  });
});

describe("checkoutTitle", () => {
  it("names the tier by its customer-facing label and stays within Whop's 30-character limit", () => {
    expect(checkoutTitle("proof")).toBe("JuryHour Verdict");
    expect(checkoutTitle("spark")).toBe("JuryHour Quick Read");
    expect(checkoutTitle("retest")).toBe("JuryHour Retest");
    expect(checkoutTitle("proof", { extraJurors: 5, couponCode: "LAUNCH20" })).toBe("JuryHour Verdict +5");
    expect(checkoutTitle("proof", { couponCode: "LAUNCH20", orderRef: "JH-F9DA6201" })).toBe("Verdict · JH-F9DA6201");
    expect(checkoutTitle("spark", { extraJurors: 20, orderRef: "JH-F9DA6201" })).toBe("Quick Read +20 · JH-F9DA6201");
    for (const tier of ["spark", "proof", "retest"] as const) {
      for (const extraJurors of [0, 1, 20]) {
        expect(checkoutTitle(tier, { extraJurors, couponCode: "LAUNCH20", creditUsd: 49, orderRef: "JH-ABCDEF12" }).length).toBeLessThanOrEqual(WHOP_TITLE_MAX);
      }
    }
  });
});
