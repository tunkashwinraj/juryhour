import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const send = vi.fn();
  const state = {
    suppressed: new Set<string>(),
    lookupError: null as null | { message: string },
    inserts: [] as unknown[],
    insertError: null as null | { message: string; code?: string },
  };
  const fakeDb = {
    from(table: string) {
      if (table !== "email_suppressions") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_col: string, val: string) => ({
            maybeSingle: async () =>
              state.lookupError
                ? { data: null, error: state.lookupError }
                : { data: state.suppressed.has(val) ? { email: val } : null, error: null },
          }),
        }),
        insert: async (row: unknown) => {
          state.inserts.push(row);
          return { data: null, error: state.insertError };
        },
      };
    },
  };
  return { send, state, fakeDb };
});

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: h.send };
    constructor(public key: string) {}
  },
}));
vi.mock("@/lib/db", () => ({ db: () => h.fakeDb }));

import { resetEnvCache } from "@/lib/env";
import { normalizeEmail, sendEmail, suppressEmail, unsubscribeUrl, verifyUnsubscribe } from "@/lib/email";

function setResendKey(v: string | undefined) {
  if (v === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = v;
  resetEnvCache();
}

beforeEach(() => {
  h.send.mockReset();
  h.send.mockResolvedValue({ data: { id: "email_123" }, error: null, headers: null });
  h.state.suppressed.clear();
  h.state.lookupError = null;
  h.state.inserts = [];
  h.state.insertError = null;
  setResendKey("re_test_key");
});
afterEach(() => setResendKey(undefined));

describe("unsubscribe link signing", () => {
  it("round-trips and normalizes case", () => {
    const url = new URL(unsubscribeUrl("  Buyer@Example.COM "));
    expect(url.origin + url.pathname).toBe("https://juryhour.test/api/unsubscribe");
    const e = url.searchParams.get("e");
    const s = url.searchParams.get("s");
    expect(Buffer.from(e!, "base64url").toString()).toBe("buyer@example.com");
    expect(verifyUnsubscribe(e, s)).toBe("buyer@example.com");
  });

  it("rejects tampering", () => {
    const url = new URL(unsubscribeUrl("buyer@example.com"));
    const e = url.searchParams.get("e")!;
    const s = url.searchParams.get("s")!;
    const otherE = Buffer.from("victim@example.com").toString("base64url");
    expect(verifyUnsubscribe(otherE, s)).toBeNull();
    const flipped = (s[0] === "A" ? "B" : "A") + s.slice(1);
    expect(verifyUnsubscribe(e, flipped)).toBeNull();
    expect(verifyUnsubscribe(e, s.slice(0, -1))).toBeNull();
    expect(verifyUnsubscribe(e, null)).toBeNull();
    expect(verifyUnsubscribe(null, s)).toBeNull();
    expect(verifyUnsubscribe(e, `${s}=`)).toBeNull();
  });

  it("signature depends on OPS_API_KEY", () => {
    const url = new URL(unsubscribeUrl("buyer@example.com"));
    const prev = process.env.OPS_API_KEY!;
    process.env.OPS_API_KEY = "another-ops-key-0123456789abcdef01234567";
    resetEnvCache();
    try {
      expect(verifyUnsubscribe(url.searchParams.get("e"), url.searchParams.get("s"))).toBeNull();
    } finally {
      process.env.OPS_API_KEY = prev;
      resetEnvCache();
    }
  });
});

describe("sendEmail", () => {
  it("sends via Resend with unsubscribe headers, tag and idempotency key", async () => {
    const res = await sendEmail({ template: "paid", to: "Buyer@Example.com", vars: { token: "tok", order_id: "ord_1" } });
    expect(res).toEqual({ id: "email_123" });
    expect(h.send).toHaveBeenCalledTimes(1);
    const [payload, opts] = h.send.mock.calls[0];
    expect(payload.to).toBe("buyer@example.com");
    expect(payload.from).toBe("JuryHour <verdict@juryhour.com>");
    expect(payload.subject).toBe("Your jury is being assembled");
    expect(payload.html).toContain("/api/unsubscribe?e=");
    expect(payload.text).toContain("/api/unsubscribe?e=");
    expect(payload.headers["List-Unsubscribe"]).toBe(`<${unsubscribeUrl("buyer@example.com")}>`);
    expect(payload.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(payload.tags).toEqual([{ name: "template", value: "paid" }]);
    expect(opts).toEqual({ idempotencyKey: "paid:ord_1" });
  });

  it("uses preview_id for follow-ups and no default key for support replies", async () => {
    await sendEmail({ template: "preview_followup_2", to: "a@b.co", vars: { preview_id: "pv_9" } });
    expect(h.send.mock.calls[0][1]).toEqual({ idempotencyKey: "preview_followup_2:pv_9" });
    await sendEmail({ template: "support_reply", to: "a@b.co", vars: { body: "hello", order_id: "o" } });
    expect(h.send.mock.calls[1][1]).toBeUndefined();
    await sendEmail({ template: "support_reply", to: "a@b.co", vars: { body: "hello" }, idempotencyKey: "support:msg_1" });
    expect(h.send.mock.calls[2][1]).toEqual({ idempotencyKey: "support:msg_1" });
  });

  it("not configured → skipped, no send, no throw", async () => {
    setResendKey(undefined);
    const res = await sendEmail({ template: "paid", to: "a@b.co", vars: { token: "t" } });
    expect(res).toEqual({ id: null, skipped: "not_configured" });
    expect(h.send).not.toHaveBeenCalled();
  });

  it("marketing templates skip suppressed addresses (case-insensitive)", async () => {
    h.state.suppressed.add("buyer@example.com");
    for (const template of ["preview_followup_1", "preview_followup_2"] as const) {
      const res = await sendEmail({ template, to: "BUYER@example.com", vars: { preview_id: "p", weak_spots: 2 } });
      expect(res).toEqual({ id: null, skipped: "unsubscribed" });
    }
    expect(h.send).not.toHaveBeenCalled();
  });

  it("transactional templates still send to suppressed addresses", async () => {
    h.state.suppressed.add("buyer@example.com");
    const res = await sendEmail({ template: "refunded", to: "buyer@example.com", vars: { refund_usd: 11 } });
    expect(res.id).toBe("email_123");
  });

  it("marketing send fails closed when suppression lookup errors", async () => {
    h.state.lookupError = { message: "boom" };
    await expect(sendEmail({ template: "preview_followup_1", to: "a@b.co", vars: { preview_id: "p" } })).rejects.toThrow(/email_suppressions/);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("throws on Resend error and on invalid recipient", async () => {
    h.send.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "bad from", statusCode: 422 }, headers: null });
    await expect(sendEmail({ template: "paid", to: "a@b.co", vars: { token: "t" } })).rejects.toThrow(/validation_error/);
    await expect(sendEmail({ template: "paid", to: "not-an-email", vars: { token: "t" } })).rejects.toThrow(/invalid recipient/);
    await expect(sendEmail({ template: "paid", to: "a@b.co\r\nBcc: x@y.z", vars: { token: "t" } })).rejects.toThrow(/invalid recipient/);
  });
});

describe("suppressEmail", () => {
  it("inserts normalized email and ignores duplicates", async () => {
    await suppressEmail(" A@B.co ");
    expect(h.state.inserts).toEqual([{ email: "a@b.co" }]);
    h.state.insertError = { message: "duplicate key", code: "23505" };
    await expect(suppressEmail("a@b.co")).resolves.toBeUndefined();
    h.state.insertError = { message: "down", code: "XX000" };
    await expect(suppressEmail("a@b.co")).rejects.toThrow(/down/);
  });

  it("normalizeEmail", () => {
    expect(normalizeEmail("  X@Y.Z ")).toBe("x@y.z");
  });
});
