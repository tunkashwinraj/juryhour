import { describe, expect, it } from "vitest";
import {
  PREVIEW_STORAGE_KEY,
  buildCheckoutBody,
  checkoutOutcome,
  decideTierAction,
  displayPrice,
  liveOffer,
  loadingStep,
  normalizeUrl,
  parseStoredPreview,
  previewHref,
  previewOutcome,
  previewRowToStored,
  readStoredPreview,
  validateForm,
  writeStoredPreview,
  type StoredPreview,
} from "@/components/preview/logic";

const ID = "11111111-1111-4111-8111-111111111111";

describe("normalizeUrl", () => {
  it.each([
    ["yourproduct.com", "https://yourproduct.com/"],
    ["  www.example.io/pricing  ", "https://www.example.io/pricing"],
    ["http://example.com", "http://example.com/"],
    ["HTTPS://Example.com/a?b=1", "https://example.com/a?b=1"],
    ["example.com:8080/x", "https://example.com:8080/x"],
    ["//example.com", "https://example.com/"],
  ])("%s → %s", (raw, want) => {
    expect(normalizeUrl(raw)).toEqual({ ok: true, url: want });
  });

  it.each(["", "   ", "not a url", "localhost:3000", "javascript:alert(1)", "ftp://example.com", "mailto:a@b.com", "http://192.168.0.1", "https://user:pw@example.com", "example."])(
    "rejects %j",
    (raw) => {
      const r = normalizeUrl(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    },
  );
});

describe("validateForm", () => {
  const base = { mode: "url" as const, url: "example.com", pitch: "", buyer: "indie SaaS founders", email: "A@B.co " };
  it("returns API-ready input with normalized url and lowercased email", () => {
    expect(validateForm(base)).toEqual({ ok: true, input: { url: "https://example.com/", buyer_desc: "indie SaaS founders", email: "a@b.co" } });
  });
  it("pitch mode needs ≥ 40 chars and drops the url", () => {
    const short = validateForm({ ...base, mode: "pitch", pitch: "too short" });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.errors.pitch).toMatch(/40/);
    const long = validateForm({ ...base, mode: "pitch", pitch: "x".repeat(45) });
    expect(long).toEqual({ ok: true, input: { pitch_text: "x".repeat(45), buyer_desc: "indie SaaS founders", email: "a@b.co" } });
  });
  it("reports every bad field", () => {
    const r = validateForm({ mode: "url", url: "nope", pitch: "", buyer: "a", email: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["buyer", "email", "url"]);
  });
});

describe("previewOutcome", () => {
  const result = { safety: { verdict: "allow", reason: "" }, headline: "H", weakest_line: "W", rewrite_suggestion: "R", recommended_panel: "P", confidence: 0.7 };
  it("done", () => {
    expect(previewOutcome(200, { ok: true, preview_id: ID, result })).toEqual({
      kind: "done",
      previewId: ID,
      result: { headline: "H", weakest_line: "W", rewrite_suggestion: "R", recommended_panel: "P" },
    });
  });
  it("refused (explicit flag or safety verdict)", () => {
    expect(previewOutcome(200, { ok: true, preview_id: ID, refused: true, reason: "gambling" })).toEqual({ kind: "refused", previewId: ID, reason: "gambling" });
    expect(previewOutcome(200, { ok: true, preview_id: ID, result: { ...result, safety: { verdict: "refuse", reason: "adult" } } }).kind).toBe("refused");
  });
  it("unreadable page → paste your pitch", () => {
    const o = previewOutcome(422, { ok: false, code: "page_unreadable", error: "x" });
    expect(o).toEqual({ kind: "unreadable", message: "We couldn't read that page. Paste your pitch instead?" });
  });
  it("rate limited explains when to retry", () => {
    const o = previewOutcome(429, { ok: false, code: "rate_limited" });
    expect(o.kind).toBe("rate_limited");
    if (o.kind === "rate_limited") expect(o.message).toMatch(/tomorrow/);
  });
  it("network / unknown errors", () => {
    expect(previewOutcome(0, { ok: false, code: "network" }).kind).toBe("error");
    expect(previewOutcome(500, null).kind).toBe("error");
    expect(previewOutcome(502, { ok: false, code: "preview_failed" })).toMatchObject({ kind: "error", resetBotCheck: true });
  });
});

describe("loadingStep (honest copy, no fake delay)", () => {
  it("advances by elapsed time", () => {
    expect(loadingStep(0, "url").text).toBe("Reading your page…");
    expect(loadingStep(0, "pitch").text).toBe("Reading your pitch…");
    expect(loadingStep(4_000, "url").index).toBe(1);
    expect(loadingStep(60_000, "url")).toEqual({ index: 2, text: "Writing a rewrite…" });
  });
});

describe("decideTierAction (TierCta branching)", () => {
  const input = { url: "https://e.com/", buyer_desc: "b", email: "a@b.co" };
  it("no preview → open the form", () => {
    expect(decideTierAction({ tier: "proof", refused: false, salesPaused: false, input: null }).kind).toBe("open_form");
    expect(decideTierAction({ tier: "specialist", refused: false, salesPaused: false, input: null }).kind).toBe("open_form");
  });
  it("preview → checkout; specialist → quote", () => {
    expect(decideTierAction({ tier: "spark", refused: false, salesPaused: false, input }).kind).toBe("checkout");
    expect(decideTierAction({ tier: "specialist", refused: false, salesPaused: false, input }).kind).toBe("quote");
  });
  it("paused → waitlist, even with a preview", () => {
    expect(decideTierAction({ tier: "proof", refused: false, salesPaused: true, input }).kind).toBe("waitlist");
    expect(decideTierAction({ tier: "proof", refused: false, salesPaused: true, input: null }).kind).toBe("waitlist");
  });
  it("refused beats everything → hidden", () => {
    expect(decideTierAction({ tier: "proof", refused: true, salesPaused: true, input }).kind).toBe("hidden");
  });
  it("shared preview without email → need_email", () => {
    expect(decideTierAction({ tier: "proof", refused: false, salesPaused: false, input: { ...input, email: null } }).kind).toBe("need_email");
  });
  it("previewHref", () => {
    expect(previewHref("proof")).toBe("/?tier=proof#preview");
    expect(previewHref(null)).toBe("/#preview");
  });
});

describe("buildCheckoutBody", () => {
  it("matches the /api/checkout contract and never sends secondPage", () => {
    const body = buildCheckoutBody({
      tier: "proof",
      addons: ["extra5", "secondPage", "rush", "extra5"],
      input: { url: "https://e.com/", buyer_desc: "founders", email: "a@b.co" },
      previewId: ID,
      parentOrderId: "not-a-uuid",
      code: "TESTCODE",
      src: "lovable",
    });
    expect(body).toEqual({
      tier: "proof",
      addons: ["extra5", "rush"],
      email: "a@b.co",
      buyer_desc: "founders",
      url: "https://e.com/",
      preview_id: ID,
      code: "TESTCODE",
      src: "lovable",
    });
  });
  it("pitch target, no optional fields", () => {
    const body = buildCheckoutBody({ tier: "spark", addons: [], input: { pitch_text: "p".repeat(50), buyer_desc: "b", email: "a@b.co" } });
    expect(body).toEqual({ tier: "spark", addons: [], email: "a@b.co", buyer_desc: "b", pitch_text: "p".repeat(50) });
  });
});

describe("checkoutOutcome", () => {
  it("redirects only to https purchase urls", () => {
    expect(checkoutOutcome(200, { ok: true, purchase_url: "https://sandbox.whop.com/c/x", token: "t" })).toEqual({ kind: "redirect", url: "https://sandbox.whop.com/c/x" });
    expect(checkoutOutcome(200, { ok: true, purchase_url: "javascript:alert(1)", token: "t" }).kind).toBe("error");
  });
  it("quote token", () => {
    expect(checkoutOutcome(200, { ok: true, token: "tok" })).toEqual({ kind: "quote", token: "tok" });
  });
  it.each([
    [503, "sales_paused", "paused"],
    [403, "content_refused", "refused"],
    [400, "bad_parent", "bad_parent"],
    [502, "checkout_unavailable", "error"],
    [400, "bad_request", "error"],
    [500, "internal", "error"],
  ])("%i %s → %s", (status, code, kind) => {
    expect(checkoutOutcome(status, { ok: false, code, error: "x" }).kind).toBe(kind);
  });
  it("502 says nothing was charged", () => {
    const o = checkoutOutcome(502, { ok: false, code: "checkout_unavailable" });
    expect(o.kind === "error" && o.message).toMatch(/Nothing was charged/);
  });
});

describe("stored preview (sessionStorage handoff)", () => {
  const p: StoredPreview = {
    id: ID,
    input: { url: "https://e.com/", buyer_desc: "founders", email: "a@b.co" },
    status: "done",
    result: { headline: "H", weakest_line: "W", rewrite_suggestion: "R", recommended_panel: "P" },
    savedAt: 1,
  };
  function memStorage() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  }
  it("round-trips", () => {
    const s = memStorage();
    writeStoredPreview(s, p);
    expect(s.m.has(PREVIEW_STORAGE_KEY)).toBe(true);
    expect(readStoredPreview(s)).toEqual(p);
    writeStoredPreview(s, null);
    expect(readStoredPreview(s)).toBeNull();
  });
  it("survives throwing storage (private mode)", () => {
    const boom = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("x"); } };
    expect(() => writeStoredPreview(boom, p)).not.toThrow();
    expect(readStoredPreview(boom)).toBeNull();
    expect(readStoredPreview(null)).toBeNull();
  });
  it("rejects malformed or tampered data", () => {
    expect(parseStoredPreview("{")).toBeNull();
    expect(parseStoredPreview(JSON.stringify({ ...p, id: "x" }))).toBeNull();
    expect(parseStoredPreview(JSON.stringify({ ...p, input: { buyer_desc: "b", email: "a@b.co" } }))).toBeNull(); // no target
    expect(parseStoredPreview(JSON.stringify({ ...p, result: { headline: "H" } }))).toBeNull();
    expect(parseStoredPreview(JSON.stringify({ ...p, input: { ...p.input, email: "nope" } }))?.input.email).toBeNull();
  });
  it("previewRowToStored never carries an email", () => {
    const s = previewRowToStored({
      id: ID, url: null, pitch_text: "pitch text", buyer_desc: "b", headline: null, weakest_line: null,
      rewrite_suggestion: null, recommended_panel: null, safety_verdict: "refuse", safety_reason: "adult", created_at: "2026-10-24T10:00:00Z",
    });
    expect(s).toEqual({ id: ID, input: { pitch_text: "pitch text", buyer_desc: "b", email: null }, status: "refused", reason: "adult", savedAt: Date.parse("2026-10-24T10:00:00Z") });
  });
});

describe("launch offer display", () => {
  const offer = { tier: "proof" as const, priceUsd: 99, normalUsd: 149, endsAt: "2026-10-24T22:00:00Z" };
  const before = Date.parse("2026-10-24T21:00:00Z");
  const after = Date.parse("2026-10-24T22:00:01Z");
  it("shows the launch price with the normal price until endsAt", () => {
    expect(displayPrice("proof", { proof: 149 }, offer, before)).toEqual({ price: 99, compareAt: 149 });
    expect(displayPrice("spark", { spark: 11 }, offer, before)).toEqual({ price: 11, compareAt: null });
  });
  it("drops it the moment it ends (stale static shell)", () => {
    expect(liveOffer(offer, after)).toBeNull();
    expect(displayPrice("proof", { proof: 149 }, offer, after)).toEqual({ price: 149, compareAt: null });
  });
  it("falls back to constants without server prices", () => {
    expect(displayPrice("pulse", undefined, null, before)).toEqual({ price: 49, compareAt: null });
  });
});
