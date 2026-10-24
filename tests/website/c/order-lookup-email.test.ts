import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATES, MARKETING_TEMPLATES, renderEmail } from "@/emails/templates";
import { EmailVarError, FOOTER_LINE } from "@/emails/layout";

const ctx = { appUrl: "https://juryhour.test", unsubscribeUrl: "https://juryhour.test/api/unsubscribe?e=a&s=b" };

describe("order_lookup email", () => {
  it("is registered and transactional", () => {
    expect(EMAIL_TEMPLATES).toContain("order_lookup");
    expect(MARKETING_TEMPLATES.has("order_lookup")).toBe(false);
  });

  it("links status pages, and reports once delivered; escapes everything", () => {
    const orders = [
      { token: "tok_delivered_0123456789abcdef", tier: "proof", stage: "DELIVERED", created_at: "2026-10-24T10:00:00Z" },
      { token: "tok_quote_0123456789abcdefghij", tier: "specialist", stage: "CREATED", created_at: "2026-10-24T09:00:00Z" },
      { token: `"><img src=x onerror=alert(1)>`, tier: "proof", stage: "PAID", created_at: null },
    ];
    const out = renderEmail("order_lookup", { orders: JSON.stringify(orders) }, ctx);
    expect(out.subject).toBe("Your JuryHour order links");
    expect(out.text).toContain("https://juryhour.test/o/tok_delivered_0123456789abcdef");
    expect(out.text).toContain("https://juryhour.test/r/tok_delivered_0123456789abcdef");
    expect(out.text).toContain("https://juryhour.test/o/tok_quote_0123456789abcdefghij");
    expect(out.text).not.toContain("/r/tok_quote");
    expect(out.text).toContain("Custom jury");
    expect(out.text).not.toMatch(/Specialist|Spark|Proof|Pulse|Launch Pack/);
    expect(out.text).toContain("Quote requested");
    expect(out.html).not.toContain("<img src=x");
    expect(out.text).toContain(FOOTER_LINE);
    expect(out.text).toContain("your JuryHour orders. Here they are");
  });

  it("throws on missing or empty orders (never sends an empty email)", () => {
    expect(() => renderEmail("order_lookup", {}, ctx)).toThrow(EmailVarError);
    expect(() => renderEmail("order_lookup", { orders: "[]" }, ctx)).toThrow(EmailVarError);
    expect(() => renderEmail("order_lookup", { orders: "{" }, ctx)).toThrow(EmailVarError);
  });
});
