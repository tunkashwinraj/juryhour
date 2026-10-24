import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => (await import("./helpers/fakeDb")).dbModule);

import { ALLOWED_TRANSITIONS, InvalidTransitionError, StageConflictError, canTransition, transition } from "@/lib/orders/transition";
import { Stage } from "@/lib/types";
import { fake } from "./helpers/fakeDb";
import { events, row, seedBase, seedOrder } from "./helpers/seed";

const STAGES = Stage.options;

// The state machine from SPEC §7 (+ any in-flight → FAILED, FAILED → REFUNDED, delivered → REFUNDED on a full support refund).
const EXPECTED: Record<string, string[]> = {
  CREATED: ["PAID"],
  PAID: ["RESEARCHING", "FAILED"],
  RESEARCHING: ["QUOTING", "FAILED"],
  QUOTING: ["PANEL_LIVE", "REFUNDED", "FAILED"],
  PANEL_LIVE: ["GRADING", "REFUNDED", "FAILED"],
  GRADING: ["SYNTHESIZING", "FAILED"],
  SYNTHESIZING: ["DELIVERED", "PARTIAL", "FAILED"],
  FAILED: ["REFUNDED"],
  DELIVERED: ["REFUNDED"],
  PARTIAL: ["REFUNDED"],
  REFUNDED: [],
  BLOCKED: [],
};

beforeEach(() => {
  vi.useRealTimers();
  seedBase();
});

describe("transition table", () => {
  it("matches the SPEC §7 state machine exactly", () => {
    for (const s of STAGES) expect([...ALLOWED_TRANSITIONS[s]].sort()).toEqual([...EXPECTED[s]].sort());
  });

  it("every in-flight stage can fail; terminal stages cannot move except to REFUNDED", () => {
    for (const s of ["PAID", "RESEARCHING", "QUOTING", "PANEL_LIVE", "GRADING", "SYNTHESIZING"] as const) expect(canTransition(s, "FAILED")).toBe(true);
    expect(canTransition("REFUNDED", "FAILED")).toBe(false);
    expect(canTransition("BLOCKED", "PAID")).toBe(false);
  });
});

describe("transition() — exhaustive over every (from, to) pair", () => {
  for (const from of STAGES) {
    for (const to of STAGES) {
      const allowed = EXPECTED[from].includes(to);
      it(`${from} → ${to} is ${allowed ? "allowed" : "refused"}`, async () => {
        const o = seedOrder({ stage: from, attempts: 2, stage_entered_at: "2026-01-01T00:00:00.000Z" });
        if (allowed) {
          await transition(String(o.id), to, "test", { refund_usd: 1 });
          const r = row("orders", o.id);
          expect(r.stage).toBe(to);
          expect(r.attempts).toBe(0);
          expect(r.refund_usd).toBe(1);
          expect(r.stage_entered_at).not.toBe("2026-01-01T00:00:00.000Z");
          const ev = events("transition").find((e) => e.order_id === o.id);
          expect(ev?.actor).toBe("code");
          expect(ev?.payload).toMatchObject({ from, to });
        } else {
          await expect(transition(String(o.id), to, "test")).rejects.toBeInstanceOf(InvalidTransitionError);
          expect(row("orders", o.id).stage).toBe(from);
          expect(events("transition").length).toBe(0);
        }
      });
    }
  }
});

describe("transition() concurrency and patch hygiene", () => {
  it("refuses when the row moved between read and conditional update", async () => {
    const o = seedOrder({ stage: "CREATED" });
    // Simulate a concurrent writer: the stage changes after transition() reads it.
    const orig = fake.client.from.bind(fake.client);
    let reads = 0;
    const spy = vi.spyOn(fake, "client", "get").mockImplementation(() => ({
      from: (t: string) => {
        const b = orig(t);
        if (t === "orders" && ++reads === 2) row("orders", o.id).stage = "PAID";
        return b;
      },
    }));
    await expect(transition(String(o.id), "PAID", "race")).rejects.toBeInstanceOf(StageConflictError);
    spy.mockRestore();
  });

  it("enforces opts.from", async () => {
    const o = seedOrder({ stage: "PAID" });
    await expect(transition(String(o.id), "RESEARCHING", "x", {}, { from: "CREATED" })).rejects.toBeInstanceOf(StageConflictError);
    await transition(String(o.id), "RESEARCHING", "x", {}, { from: "PAID" });
    expect(row("orders", o.id).stage).toBe("RESEARCHING");
  });

  it("a patch cannot smuggle stage / attempts / stage_entered_at", async () => {
    const o = seedOrder({ stage: "CREATED" });
    await transition(String(o.id), "PAID", "x", { stage: "DELIVERED", attempts: 9 } as never);
    expect(row("orders", o.id).stage).toBe("PAID");
    expect(row("orders", o.id).attempts).toBe(0);
  });

  it("two concurrent transitions: exactly one wins", async () => {
    const o = seedOrder({ stage: "CREATED" });
    const results = await Promise.allSettled([transition(String(o.id), "PAID", "a"), transition(String(o.id), "PAID", "b")]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(events("transition").length).toBe(1);
  });
});
