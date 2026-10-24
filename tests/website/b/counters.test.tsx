import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Resolver } from "./fake-db";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {}, revalidateTag: () => {} }));

let resolver: Resolver = () => ({ data: [], count: 0 });
let dbThrows = false;
const calls: { table: string; cols: string }[] = [];
vi.mock("@/lib/db", () => ({
  db: () => {
    if (dbThrows) throw new Error("db down");
    return fakeDb((q) => {
      calls.push({ table: q.table, cols: q.cols });
      return resolver(q);
    });
  },
}));

import { ZERO_COUNTERS, averageMinutes, getLiveCounters } from "@/lib/marketing-data";
import { LiveCounters, visibleCounters } from "@/components/marketing/LiveCounters";

beforeEach(() => {
  resolver = () => ({ data: [], count: 0 });
  dbThrows = false;
  calls.length = 0;
});

describe("visibleCounters", () => {
  it("hides everything at zero", () => {
    expect(visibleCounters(ZERO_COUNTERS)).toEqual([]);
    expect(visibleCounters({ verdictsDelivered: 0, peopleHeard: 0, avgDeliveryMinutes: 200 })).toEqual([]);
  });

  it("shows only counters that are at least 1", () => {
    const v = visibleCounters({ verdictsDelivered: 0, peopleHeard: 7, avgDeliveryMinutes: null });
    expect(v.map((c) => c.key)).toEqual(["peopleHeard"]);
    const all = visibleCounters({ verdictsDelivered: 2, peopleHeard: 30, avgDeliveryMinutes: 220 });
    expect(all.map((c) => [c.key, c.value])).toEqual([
      ["verdictsDelivered", "2"],
      ["peopleHeard", "30"],
      ["avgDeliveryMinutes", "3h 40m"],
    ]);
  });
});

describe("averageMinutes", () => {
  it("averages delivered_at − paid_at and ignores incomplete rows", () => {
    expect(averageMinutes([])).toBeNull();
    expect(
      averageMinutes([
        { paid_at: "2026-10-24T10:00:00Z", delivered_at: "2026-10-24T12:00:00Z" },
        { paid_at: "2026-10-24T10:00:00Z", delivered_at: "2026-10-24T11:00:00Z" },
        { paid_at: null, delivered_at: "2026-10-24T11:00:00Z" },
      ]),
    ).toBe(90);
  });
});

describe("getLiveCounters", () => {
  it("reads live-mode counts", async () => {
    resolver = (q) => {
      if (q.table === "responses") return { count: 42 };
      if (q.opts?.head) return { count: 3 };
      return { data: [{ paid_at: "2026-10-24T10:00:00Z", delivered_at: "2026-10-24T13:30:00Z" }] };
    };
    expect(await getLiveCounters()).toEqual({ verdictsDelivered: 3, peopleHeard: 42, avgDeliveryMinutes: 210 });
    expect(calls.find((c) => c.table === "responses")?.cols).toContain("panels!inner(mode)");
  });

  it("returns zeros on any DB error", async () => {
    resolver = () => ({ error: { message: "boom" } });
    expect(await getLiveCounters()).toEqual(ZERO_COUNTERS);
    dbThrows = true;
    expect(await getLiveCounters()).toEqual(ZERO_COUNTERS);
  });

  it("LiveCounters renders nothing while every counter is 0", async () => {
    expect(await LiveCounters()).toBeNull();
  });

  it("LiveCounters renders the counters that are ≥ 1", async () => {
    resolver = (q) => (q.table === "responses" ? { count: 12 } : q.opts?.head ? { count: 0 } : { data: [] });
    const el = await LiveCounters();
    const { renderToString } = await import("react-dom/server");
    const out = renderToString(el!);
    expect(out).toContain("12");
    expect(out).toContain("real people heard");
    expect(out).not.toContain("verdicts delivered");
  });
});
