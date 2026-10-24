import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@vercel/analytics", () => ({ track: h.track }));

const {
  ATTR_COOKIE,
  attributionFromSearch,
  captureAttribution,
  getAttribution,
  mergeAttribution,
  normalizeCode,
  parseAttribution,
  readCookieFrom,
  resetAttributionCapture,
  track,
} = await import("@/lib/attribution");

/** A tiny document.cookie emulation: writes "name=value; attrs", reads "a=1; b=2". */
function fakeBrowser(search: string, initialCookies: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initialCookies));
  const writes: string[] = [];
  const doc = {
    get cookie() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(v: string) {
      writes.push(v);
      const [pair] = v.split(";");
      const eq = pair.indexOf("=");
      jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    },
  };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("location", { search, protocol: "https:" });
  return { jar, writes };
}

beforeEach(() => {
  resetAttributionCapture();
  h.track.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("pure helpers", () => {
  it("normalizes src, code and utm from a query string", () => {
    expect(attributionFromSearch("?src=Lovable&code=today99&utm_source=x&utm_medium=%3Cb%3E&utm_campaign=&junk=1")).toEqual({
      src: "lovable",
      code: "TODAY99",
      utm_source: "x",
      utm_medium: "b",
    });
    expect(attributionFromSearch("?src=bad%20value&code=no%20spaces")).toEqual({});
  });
  it("normalizeCode follows the checkout regex", () => {
    expect(normalizeCode(" whop_1 ")).toBe("WHOP_1");
    expect(normalizeCode("x".repeat(41))).toBeNull();
    expect(normalizeCode("a b")).toBeNull();
    expect(normalizeCode(5)).toBeNull();
  });
  it("parseAttribution drops junk", () => {
    expect(parseAttribution('{"src":"ok","code":"!!","utm_term":"t","evil":"x","first_seen":"2026-10-24T00:00:00Z"}')).toEqual({
      src: "ok",
      utm_term: "t",
      first_seen: "2026-10-24T00:00:00Z",
    });
    expect(parseAttribution("not json")).toBeNull();
    expect(parseAttribution("[1]")).toBeNull();
  });
  it("precedence: URL values replace stored ones key by key; first_seen is kept", () => {
    const stored = { src: "old", utm_source: "news", first_seen: "2026-10-01T00:00:00Z" };
    expect(mergeAttribution(stored, { src: "new", code: "C1" }, "2026-10-24T00:00:00Z")).toEqual({
      src: "new",
      utm_source: "news",
      code: "C1",
      first_seen: "2026-10-01T00:00:00Z",
    });
    expect(mergeAttribution(null, {}, "2026-10-24T00:00:00Z")).toEqual({ first_seen: "2026-10-24T00:00:00Z" });
  });
  it("readCookieFrom", () => {
    expect(readCookieFrom("a=1; jh_attr=%7B%22src%22%3A%22x%22%7D; b=2", "jh_attr")).toBe('{"src":"x"}');
    expect(readCookieFrom("a=1", "jh_attr")).toBeNull();
    expect(readCookieFrom("jh_attr=%E0%A4%A", "jh_attr")).toBeNull();
  });
});

describe("captureAttribution / getAttribution (browser)", () => {
  it("first visit: writes jh_attr (30 days, Lax, Secure) and jh_src", () => {
    const b = fakeBrowser("?src=reddit&utm_campaign=launch&code=TESTCODE");
    const a = captureAttribution();
    expect(a).toMatchObject({ src: "reddit", utm_campaign: "launch", code: "TESTCODE" });
    const attrWrite = b.writes.find((w) => w.startsWith(`${ATTR_COOKIE}=`))!;
    expect(attrWrite).toMatch(/Max-Age=2592000; Path=\/; SameSite=Lax; Secure/);
    expect(b.writes.some((w) => w.startsWith("jh_src=reddit;"))).toBe(true);
    expect(getAttribution()).toMatchObject({ src: "reddit", code: "TESTCODE", utm_campaign: "launch" });
  });

  it("later visit without params keeps the stored values (no rewrite)", () => {
    const stored = encodeURIComponent(JSON.stringify({ src: "reddit", first_seen: "2026-10-20T00:00:00Z" }));
    const b = fakeBrowser("", { [ATTR_COOKIE]: stored });
    expect(captureAttribution()).toEqual({ src: "reddit", first_seen: "2026-10-20T00:00:00Z" });
    expect(b.writes).toEqual([]);
  });

  it("later visit with a new ?code= overrides only that key", () => {
    const stored = encodeURIComponent(JSON.stringify({ src: "reddit", code: "OLD", first_seen: "2026-10-20T00:00:00Z" }));
    const b = fakeBrowser("?code=new1", { [ATTR_COOKIE]: stored });
    expect(captureAttribution()).toEqual({ src: "reddit", code: "NEW1", first_seen: "2026-10-20T00:00:00Z" });
    expect(b.writes.some((w) => w.startsWith("jh_src="))).toBe(false); // jh_src only on a new ?src=
  });

  it("falls back to the legacy jh_src cookie for src", () => {
    fakeBrowser("", { jh_src: "twitter" });
    expect(getAttribution()).toEqual({ src: "twitter" });
  });

  it("never throws when cookies are blocked", () => {
    vi.stubGlobal("document", {
      get cookie(): string {
        throw new Error("blocked");
      },
      set cookie(_v: string) {
        throw new Error("blocked");
      },
    });
    vi.stubGlobal("location", { search: "?src=x", protocol: "https:" });
    expect(captureAttribution()).toBeNull();
    expect(getAttribution()).toEqual({});
  });

  it("is a no-op on the server", () => {
    expect(getAttribution()).toEqual({});
    expect(captureAttribution()).toBeNull();
  });
});

describe("track", () => {
  it("forwards typed, non-PII props and drops undefined", () => {
    track("checkout_redirected", { tier: "proof", code: "TESTCODE" });
    track("tier_clicked", { tier: "spark", has_preview: undefined });
    expect(h.track).toHaveBeenNthCalledWith(1, "checkout_redirected", { tier: "proof", code: "TESTCODE" });
    expect(h.track).toHaveBeenNthCalledWith(2, "tier_clicked", { tier: "spark" });
  });
  it("swallows analytics failures", () => {
    h.track.mockImplementation(() => {
      throw new Error("adblock");
    });
    expect(() => track("waitlist_joined", {})).not.toThrow();
  });
});
