import { describe, expect, it } from "vitest";
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

  it("preview_followup_2 pitches Pulse at the constant price", () => {
    const out = renderEmail("preview_followup_2", { preview_id: "p" }, ctx);
    expect(out.text).toContain("Pulse ($49)");
    expect(out.text).toContain("10 real people");
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
    expect(out.text).toMatch(/expires .*2026/);
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
