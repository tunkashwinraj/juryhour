import { describe, expect, it, vi } from "vitest";
import { EMAIL_TEMPLATES, MARKETING_TEMPLATES, renderEmail, type EmailTemplate } from "@/emails/templates";
import { EmailVarError, escapeHtml, FOOTER_LINE, oneLine, safeUrl } from "@/emails/layout";

const ctx = { appUrl: "https://juryhour.test", unsubscribeUrl: "https://juryhour.test/api/unsubscribe?e=abc&s=def" };
const XSS = `<script>alert("x")</script>`;
const IMG = `"><img src=x onerror=alert(1)>`;

const VARS: Record<EmailTemplate, Record<string, string | number | null>> = {
  paid: { token: `tok${IMG}`, jurors: 15, eta: XSS, order_id: "o1" },
  delivered: { token: "tok_abc", verdict: `Card B won ${XSS}`, n: 14 },
  partial: { token: "tok_abc", delivered_n: 8, ordered_n: 10, refund_usd: 9.8, summary: XSS },
  refunded: { refund_usd: 49, reason: XSS, token: "tok_abc" },
  preview_followup_1: { preview_id: "p1", weak_spots: 2, weakest_line: XSS },
  preview_followup_2: { preview_id: `p1${IMG}` },
  quote_ready: { token: "tok_abc", price_usd: 499, purchase_url: "https://whop.com/checkout/plan_x?a=1&b=2", expires_at: "2026-10-26T12:00:00Z" },
  order_lookup: { orders: JSON.stringify([{ token: "tok_abcdefghijklmnop", tier: "proof", stage: "DELIVERED", created_at: "2026-10-24T12:00:00Z" }]) },
  support_reply: { body: `Hi,\n\nThanks for writing. ${XSS}\nSecond line.`, subject: `Help ${XSS}`, token: "tok_abc" },
};

describe("email templates", () => {
  it("covers every template", () => {
    expect(Object.keys(VARS).sort()).toEqual([...EMAIL_TEMPLATES].sort());
    expect([...MARKETING_TEMPLATES].sort()).toEqual(["preview_followup_1", "preview_followup_2"]);
  });

  for (const t of EMAIL_TEMPLATES) {
    it(`${t}: renders, escapes untrusted vars, has footer + unsubscribe`, () => {
      const out = renderEmail(t, VARS[t], ctx);
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.subject).not.toMatch(/[\r\n]/);
      expect(out.html).not.toContain("<script>");
      expect(out.html).not.toContain("<img src=x");
      expect(out.html).not.toContain("onerror=alert");
      expect(out.html).toContain(escapeHtml(FOOTER_LINE));
      expect(out.html).toContain(escapeHtml(ctx.unsubscribeUrl));
      expect(out.text).toContain(FOOTER_LINE);
      expect(out.text).toContain(ctx.unsubscribeUrl);
      // honest claims: never promise outcomes
      expect(`${out.subject} ${out.text}`.toLowerCase()).not.toMatch(/guarantee(d)? (conversion|sales|results|lift)/);
    });
  }

  it("escaped script text survives as visible text", () => {
    const out = renderEmail("delivered", VARS.delivered, ctx);
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("delivered: report link, share card and 'directional signal from N real people'", () => {
    const out = renderEmail("delivered", VARS.delivered, ctx);
    expect(out.html).toContain("https://juryhour.test/r/tok_abc");
    expect(out.html).toContain("/api/og/verdict/tok_abc?t=tok_abc");
    expect(out.text).toContain("Directional signal from 14 real people.");
  });

  it("paid: subject + URL-encoded status link", () => {
    const out = renderEmail("paid", VARS.paid, ctx);
    expect(out.subject).toBe("Your jury is being assembled");
    expect(out.text).toContain(`https://juryhour.test/o/${encodeURIComponent(VARS.paid.token as string)}`);
  });

  it("preview_followup_1: count comes from vars, generic without it", () => {
    expect(renderEmail("preview_followup_1", { preview_id: "p", weak_spots: 2 }, ctx).subject).toBe(
      "2 weak spots found — real humans can confirm for $11",
    );
    expect(renderEmail("preview_followup_1", { preview_id: "p", weak_spots: 1 }, ctx).subject).toMatch(/^1 weak spot found/);
    const generic = renderEmail("preview_followup_1", { preview_id: "p" }, ctx).subject;
    expect(generic).not.toMatch(/\d+ weak/);
    expect(generic).toContain("$11");
  });

  it("preview_followup_2 pitches the Verdict at the constant price, with HALF while it runs", () => {
    vi.useFakeTimers({ now: new Date("2026-11-10T12:00:00Z"), toFake: ["Date"] });
    try {
      const out = renderEmail("preview_followup_2", { preview_id: "p" }, ctx);
      expect(out.text).toContain("Verdict ($299 launch offer)");
      expect(out.text).toContain("20 real people");
      expect(out.text).toContain("Your first Verdict is $149 with code HALF through Nov 30");
      expect(out.text).toContain("code=HALF");
      vi.setSystemTime(new Date("2026-12-02T00:00:00Z"));
      const later = renderEmail("preview_followup_2", { preview_id: "p" }, ctx);
      expect(later.text).not.toContain("HALF");
      for (const o of [out, later]) expect(`${o.subject} ${o.text}`).not.toMatch(/Spark|Pulse|Proof|Launch Pack|Specialist/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("preview_followup_1 names the Quick Read", () => {
    const out = renderEmail("preview_followup_1", { preview_id: "p" }, ctx);
    expect(out.text).toContain("Get a Quick Read for $11");
    expect(`${out.subject} ${out.text}`).not.toMatch(/Spark|Pulse|Proof/);
  });

  it("partial: shows delivered count and refund amount", () => {
    const out = renderEmail("partial", VARS.partial, ctx);
    expect(out.subject).toContain("8 of 10");
    expect(out.text).toContain("$9.80");
  });

  it("quote_ready: Whop link kept (escaped in html), expiry shown; rejects non-http links", () => {
    const out = renderEmail("quote_ready", VARS.quote_ready, ctx);
    expect(out.text).toContain("https://whop.com/checkout/plan_x?a=1&b=2");
    expect(out.html).toContain("https://whop.com/checkout/plan_x?a=1&amp;b=2");
    expect(out.text).toContain("This quote expires at 8:00am ET, Mon Oct 26."); // 12:00Z = 8:00am EDT
    expect(renderEmail("quote_ready", { ...VARS.quote_ready, expires_at: null }, ctx).text).toContain("expires in 48 hours");
    expect(() => renderEmail("quote_ready", { ...VARS.quote_ready, purchase_url: "javascript:alert(1)" }, ctx)).toThrow(EmailVarError);
  });

  it("support_reply keeps paragraphs and escapes", () => {
    const out = renderEmail("support_reply", VARS.support_reply, ctx);
    expect(out.html).toContain("Thanks for writing. &lt;script&gt;");
    expect(out.html).toContain("<br>Second line.");
    expect(out.subject).toBe(`Re: Help ${XSS}`); // subject is plain text (no HTML context), single line
  });

  it("missing required vars throw EmailVarError", () => {
    expect(() => renderEmail("paid", {}, ctx)).toThrow(EmailVarError);
    expect(() => renderEmail("delivered", { token: "t", verdict: "v" }, ctx)).toThrow(/"n"/);
    expect(() => renderEmail("support_reply", { body: "   " }, ctx)).toThrow(EmailVarError);
  });

  it("helpers", () => {
    expect(oneLine("a\r\nBcc: x@y.z")).toBe("a Bcc: x@y.z");
    expect(safeUrl("data:text/html,hi")).toBeNull();
    expect(safeUrl("https://a.b/c")).toBe("https://a.b/c");
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });
});

describe("order reference and ET times in transactional emails", () => {
  const ID = "f9da6201-1234-4abc-8def-0123456789ab";
  it("every transactional template carries the order reference in the subject and body", () => {
    const cases: [EmailTemplate, Record<string, string | number>][] = [
      ["paid", { token: "tok_abc", jurors: 20, order_id: ID }],
      ["delivered", { token: "tok_abc", verdict: "B wins 14 of 20", n: 20, order_id: ID }],
      ["partial", { token: "tok_abc", delivered_n: 16, ordered_n: 20, refund_usd: 59.8, order_id: ID }],
      ["refunded", { refund_usd: 299, token: "tok_abc", order_id: ID }],
      ["quote_ready", { token: "tok_abc", price_usd: 499, purchase_url: "https://whop.com/c/x", order_id: ID }],
      ["support_reply", { body: "Thanks, we're on it.", token: "tok_abc", order_id: ID }],
    ];
    for (const [t, vars] of cases) {
      const out = renderEmail(t, vars, ctx);
      expect(out.subject).toMatch(/ · JH-F9DA6201$/);
      expect(out.text).toContain("Order reference: JH-F9DA6201");
      expect(out.html).toContain("JH-F9DA6201");
    }
    // without an order id (or with junk) there is no reference
    expect(renderEmail("paid", { token: "tok_abc", order_id: "not-a-uuid" }, ctx).subject).toBe("Your jury is being assembled");
    // marketing emails never carry one
    expect(renderEmail("preview_followup_1", { preview_id: "p", order_id: ID }, ctx).subject).not.toContain("JH-");
  });

  it("paid: the ISO deadline reads as an ET clock time, with 'today' on the same ET day", () => {
    vi.useFakeTimers({ now: new Date("2026-10-24T15:00:00Z"), toFake: ["Date"] });
    try {
      const today = renderEmail("paid", { token: "tok_abc", eta: "2026-10-24T23:03:58.014Z", order_id: ID }, ctx);
      expect(today.text).toContain("Expected verdict: by 7:03pm ET today.");
      expect(today.text).not.toContain("2026-10-24T");
      const tomorrow = renderEmail("paid", { token: "tok_abc", eta: "2026-10-25T05:30:00Z" }, ctx);
      expect(tomorrow.text).toContain("Expected verdict: by 1:30am ET, Sun Oct 25.");
      expect(renderEmail("paid", { token: "tok_abc", eta: "about 4 hours" }, ctx).text).toContain("Expected verdict: about 4 hours.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("order_lookup lines start with the reference and use ET dates", () => {
    const orders = JSON.stringify([{ id: ID, token: "tok_abcdefghijklmnop", tier: "proof", stage: "DELIVERED", created_at: "2026-10-25T02:00:00Z" }]);
    const out = renderEmail("order_lookup", { orders }, ctx);
    expect(out.text).toContain("JH-F9DA6201 · Verdict · Sat Oct 24 · Verdict delivered");
  });
});

