import { describe, expect, it } from "vitest";
import { orderRef, orderRefOrNull } from "@/lib/order-ref";
import { etDateTime, etDay, etDeadline, etTime, sameEtDay } from "@/lib/et-time";

describe("orderRef", () => {
  it("JH- + first 8 hex chars of the uuid, uppercased", () => {
    expect(orderRef("f9da6201-1234-4abc-8def-0123456789ab")).toBe("JH-F9DA6201");
    expect(orderRef("  F9DA6201-1234-4ABC-8DEF-0123456789AB ")).toBe("JH-F9DA6201");
  });
  it("refuses non-uuids; orderRefOrNull returns null for them", () => {
    expect(() => orderRef("f9da6201")).toThrow();
    expect(orderRefOrNull("f9da6201")).toBeNull();
    expect(orderRefOrNull(null)).toBeNull();
    expect(orderRefOrNull(42)).toBeNull();
    expect(orderRefOrNull("33333333-3333-4333-8333-333333333333")).toBe("JH-33333333");
  });
});

describe("ET time formatting", () => {
  const now = new Date("2026-10-24T15:00:00Z"); // 11:00am EDT, Sat Oct 24
  it("clock time in ET with am/pm", () => {
    expect(etTime(new Date("2026-10-24T23:03:58.014Z"))).toBe("7:03pm ET");
    expect(etTime(new Date("2026-10-24T14:00:00Z"))).toBe("10:00am ET");
  });
  it("'today' only on the same ET calendar day (not the UTC day)", () => {
    expect(etDeadline("2026-10-24T23:03:58.014Z", now)).toBe("by 7:03pm ET today");
    // 2026-10-25T02:00Z is still Oct 24 in New York
    expect(etDeadline("2026-10-25T02:00:00Z", now)).toBe("by 10:00pm ET today");
    expect(etDeadline("2026-10-25T05:30:00Z", now)).toBe("by 1:30am ET, Sun Oct 25");
    expect(sameEtDay(new Date("2026-10-25T03:59:00Z"), now)).toBe(true);
    expect(sameEtDay(new Date("2026-10-25T04:00:00Z"), now)).toBe(false);
  });
  it("handles standard time after the DST switch", () => {
    expect(etDateTime("2026-11-10T17:00:00Z", now)).toBe("12:00pm ET, Tue Nov 10");
  });
  it("null for missing or invalid input", () => {
    expect(etDeadline(null, now)).toBeNull();
    expect(etDateTime("nope", now)).toBeNull();
    expect(etDay(undefined)).toBeNull();
    expect(etDay("2026-10-25T02:00:00Z")).toBe("Sat Oct 24");
  });
});
