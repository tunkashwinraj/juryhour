import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Resolver } from "./fake-db";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {}, revalidateTag: () => {} }));

let resolver: Resolver = () => ({ data: [] });
let dbThrows = false;
vi.mock("@/lib/db", () => ({
  db: () => {
    if (dbThrows) throw new Error("db down");
    return fakeDb((q) => resolver(q));
  },
  must: <T,>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  },
}));

import { resetEnvCache } from "@/lib/env";
import { getPricingSnapshot } from "@/lib/marketing-data";
import {
  SOLD_ADDONS,
  TIER_ORDER,
  UPGRADE_CREDIT_LINE,
  buildTierViews,
  featureRows,
  formatEtTime,
  offerEndsLabel,
} from "@/components/pricing/pricing-data";
import { PRICING_FAQ } from "@/components/pricing/pricing-faq";
import { HOME_FAQ, compareRows } from "@/components/marketing/home-content";
import { TIERS, type TierName } from "@/lib/constants";
import type { LaunchOffer } from "@/lib/launch";

const CONSTANT_PRICES = Object.fromEntries(TIER_ORDER.map((t) => [t, TIERS[t].price])) as Record<
  TierName,
  number | null
>;
const OFFER: LaunchOffer = { tier: "proof", priceUsd: 99, normalUsd: 149, endsAt: "2026-10-24T22:00:00.000Z", code: "TODAY99" };

function setOfferEnv(endsAt: string | undefined) {
  if (endsAt === undefined) delete process.env.LAUNCH_OFFER_ENDS_AT;
  else process.env.LAUNCH_OFFER_ENDS_AT = endsAt;
  resetEnvCache();
}

beforeEach(() => {
  resolver = () => ({ data: [] });
  dbThrows = false;
});
afterEach(() => {
  setOfferEnv(undefined);
  vi.useRealTimers();
});

describe("buildTierViews", () => {
  it("lists the five tiers in order with Proof recommended and Specialist from $499", () => {
    const v = buildTierViews(CONSTANT_PRICES, null);
    expect(v.map((t) => t.name)).toEqual(["Spark", "Pulse", "Proof", "Launch Pack", "Specialist Jury"]);
    expect(v.map((t) => t.price)).toEqual([11, 49, 149, 199, 499]);
    expect(v.filter((t) => t.recommended).map((t) => t.tier)).toEqual(["proof"]);
    expect(v[4]).toMatchObject({ fromPrice: true, jurors: null });
    expect(v.every((t) => t.compareAt === null && t.offer === null)).toBe(true);
  });

  it("shows the launch price with the normal price while the offer is on", () => {
    const proof = buildTierViews(CONSTANT_PRICES, OFFER).find((t) => t.tier === "proof")!;
    expect(proof).toMatchObject({ price: 99, compareAt: 149, normalPrice: 149 });
    expect(proof.offer).toEqual({ endsAt: OFFER.endsAt, priceUsd: 99, normalUsd: 149 });
  });

  it("uses DB prices when present, and ignores an offer that isn't a discount", () => {
    const v = buildTierViews({ ...CONSTANT_PRICES, proof: 129 }, OFFER);
    expect(v.find((t) => t.tier === "proof")).toMatchObject({ price: 99, compareAt: 129 });
    const noDiscount = buildTierViews({ ...CONSTANT_PRICES, proof: 89 }, OFFER).find((t) => t.tier === "proof")!;
    expect(noDiscount).toMatchObject({ price: 89, compareAt: null, offer: null });
  });

  it("feature table has one cell per tier in every row", () => {
    for (const row of featureRows(buildTierViews(CONSTANT_PRICES, null))) {
      expect(row.cells).toHaveLength(TIER_ORDER.length);
    }
  });
});

describe("getPricingSnapshot", () => {
  it("falls back to constants when the prices read fails", async () => {
    resolver = () => ({ error: { message: "boom" } });
    const snap = await getPricingSnapshot();
    expect(snap.prices).toEqual(CONSTANT_PRICES);
    dbThrows = true;
    expect((await getPricingSnapshot()).prices).toEqual(CONSTANT_PRICES);
  });

  it("takes prices from the prices table", async () => {
    resolver = (q) => (q.table === "prices" ? { data: [{ tier: "pulse", current_usd: "55" }] } : { data: [] });
    expect((await getPricingSnapshot()).prices.pulse).toBe(55);
  });

  it("offer on: Proof $99 normally $149", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-24T18:00:00Z"), toFake: ["Date"] });
    setOfferEnv("2026-10-24T22:00:00Z");
    const { offer } = await getPricingSnapshot();
    expect(offer).toMatchObject({ tier: "proof", priceUsd: 99, normalUsd: 149, endsAt: "2026-10-24T22:00:00.000Z" });
  });

  it("offer expired or unset: no offer", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-24T22:00:01Z"), toFake: ["Date"] });
    setOfferEnv("2026-10-24T22:00:00Z");
    expect((await getPricingSnapshot()).offer).toBeNull();
    setOfferEnv(undefined);
    expect((await getPricingSnapshot()).offer).toBeNull();
  });
});

describe("offer wording", () => {
  it("formats the real end time in Eastern time", () => {
    expect(formatEtTime("2026-10-24T22:00:00Z")).toBe("6:00pm ET");
    expect(offerEndsLabel("2026-10-24T22:00:00Z", new Date("2026-10-24T15:00:00Z"))).toBe("until 6:00pm ET today");
    expect(offerEndsLabel("2026-10-25T22:00:00Z", new Date("2026-10-24T15:00:00Z"))).toBe("until 6:00pm ET on Oct 25");
  });
});

describe("no second-page add-on and no code discounts", () => {
  it("sells only +5 jurors ($15) and Rush ($9)", () => {
    expect(SOLD_ADDONS.map((a) => [a.key, a.price])).toEqual([
      ["extra5", 15],
      ["rush", 9],
    ]);
    expect(UPGRADE_CREDIT_LINE).toBe("Your Spark counts toward Proof if you upgrade within 24 hours.");
  });

  it("never mentions a second page anywhere in pricing or home copy", () => {
    const text = JSON.stringify([
      SOLD_ADDONS,
      buildTierViews(CONSTANT_PRICES, OFFER),
      featureRows(buildTierViews(CONSTANT_PRICES, null)),
      PRICING_FAQ.map((f) => f.aText),
      HOME_FAQ.map((f) => f.aText),
      compareRows("$11–$199"),
    ]).toLowerCase();
    expect(text).not.toContain("second page");
    expect(text).not.toContain("most chosen");
  });
});

describe("PricingSection render", () => {
  async function html(el: Promise<React.ReactElement> | React.ReactElement) {
    const { renderToReadableStream } = await import("react-dom/server");
    const stream = await renderToReadableStream(await el);
    await stream.allReady;
    return new Response(stream).text();
  }

  it("server-renders all tiers with the launch price and no loading state", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-24T18:00:00Z"), toFake: ["Date"] });
    setOfferEnv("2026-10-24T22:00:00Z");
    const { PricingSection } = await import("@/components/pricing/PricingSection");
    const out = await html(PricingSection({}));
    for (const name of ["Spark", "Pulse", "Proof", "Launch Pack", "Specialist Jury", "Recommended"]) {
      expect(out).toContain(name);
    }
    expect(out).toContain("$99");
    expect(out).toMatch(/normally[\s\S]*\$149/);
    expect(out).toContain("until 6:00pm ET today");
    expect(out).toContain("Your Spark counts toward Proof if you upgrade within 24 hours.");
    expect(out.toLowerCase()).not.toContain("loading");
    expect(out.toLowerCase()).not.toContain("second page");
    expect(out).not.toContain("Most chosen");
  });

  it("shows normal prices without an offer", async () => {
    const { PricingSection } = await import("@/components/pricing/PricingSection");
    const out = await html(PricingSection({}));
    expect(out).not.toContain("$99");
    expect(out).not.toContain("normally");
    expect(out).toContain("$149");
  });
});
