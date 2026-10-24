import { describe, expect, it } from "vitest";
import { checkoutTitle, computePrice, MIN_CHECKOUT_USD, PricingError } from "@/lib/pricing";
import type { AddonName, TierName } from "@/lib/constants";

const BASE_PRICES = { spark: 11, pulse: 49, proof: 149, launch_pack: 199 };
const NOW = new Date("2026-10-24T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

describe("computePrice — tiers and add-ons", () => {
  const cases: [TierName, AddonName[], number, number, number][] = [
    // tier, addons, price, jurors, jurorCostCap
    ["spark", [], 11, 3, 7],
    ["pulse", [], 49, 10, 25],
    ["proof", [], 149, 15, 60],
    ["launch_pack", [], 199, 15, 60],
    ["proof", ["extra5"], 164, 20, 80],
    ["spark", ["extra5"], 26, 8, 18.67],
    ["pulse", ["extra5", "rush", "secondPage"], 82, 15, 37.5],
    ["proof", ["rush"], 158, 15, 60],
    ["proof", ["secondPage"], 158, 15, 60],
    ["launch_pack", ["extra5", "rush"], 223, 20, 80],
    ["proof", ["rush", "rush"], 158, 15, 60], // duplicates count once
  ];
  it.each(cases)("%s + %j → $%d, %d jurors, cap $%d", (tier, addons, price, jurors, cap) => {
    const r = computePrice({ tier, addons, prices: BASE_PRICES, now: NOW });
    expect(r).toEqual({ priceUsd: price, creditUsd: 0, jurors, jurorCostCap: cap });
  });

  it("uses the prices table (CEO-adjusted) over the constant", () => {
    expect(computePrice({ tier: "proof", addons: [], prices: { proof: 129.5 }, now: NOW }).priceUsd).toBe(129.5);
  });

  it("falls back to TIERS price when the row is missing", () => {
    expect(computePrice({ tier: "pulse", addons: ["rush"], prices: {}, now: NOW }).priceUsd).toBe(58);
  });

  it("refuses specialist (quoted, not fixed price)", () => {
    expect(() => computePrice({ tier: "specialist", addons: [], prices: BASE_PRICES })).toThrow(PricingError);
  });

  it("refuses a non-positive price", () => {
    expect(() => computePrice({ tier: "spark", addons: [], prices: { spark: 0 } })).toThrow(/no valid price/);
    expect(() => computePrice({ tier: "spark", addons: [], prices: { spark: Number.NaN } })).toThrow(PricingError);
  });
});

describe("computePrice — upgrade credit", () => {
  const spark = (paidHoursAgo: number | null, price = 11) => ({
    tier: "spark" as TierName,
    price_usd: price,
    paid_at: paidHoursAgo === null ? null : hoursAgo(paidHoursAgo),
  });

  const cases: [string, Parameters<typeof computePrice>[0], number, number][] = [
    ["spark paid 2h ago → proof", { tier: "proof", addons: [], parentOrder: spark(2), prices: BASE_PRICES, now: NOW }, 138, 11],
    ["spark paid 2h ago → pulse", { tier: "pulse", addons: [], parentOrder: spark(2), prices: BASE_PRICES, now: NOW }, 38, 11],
    ["spark → proof + extra5", { tier: "proof", addons: ["extra5"], parentOrder: spark(1), prices: BASE_PRICES, now: NOW }, 153, 11],
    ["exactly 24h is still in window", { tier: "proof", addons: [], parentOrder: spark(24), prices: BASE_PRICES, now: NOW }, 138, 11],
    ["24h + 1min is out of window", { tier: "proof", addons: [], parentOrder: spark(24 + 1 / 60), prices: BASE_PRICES, now: NOW }, 149, 0],
    ["parent unpaid → no credit", { tier: "proof", addons: [], parentOrder: spark(null), prices: BASE_PRICES, now: NOW }, 149, 0],
    ["paid_at in the future → no credit", { tier: "proof", addons: [], parentOrder: spark(-1), prices: BASE_PRICES, now: NOW }, 149, 0],
    ["no parent", { tier: "proof", addons: [], parentOrder: null, prices: BASE_PRICES, now: NOW }, 149, 0],
    [
      "downgrade/same tier → no credit",
      { tier: "pulse", addons: [], parentOrder: { tier: "proof", price_usd: 149, paid_at: hoursAgo(1) }, prices: BASE_PRICES, now: NOW },
      49,
      0,
    ],
    [
      "same tier (retest) → no credit",
      { tier: "proof", addons: [], parentOrder: { tier: "proof", price_usd: 149, paid_at: hoursAgo(1) }, prices: BASE_PRICES, now: NOW },
      149,
      0,
    ],
    [
      "credit floors the checkout at $1",
      { tier: "proof", addons: [], parentOrder: { tier: "pulse", price_usd: 49, paid_at: hoursAgo(1) }, prices: { proof: 40 }, now: NOW },
      MIN_CHECKOUT_USD,
      39,
    ],
    [
      "cents are preserved",
      { tier: "proof", addons: [], parentOrder: spark(1, 8.25), prices: { proof: 111.75 }, now: NOW },
      103.5,
      8.25,
    ],
  ];
  it.each(cases)("%s", (_name, input, price, credit) => {
    const r = computePrice(input);
    expect(r.priceUsd).toBe(price);
    expect(r.creditUsd).toBe(credit);
  });

  it("credit does not change jurors or cost cap", () => {
    const r = computePrice({ tier: "proof", addons: [], parentOrder: spark(1), prices: BASE_PRICES, now: NOW });
    expect(r.jurors).toBe(15);
    expect(r.jurorCostCap).toBe(60);
  });
});

describe("checkoutTitle", () => {
  it("names tier and add-ons", () => {
    expect(checkoutTitle("proof", ["extra5", "rush"])).toBe("JuryHour Proof + 5 extra jurors + rush");
    expect(checkoutTitle("launch_pack", [], 11)).toBe("JuryHour Launch Pack (upgrade credit applied)");
  });
});
