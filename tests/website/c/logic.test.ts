import { describe, expect, it } from "vitest";
import {
  PREVIEW_STORAGE_KEY,
  TIER_LABELS,
  allowsExtraJurors,
  buildCheckoutBody,
  checkoutOutcome,
  clampExtraJurors,
  couponFor,
  decideTierAction,
  displayPrice,
  isCtaTier,
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
  it("matches the /api/checkout contract: no legacy add-ons, extra jurors and coupon when set", () => {
    const body = buildCheckoutBody({
      tier: "proof",
      extraJurors: 4,
      coupon: "HALF",
      input: { url: "https://e.com/", buyer_desc: "founders", email: "a@b.co" },
      previewId: ID,
      parentOrderId: "not-a-uuid",
      code: "TESTCODE",
      src: "lovable",
    });
    expect(body).toEqual({
      tier: "proof",
      addons: [],
      extra_jurors: 4,
      coupon: "HALF",
      email: "a@b.co",
      buyer_desc: "founders",
      url: "https://e.com/",
      preview_id: ID,
      code: "TESTCODE",
      src: "lovable",
    });
  });
  it("pitch target, no optional fields", () => {
    const body = buildCheckoutBody({ tier: "spark", input: { pitch_text: "p".repeat(50), buyer_desc: "b", email: "a@b.co" } });
    expect(body).toEqual({ tier: "spark", addons: [], email: "a@b.co", buyer_desc: "b", pitch_text: "p".repeat(50) });
  });
  it("clamps extra jurors to 0–20 and sends a retest parent", () => {
    const input = { url: "https://e.com/", buyer_desc: "b", email: "a@b.co" };
    expect(buildCheckoutBody({ tier: "retest", extraJurors: 40, input, parentOrderId: ID })).toMatchObject({ tier: "retest", extra_jurors: 20, parent_order_id: ID });
    expect(buildCheckoutBody({ tier: "proof", extraJurors: -3, input })).not.toHaveProperty("extra_jurors");
  });
});

describe("tiers, extra jurors and coupon (client side)", () => {
  const coupon = { code: "HALF", tier: "proof" as const, percentOff: 50, endsAt: "2026-12-01T05:00:00.000Z", firstOrderOnly: true };
  it("CTA tiers are the sold ones; old ?tier= links are ignored", () => {
    expect(["spark", "proof", "retest", "specialist", "pulse", "launch_pack"].map(isCtaTier)).toEqual([true, true, true, false, false, false]);
    expect([TIER_LABELS.spark, TIER_LABELS.proof, TIER_LABELS.retest]).toEqual(["Quick Read", "Verdict", "Retest"]);
    expect(Object.values(TIER_LABELS).join(" ")).not.toMatch(/Spark|Pulse|Proof|Launch Pack|Specialist/);
  });
  it("extra jurors: whole numbers 0–20, only on Quick Read / Verdict / Retest", () => {
    expect([-1, 0, 7.9, 20, 99, "3", "x"].map(clampExtraJurors)).toEqual([0, 0, 7, 20, 20, 3, 0]);
    expect(["spark", "proof", "retest", "specialist"].map((t) => allowsExtraJurors(t as never))).toEqual([true, true, true, false]);
  });
  it("couponFor: only on the Verdict, only with the matching code (any case)", () => {
    expect(couponFor("proof", coupon, "half")).toBe(coupon);
    expect(couponFor("spark", coupon, "HALF")).toBeNull();
    expect(couponFor("retest", coupon, "HALF")).toBeNull();
    expect(couponFor("proof", coupon, "TODAY50")).toBeNull();
    expect(couponFor("proof", coupon, null)).toBeNull();
    expect(couponFor("proof", null, "HALF")).toBeNull();
  });
  it("refusal codes from checkout show the server's message", () => {
    for (const code of ["coupon_unknown", "coupon_expired", "coupon_not_applicable", "coupon_already_used", "extra_jurors_out_of_range", "margin_too_low", "tier_not_offered", "addons_not_offered", "retest_window_expired"]) {
      const o = checkoutOutcome(400, { ok: false, code, error: "Server says why." });
      expect(o).toEqual({ kind: "error", message: "Server says why. Nothing was charged." });
    }
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

describe("display prices", () => {
  it("server price, else the constant", () => {
    expect(displayPrice("proof", { proof: 279 })).toBe(279);
    expect(displayPrice("proof", undefined)).toBe(299);
    expect(displayPrice("retest", {})).toBe(59);
    expect(displayPrice("specialist", undefined)).toBeNull();
  });
});
