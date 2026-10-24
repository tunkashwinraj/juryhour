import { describe, expect, it } from "vitest";
import { formatPrice, jurorLabel, segmentPanelId, segmentTabId, tallyCounts, tallyGroups } from "@/components/ui/lib";

describe("tally math", () => {
  it("clamps counts", () => {
    expect(tallyCounts(15, 12)).toEqual({ total: 15, filled: 12 });
    expect(tallyCounts(15, 20)).toEqual({ total: 15, filled: 15 });
    expect(tallyCounts(15, -3)).toEqual({ total: 15, filled: 0 });
    expect(tallyCounts(-1, 2)).toEqual({ total: 0, filled: 0 });
    expect(tallyCounts(NaN, 2)).toEqual({ total: 0, filled: 0 });
    expect(tallyCounts(10.7, 3.9)).toEqual({ total: 10, filled: 3 });
  });
  it("groups in fives with winners first", () => {
    const g = tallyGroups(15, 12);
    expect(g.map((x) => x.length)).toEqual([5, 5, 5]);
    expect(g.flat().filter(Boolean)).toHaveLength(12);
    expect(g[2]).toEqual([true, true, false, false, false]);
    expect(tallyGroups(3, 2)).toEqual([[true, true, false]]);
    expect(tallyGroups(8, 0).map((x) => x.length)).toEqual([5, 3]);
    expect(tallyGroups(0, 0)).toEqual([]);
  });
});

describe("jurorLabel", () => {
  it("zero-pads numbers to two digits", () => {
    expect(jurorLabel(6)).toBe("Juror 06");
    expect(jurorLabel(12)).toBe("Juror 12");
    expect(jurorLabel(104)).toBe("Juror 104");
    expect(jurorLabel(0)).toBe("Juror 00");
  });
  it("handles strings", () => {
    expect(jurorLabel("6")).toBe("Juror 06");
    expect(jurorLabel("Juror 03")).toBe("Juror 03");
    expect(jurorLabel("A")).toBe("Juror A");
  });
});

describe("formatPrice", () => {
  it("formats whole and fractional dollars", () => {
    expect(formatPrice(149)).toBe("$149");
    expect(formatPrice(1499)).toBe("$1,499");
    expect(formatPrice(9.5)).toBe("$9.50");
  });
});

describe("segment ids", () => {
  it("pairs tab and panel ids", () => {
    expect(segmentTabId("pv", "url")).toBe("pv-tab-url");
    expect(segmentPanelId("pv", "url")).toBe("pv-panel-url");
  });
});
