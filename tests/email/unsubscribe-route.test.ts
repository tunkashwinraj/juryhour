import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = { inserts: [] as unknown[], insertError: null as null | { message: string; code?: string } };
  const fakeDb = {
    from: (table: string) => ({
      insert: async (row: unknown) => {
        if (table !== "email_suppressions") throw new Error(`unexpected table ${table}`);
        state.inserts.push(row);
        return { data: null, error: state.insertError };
      },
    }),
  };
  return { state, fakeDb };
});
vi.mock("@/lib/db", () => ({ db: () => h.fakeDb }));
vi.mock("resend", () => ({ Resend: class {} }));

import { GET, POST } from "@/app/api/unsubscribe/route";
import { unsubscribeUrl } from "@/lib/email";

beforeEach(() => {
  h.state.inserts = [];
  h.state.insertError = null;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/unsubscribe", () => {
  it("valid link → suppression row + confirmation page", async () => {
    const res = await GET(new Request(unsubscribeUrl("Buyer@Example.com")));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("You&#39;re unsubscribed");
    expect(h.state.inserts).toEqual([{ email: "buyer@example.com" }]);
  });

  it("duplicate unsubscribe is still 200", async () => {
    h.state.insertError = { message: "duplicate key value", code: "23505" };
    const res = await GET(new Request(unsubscribeUrl("buyer@example.com")));
    expect(res.status).toBe(200);
  });

  it("tampered link → 400, no insert", async () => {
    const url = new URL(unsubscribeUrl("buyer@example.com"));
    url.searchParams.set("e", Buffer.from("victim@example.com").toString("base64url"));
    const res = await GET(new Request(url));
    expect(res.status).toBe(400);
    expect(h.state.inserts).toEqual([]);
    const missing = await GET(new Request("https://juryhour.test/api/unsubscribe"));
    expect(missing.status).toBe(400);
  });

  it("db failure → 500", async () => {
    h.state.insertError = { message: "down", code: "XX000" };
    const res = await GET(new Request(unsubscribeUrl("buyer@example.com")));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/unsubscribe (RFC 8058 one-click)", () => {
  it("valid → 200 json + insert; bad → 400", async () => {
    const ok = await POST(new Request(unsubscribeUrl("a@b.co"), { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(h.state.inserts).toEqual([{ email: "a@b.co" }]);
    const bad = await POST(new Request("https://juryhour.test/api/unsubscribe?e=x&s=y", { method: "POST" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("bad_signature");
  });
});
