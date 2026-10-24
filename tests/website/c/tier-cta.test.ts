// TierCta click behaviour (performTierClick): no preview / preview / paused / specialist / errors.
import { describe, expect, it, vi } from "vitest";
import { performTierClick, type TierClickContext, type TierClickDeps } from "@/components/preview/checkout";
import { postJson } from "@/components/preview/client-api";

const PREVIEW_ID = "22222222-2222-4222-8222-222222222222";
const PARENT_ID = "33333333-3333-4333-8333-333333333333";

function ctx(over: Partial<TierClickContext> = {}): TierClickContext {
  return {
    refused: false,
    salesPaused: false,
    checkoutInput: { url: "https://example.com/", buyer_desc: "indie founders", email: "a@b.co" },
    previewId: PREVIEW_ID,
    extraJurors: 0,
    coupon: null,
    parentOrderId: null,
    code: null,
    ...over,
  };
}

function deps(response: { status: number; body: unknown }, attr: Record<string, string> = {}) {
  const post = vi.fn<TierClickDeps["post"]>(async () => response);
  const assign = vi.fn<TierClickDeps["assign"]>();
  const track = vi.fn<(event: string, props?: unknown) => void>();
  const d: TierClickDeps = { post, assign, attribution: () => attr, track };
  return { ...d, post, assign, track };
}

describe("performTierClick", () => {
  it("no preview yet → open_form, no request", async () => {
    const d = deps({ status: 200, body: {} });
    expect(await performTierClick("proof", ctx({ checkoutInput: null, previewId: null }), d)).toEqual({ kind: "open_form" });
    expect(d.post).not.toHaveBeenCalled();
    expect(d.track).toHaveBeenCalledWith("tier_clicked", { tier: "proof", has_preview: false });
  });

  it("preview → POST /api/checkout with the contract body, then redirects", async () => {
    const d = deps({ status: 200, body: { ok: true, purchase_url: "https://sandbox.whop.com/checkout/abc", token: "t" } }, { src: "lovable", code: "LOVABLE" });
    const r = await performTierClick("proof", ctx({ extraJurors: 3, coupon: "HALF", parentOrderId: PARENT_ID }), d);
    expect(r).toEqual({ kind: "redirecting", url: "https://sandbox.whop.com/checkout/abc" });
    expect(d.post).toHaveBeenCalledWith(
      "/api/checkout",
      {
        tier: "proof",
        addons: [],
        extra_jurors: 3,
        coupon: "HALF",
        email: "a@b.co",
        buyer_desc: "indie founders",
        url: "https://example.com/",
        preview_id: PREVIEW_ID,
        parent_order_id: PARENT_ID,
        code: "LOVABLE",
        src: "lovable",
      },
      35_000,
    );
    expect(d.assign).toHaveBeenCalledWith("https://sandbox.whop.com/checkout/abc");
    expect(d.track).toHaveBeenCalledWith("checkout_redirected", { tier: "proof", code: "LOVABLE" });
  });

  it("a typed code beats the attributed one", async () => {
    const d = deps({ status: 200, body: { ok: true, purchase_url: "https://x.test/c", token: "t" } }, { code: "FROMURL" });
    await performTierClick("spark", ctx({ code: "TYPED" }), d);
    expect((d.post.mock.calls[0] as unknown[])[1]).toMatchObject({ code: "TYPED" });
  });

  it("sales paused (known) → waitlist, no request", async () => {
    const d = deps({ status: 200, body: {} });
    expect(await performTierClick("proof", ctx({ salesPaused: true }), d)).toEqual({ kind: "waitlist" });
    expect(d.post).not.toHaveBeenCalled();
  });

  it("sales paused (503 from checkout) → paused, no redirect", async () => {
    const d = deps({ status: 503, body: { ok: false, code: "sales_paused", error: "x" } });
    const r = await performTierClick("spark", ctx(), d);
    expect(r.kind).toBe("paused");
    expect(d.assign).not.toHaveBeenCalled();
  });

  it("specialist → POST /api/quote (no tier/extra jurors/coupon/code) → token", async () => {
    const d = deps({ status: 200, body: { ok: true, token: "quote_tok" } }, { src: "x", code: "IGNORED" });
    const r = await performTierClick("specialist", ctx({ extraJurors: 5, coupon: "HALF" }), d);
    expect(r).toEqual({ kind: "quote", token: "quote_tok" });
    expect(d.post).toHaveBeenCalledWith("/api/quote", {
      email: "a@b.co",
      buyer_desc: "indie founders",
      url: "https://example.com/",
      preview_id: PREVIEW_ID,
      src: "x",
    });
    expect(d.assign).not.toHaveBeenCalled();
  });

  it("refused preview → hidden; content_refused from the API → refused", async () => {
    expect((await performTierClick("proof", ctx({ refused: true }), deps({ status: 200, body: {} }))).kind).toBe("hidden");
    expect((await performTierClick("proof", ctx(), deps({ status: 403, body: { ok: false, code: "content_refused" } }))).kind).toBe("refused");
  });

  it("shared preview without email → need_email", async () => {
    const d = deps({ status: 200, body: {} });
    const r = await performTierClick("proof", ctx({ checkoutInput: { pitch_text: "p".repeat(50), buyer_desc: "b", email: null } }), d);
    expect(r).toEqual({ kind: "need_email" });
    expect(d.post).not.toHaveBeenCalled();
  });

  it("a coupon refusal shows the server's reason", async () => {
    const r = await performTierClick("proof", ctx({ coupon: "HALF" }), deps({ status: 400, body: { ok: false, code: "coupon_already_used", error: "HALF is for your first Verdict." } }));
    expect(r).toEqual({ kind: "error", message: "HALF is for your first Verdict. Nothing was charged." });
  });

  it("bad_parent and 502 surface plain messages", async () => {
    expect((await performTierClick("proof", ctx(), deps({ status: 400, body: { ok: false, code: "bad_parent" } }))).kind).toBe("bad_parent");
    const r = await performTierClick("proof", ctx(), deps({ status: 502, body: { ok: false, code: "checkout_unavailable" } }));
    expect(r.kind === "error" && r.message).toMatch(/Nothing was charged/);
  });
});

describe("postJson", () => {
  it("returns status + body and maps network failures to status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    expect(await postJson("/api/x", {})).toEqual({ status: 200, body: { ok: true } });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await postJson("/api/x", {})).toEqual({ status: 0, body: { ok: false, code: "network" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 504 })));
    expect(await postJson("/api/x", {})).toEqual({ status: 504, body: null });
    vi.unstubAllGlobals();
  });
});
