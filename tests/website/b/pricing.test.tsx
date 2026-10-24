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

import { getPricingSnapshot } from "@/lib/marketing-data";
import {
  EXTRA_JURORS_LINE,
  TIER_ORDER,
  UPGRADE_CREDIT_LINE,
  VERDICT_LAUNCH_NOTE,
  buildTierViews,
  couponAdLine,
  couponEndsLabel,
  featureRows,
  verdictCouponPrice,
} from "@/components/pricing/pricing-data";
import { PRICING_FAQ } from "@/components/pricing/pricing-faq";
import { HOME_FAQ, compareRows } from "@/components/marketing/home-content";
import { PreviewProvider } from "@/components/preview/PreviewProvider";
import { TIERS, type TierName } from "@/lib/constants";
import { HALF_DEFAULT } from "@/lib/coupons";

const CONSTANT_PRICES = Object.fromEntries((["spark", "proof", "retest"] as TierName[]).map((t) => [t, TIERS[t].price])) as Record<
  TierName,
  number | null
>;
const OLD_NAMES = /Spark|Pulse|Proof|Launch Pack|Specialist/;

beforeEach(() => {
  resolver = () => ({ data: [] });
  dbThrows = false;
});
afterEach(() => {
  delete process.env.COUPON_HALF_ENDS_AT;
  vi.useRealTimers();
});

describe("buildTierViews", () => {
  it("lists exactly two public plans with Verdict recommended", () => {
    const v = buildTierViews(CONSTANT_PRICES);
    expect(TIER_ORDER).toEqual(["spark", "proof"]);
    expect(v.map((t) => t.name)).toEqual(["Quick Read", "Verdict"]);
    expect(v.map((t) => t.price)).toEqual([11, 299]);
    expect(v.map((t) => t.jurors)).toEqual([3, 20]);
    expect(v.filter((t) => t.recommended).map((t) => t.tier)).toEqual(["proof"]);
  });

  it("uses DB prices when present", () => {
    expect(buildTierViews({ ...CONSTANT_PRICES, proof: 279 }).find((t) => t.tier === "proof")?.price).toBe(279);
  });

  it("feature table: one cell per plan, launch-offer note, extra jurors, no Retest", () => {
    const rows = featureRows(buildTierViews(CONSTANT_PRICES));
    for (const row of rows) expect(row.cells).toHaveLength(TIER_ORDER.length);
    expect(rows[0].cells).toEqual(["$11", "$299 launch offer · regular $499 from Dec 1"]);
    expect(rows.map((r) => r.label).join(" ")).not.toMatch(/retest/i);
    expect(rows.find((r) => r.label.startsWith("Extra jurors"))?.cells).toEqual(["$7 each", "$7 each"]);
  });
});

describe("Verdict launch copy and HALF display", () => {
  it("states the launch offer without a strike-through or 'was' price", () => {
    expect(VERDICT_LAUNCH_NOTE).toBe("launch offer · regular $499 from Dec 1");
  });
  it("HALF: $149 through Nov 30", () => {
    expect(verdictCouponPrice(CONSTANT_PRICES, HALF_DEFAULT)).toBe(149);
    expect(couponEndsLabel(HALF_DEFAULT.endsAt)).toBe("Nov 30");
    expect(couponAdLine(CONSTANT_PRICES, HALF_DEFAULT)).toBe("First Verdict? Code HALF makes it $149 through Nov 30.");
  });
});

describe("getPricingSnapshot", () => {
  it("falls back to constants when the prices read fails", async () => {
    resolver = () => ({ error: { message: "boom" } });
    expect((await getPricingSnapshot()).prices).toEqual(CONSTANT_PRICES);
    dbThrows = true;
    expect((await getPricingSnapshot()).prices).toEqual(CONSTANT_PRICES);
  });

  it("takes prices from the prices table", async () => {
    resolver = (q) => (q.table === "prices" ? { data: [{ tier: "proof", current_usd: "279" }] } : { data: [] });
    expect((await getPricingSnapshot()).prices.proof).toBe(279);
  });

  it("carries HALF until 2026-12-01T05:00Z (end of Nov 30 ET), then none", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-30T23:00:00Z"), toFake: ["Date"] });
    expect((await getPricingSnapshot()).coupon).toMatchObject({ code: "HALF", tier: "proof", percentOff: 50, firstOrderOnly: true });
    vi.setSystemTime(new Date("2026-12-01T05:00:00Z"));
    expect((await getPricingSnapshot()).coupon).toBeNull();
  });
});

describe("copy rules", () => {
  it("lines under the plans", () => {
    expect(UPGRADE_CREDIT_LINE).toBe("Your $11 counts toward a Verdict for 24 hours.");
    expect(EXTRA_JURORS_LINE).toBe("Add up to 20 extra jurors to a Quick Read or Verdict at $7 each.");
  });

  it("never shows retired names, packs, a second page, popularity claims or Retest", () => {
    const text = JSON.stringify([
      buildTierViews(CONSTANT_PRICES),
      featureRows(buildTierViews(CONSTANT_PRICES)),
      PRICING_FAQ.map((f) => [f.q, f.aText]),
      HOME_FAQ.map((f) => [f.q, f.aText]),
      compareRows("$11 or $299 per test"),
    ]);
    expect(text).not.toMatch(OLD_NAMES);
    expect(text).not.toMatch(/\$990|packs|TODAY50|second page|most chosen|most popular/i);
    expect(text).not.toMatch(/retest/i);
    expect(text).not.toMatch(/was \$499|normally/i);
  });
});

describe("PricingSection render", () => {
  async function html(el: React.ReactElement) {
    const { renderToReadableStream } = await import("react-dom/server");
    const stream = await renderToReadableStream(el);
    await stream.allReady;
    return (await new Response(stream).text()).replace(/<!-- -->/g, "");
  }
  const render = async (coupon: typeof HALF_DEFAULT | null) => {
    const { PricingSection } = await import("@/components/pricing/PricingSection");
    const section = await PricingSection({});
    return html(<PreviewProvider coupon={coupon}>{section}</PreviewProvider>);
  };

  it("server-renders the two plans, the launch note, HALF with its end date and extras, with no loading state", async () => {
    const out = await render(HALF_DEFAULT);
    for (const s of ["Quick Read", "Verdict", "Recommended", "$11", "$299", "$499 from Dec 1", "HALF", "$149", "through Nov 30", "$7 each", "Have a code?"]) {
      expect(out).toContain(s);
    }
    expect(out).toContain("Your $11 counts toward a Verdict for 24 hours.");
    expect(out).not.toMatch(OLD_NAMES);
    expect(out).not.toMatch(/retest|\$990|TODAY50|normally|<s>|Most popular/i);
    expect(out.toLowerCase()).not.toContain("loading");
  });

  it("without a running coupon: launch price only", async () => {
    const out = await render(null);
    expect(out).toContain("$299");
    expect(out).not.toContain("HALF");
    expect(out).not.toContain("$149");
  });
});
