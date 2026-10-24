import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TIERS } from "@/lib/constants";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  JsonLd,
  absoluteUrl,
  articleLd,
  breadcrumbLd,
  faqLd,
  fullTitle,
  headingId,
  organizationLd,
  pageMetadata,
  productOffersLd,
  siteUrl,
  websiteLd,
} from "@/lib/seo";

const APP = process.env.NEXT_PUBLIC_APP_URL!; // tests/setup.ts → https://juryhour.test

describe("pageMetadata", () => {
  it("builds an absolute title, canonical from NEXT_PUBLIC_APP_URL, OG and Twitter", () => {
    const m = pageMetadata({ title: "Pricing", description: "Prices.", path: "/pricing" });
    expect(m.title).toEqual({ absolute: "Pricing · JuryHour" });
    expect(m.alternates?.canonical).toBe(`${APP}/pricing`);
    expect(String(m.metadataBase)).toBe(`${APP}/`);
    const og = m.openGraph as { url: string; images: { url: string }[]; title: string };
    expect(og.url).toBe(`${APP}/pricing`);
    expect(og.images[0].url).toBe(`${APP}/api/og?title=Pricing`);
    const tw = m.twitter as { card: string; images: string[] };
    expect(tw.card).toBe("summary_large_image");
    expect(tw.images[0]).toBe(`${APP}/api/og?title=Pricing`);
    expect(m.robots).toBeUndefined();
  });

  it("uses ogTitle for the share card and encodes it", () => {
    const m = pageMetadata({ title: "Compare", description: "x", path: "/compare", ogTitle: "JuryHour vs Wynter & PickFu" });
    const og = m.openGraph as { title: string; images: { url: string }[] };
    expect(og.title).toBe("JuryHour vs Wynter & PickFu");
    expect(new URL(og.images[0].url).searchParams.get("title")).toBe("JuryHour vs Wynter & PickFu");
  });

  it("noindex sets robots", () => {
    const m = pageMetadata({ title: "Styleguide", description: "x", path: "/styleguide", noindex: true });
    expect(m.robots).toEqual({ index: false, follow: false });
  });

  it("keeps titles within 60 chars including the suffix", () => {
    expect(fullTitle("Refund policy")).toBe("Refund policy · JuryHour");
    const long = "How I built a company with zero employees in one day"; // suffix would overflow 60
    expect(fullTitle(long)).toBe(long);
    const huge = "A very long title that keeps going and going well past the sixty character limit";
    expect(fullTitle(huge).length).toBeLessThanOrEqual(TITLE_MAX);
    expect(fullTitle("JuryHour: real buyers, real verdict")).toBe("JuryHour: real buyers, real verdict");
  });

  it("clips descriptions to 155 chars", () => {
    const d = "word ".repeat(60);
    const m = pageMetadata({ title: "T", description: d, path: "/" });
    expect((m.description as string).length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(m.description).toMatch(/…$/);
  });

  it("home canonical is the bare origin with a slash", () => {
    expect(absoluteUrl("/")).toBe(`${APP}/`);
    expect(siteUrl()).toBe(APP);
  });
});

describe("JSON-LD", () => {
  it("JsonLd escapes < to prevent script injection", () => {
    const html = renderToStaticMarkup(createElement(JsonLd, { data: { name: "</script><script>alert(1)</script>" } }));
    expect(html.startsWith('<script type="application/ld+json">')).toBe(true);
    expect(html).not.toContain("</script><script>");
    expect(html).toContain("\\u003c/script>");
  });

  it("organization names the founder and uses the app URL", () => {
    const o = organizationLd();
    expect(o["@type"]).toBe("Organization");
    expect(o.url).toBe(`${APP}/`);
    expect(o.founder).toEqual({ "@type": "Person", name: "Ashwin Raj Tunk" });
    expect(websiteLd()["@type"]).toBe("WebSite");
  });

  it("productOffersLd has one USD Offer per priced tier and the launch offer with priceValidUntil", () => {
    const prices = { spark: 11, pulse: 49, proof: 149, launch_pack: 199, specialist: null };
    const endsAt = "2026-10-24T22:00:00.000Z";
    const ld = productOffersLd(prices, { tier: "proof", priceUsd: 99, normalUsd: 149, endsAt, code: "TODAY99" }) as {
      "@type": string;
      offers: Record<string, unknown>[];
    };
    expect(ld["@type"]).toBe("Product");
    expect(ld.offers).toHaveLength(5);
    for (const o of ld.offers) {
      expect(o["@type"]).toBe("Offer");
      expect(o.priceCurrency).toBe("USD");
      expect(String(o.availability)).toMatch(/^https:\/\/schema\.org\//);
    }
    expect(ld.offers.map((o) => o.price)).toEqual(["11.00", "49.00", "149.00", "199.00", "99.00"]);
    expect(ld.offers[4].priceValidUntil).toBe(endsAt);
    const none = productOffersLd(prices, null) as { offers: unknown[] };
    expect(none.offers).toHaveLength(4);
  });

  it("productOffersLd falls back to TIERS prices", () => {
    const ld = productOffersLd({}, null) as { offers: { price: string }[] };
    expect(ld.offers[0].price).toBe(TIERS.spark.price.toFixed(2));
  });

  it("faqLd, articleLd, breadcrumbLd shapes", () => {
    const f = faqLd([{ q: "Who are the jurors?", aText: "Real people." }]) as { mainEntity: Record<string, unknown>[] };
    expect(f.mainEntity[0]).toEqual({
      "@type": "Question",
      name: "Who are the jurors?",
      acceptedAnswer: { "@type": "Answer", text: "Real people." },
    });
    const a = articleLd({ title: "T", description: "D", path: "/blog/x", datePublished: "2026-10-24" });
    expect(a["@type"]).toBe("BlogPosting");
    expect(a.url).toBe(`${APP}/blog/x`);
    expect(a.dateModified).toBe("2026-10-24");
    expect(a.author).toEqual({ "@type": "Person", name: "Ashwin Raj Tunk" });
    const b = breadcrumbLd([
      { name: "Home", path: "/" },
      { name: "Legal", path: "/legal" },
    ]) as { itemListElement: Record<string, unknown>[] };
    expect(b.itemListElement[1]).toEqual({ "@type": "ListItem", position: 2, name: "Legal", item: `${APP}/legal` });
  });

  it("headingId makes stable anchors", () => {
    expect(headingId("How do I test a landing page with real people?")).toBe("how-do-i-test-a-landing-page-with-real-people");
    expect(headingId("Agents decide, code enforces")).toBe("agents-decide-code-enforces");
    expect(headingId("???")).toBe("section");
  });
});
