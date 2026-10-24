import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  BANNED_CATEGORIES,
  BUYABLE_TIERS,
  MAX_STAGE_ATTEMPTS,
  PANEL_GRACE_HOURS,
  TIERS,
} from "@/lib/constants";
import { proRataRefund } from "@/lib/guardrails";
import { LATE_MULTIPLIER, proRataExample, tierRefundRows } from "@/app/(site)/legal/_ui/refund-policy";
import { DRAFT_NOTE, NOT_LEGAL_ADVICE, PROCESSORS } from "@/app/(site)/legal/_ui/legal";
import RefundsPage, { metadata as refundsMeta } from "@/app/(site)/legal/refunds/page";
import TermsPage, { metadata as termsMeta } from "@/app/(site)/legal/terms/page";
import PrivacyPage, { metadata as privacyMeta } from "@/app/(site)/legal/privacy/page";
import AccessibilityPage, { metadata as a11yMeta } from "@/app/(site)/legal/accessibility/page";

const render = (C: () => React.ReactElement) => renderToStaticMarkup(createElement(C));
const decode = (html: string) =>
  html.replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/<[^>]+>/g, " ");

describe("refund policy matches the code", () => {
  it("panel minimums and windows come from TIERS", () => {
    const rows = tierRefundRows();
    for (const t of [...BUYABLE_TIERS, "specialist"] as const) {
      const row = rows.find((r) => r.tier === t)!;
      expect(row.minJurors).toBe(TIERS[t].minJurors);
      expect(row.jurors).toBe(TIERS[t].jurors);
      expect(row.deadlineHours).toBe(TIERS[t].deadlineHours);
      expect(row.lateAfterHours).toBe(TIERS[t].deadlineHours * 2);
    }
    expect(LATE_MULTIPLIER).toBe(2);
  });

  it("pro-rata example uses the production formula", () => {
    const ex = proRataExample();
    expect(ex.refund).toBe(proRataRefund(TIERS.proof.price, TIERS.proof.jurors, ex.approved));
    expect(ex.refund).toBeCloseTo((149 * 3) / 15, 2); // $29.80
    expect(ex.approved).toBeGreaterThanOrEqual(TIERS.proof.minJurors);
  });

  it("rendered page states minimums, grace, attempts, once-per-order and the formula", () => {
    const html = render(RefundsPage);
    for (const t of [...BUYABLE_TIERS, "specialist"] as const) {
      const row = new RegExp(`data-tier="${t}"[^]*?</tr>`).exec(html)?.[0] ?? "";
      expect(row).toContain(`>${TIERS[t].minJurors}<`);
      expect(row).toContain(`>${TIERS[t].jurors}<`);
    }
    const text = decode(html);
    expect(text).toContain(`${PANEL_GRACE_HOURS} extra hour`);
    expect(text).toContain(`fails ${MAX_STAGE_ATTEMPTS} times`);
    expect(text).toContain("one refund on request per order");
    expect(text).toContain(`more than ${TIERS.proof.deadlineHours * 2} hours for a Proof`);
    expect(text).toContain("$29.80");
    expect(text).toContain("support@juryhour.com");
  });
});

describe("legal pages", () => {
  const pages = [
    ["refunds", RefundsPage, refundsMeta],
    ["terms", TermsPage, termsMeta],
    ["privacy", PrivacyPage, privacyMeta],
    ["accessibility", AccessibilityPage, a11yMeta],
  ] as const;

  it.each(pages)("%s has last-updated, the not-legal-advice note, the draft flag and a canonical", (slug, Page, meta) => {
    const text = decode(render(Page));
    expect(text).toContain("Last updated:");
    expect(text).toContain("Oct 24, 2026");
    expect(text).toContain(decode(NOT_LEGAL_ADVICE));
    expect(text).toContain(DRAFT_NOTE);
    expect(meta.alternates?.canonical).toBe(`${process.env.NEXT_PUBLIC_APP_URL}/legal/${slug}`);
    expect((meta.description as string).length).toBeLessThanOrEqual(155);
  });

  it("terms list every banned category", () => {
    const html = render(TermsPage);
    for (const c of BANNED_CATEGORIES) expect(html).toContain(`data-category="${c}"`);
    expect(html).toContain("[STATE]");
  });

  it("privacy names every processor, covers jurors, cookies, no sale and under-18s", () => {
    const text = decode(render(PrivacyPage));
    for (const name of ["Whop", "Terac", "Exa", "OpenAI", "Anthropic", "Supabase", "Vercel", "Resend", "Cloudflare"]) {
      expect(PROCESSORS.map((p) => p.name)).toContain(name);
      expect(text).toContain(name);
    }
    expect(text).toContain("Terac holds jurors' identities");
    expect(text).toContain("jh_src");
    expect(text).toContain("jh_attr");
    expect(text).toContain("don't sell");
    expect(text).toContain("under 18");
  });

  it("accessibility states the WCAG 2.2 AA target", () => {
    expect(decode(render(AccessibilityPage))).toContain("WCAG 2.2 level AA");
  });
});
