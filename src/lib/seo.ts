// SEO helpers shared by every marketing page (docs/WEBSITE_CONTRACTS.md §2 E, WEBSITE_SPEC §9).
// Canonical, OG and JSON-LD URLs always come from NEXT_PUBLIC_APP_URL — never hardcode the host.
import type { Metadata } from "next";
import { createElement, type ReactElement } from "react";
import { TIERS, type TierName } from "./constants";
import { env } from "./env";
import type { LaunchOffer } from "./launch";

export const SITE_NAME = "JuryHour";
export const TITLE_SUFFIX = " · JuryHour";
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;
export const FOUNDER_NAME = "Ashwin Raj Tunk";

const isDev = process.env.NODE_ENV === "development";

/** Base URL without trailing slash. Falls back to the raw env var if full env validation fails. */
export function siteUrl(): string {
  let base: string | undefined;
  try {
    base = env().NEXT_PUBLIC_APP_URL;
  } catch {
    base = process.env.NEXT_PUBLIC_APP_URL;
  }
  return (base || "http://localhost:3000").replace(/\/+$/, "");
}

/** Absolute URL for a site path ("/pricing" → "https://…/pricing"). Home is the bare base + "/". */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${p}`;
}

/** Support inbox from env (default support@juryhour.com). */
export function supportEmail(): string {
  try {
    return env().NEXT_PUBLIC_SUPPORT_EMAIL;
  } catch {
    return process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@juryhour.com";
  }
}

function warn(msg: string) {
  if (isDev) console.warn(`[seo] ${msg}`);
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

/**
 * Full document title, ≤ 60 chars. Adds " · JuryHour" unless the title already names the brand;
 * drops the suffix if it would overflow, and clips as a last resort (warning in dev).
 */
export function fullTitle(title: string): string {
  const t = title.trim();
  if (t.includes(SITE_NAME)) {
    if (t.length > TITLE_MAX) warn(`title over ${TITLE_MAX} chars, clipped: "${t}"`);
    return clip(t, TITLE_MAX);
  }
  const withSuffix = `${t}${TITLE_SUFFIX}`;
  if (withSuffix.length <= TITLE_MAX) return withSuffix;
  warn(`title + suffix over ${TITLE_MAX} chars (${withSuffix.length}): "${t}"`);
  return clip(t, TITLE_MAX);
}

export function clipDescription(description: string): string {
  const d = description.trim().replace(/\s+/g, " ");
  if (d.length > DESCRIPTION_MAX) warn(`description over ${DESCRIPTION_MAX} chars (${d.length}): "${d}"`);
  return clip(d, DESCRIPTION_MAX);
}

export function ogImageUrl(title: string, eyebrow?: string): string {
  const q = new URLSearchParams({ title });
  if (eyebrow) q.set("eyebrow", eyebrow);
  return absoluteUrl(`/api/og?${q.toString()}`);
}

export type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  ogTitle?: string;
  noindex?: boolean;
};

/** Page metadata: absolute title (bypasses the layout template), canonical, OG + Twitter cards. */
export function pageMetadata(i: PageMetadataInput): Metadata {
  const title = fullTitle(i.title);
  const description = clipDescription(i.description);
  const url = absoluteUrl(i.path);
  const ogTitle = i.ogTitle ?? i.title;
  const image = { url: ogImageUrl(ogTitle), width: 1200, height: 630, alt: ogTitle };
  return {
    metadataBase: new URL(siteUrl()),
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      url,
      title: ogTitle,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [image.url],
    },
    ...(i.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

// ---------------------------------------------------------------- crawl surface

/** Public, indexable pages (WEBSITE_SPEC §4) for the sitemap. Blog posts are added from content/blog. */
export const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" | "yearly" }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/pricing", priority: 0.9, changeFrequency: "daily" },
  { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly" },
  { path: "/sample-report", priority: 0.8, changeFrequency: "monthly" },
  { path: "/for/whop-sellers", priority: 0.7, changeFrequency: "monthly" },
  { path: "/for/lovable-builders", priority: 0.7, changeFrequency: "monthly" },
  { path: "/for/agencies", priority: 0.7, changeFrequency: "monthly" },
  { path: "/compare", priority: 0.7, changeFrequency: "monthly" },
  { path: "/compare/wynter", priority: 0.6, changeFrequency: "monthly" },
  { path: "/compare/pickfu", priority: 0.6, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.7, changeFrequency: "monthly" },
  { path: "/verdicts", priority: 0.6, changeFrequency: "daily" },
  { path: "/blog", priority: 0.6, changeFrequency: "weekly" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/agents", priority: 0.6, changeFrequency: "monthly" },
  { path: "/affiliates", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
  { path: "/changelog", priority: 0.5, changeFrequency: "weekly" },
  { path: "/legal", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/refunds", priority: 0.4, changeFrequency: "yearly" },
  { path: "/legal/accessibility", priority: 0.2, changeFrequency: "yearly" },
];

/** Never crawled or indexed (WEBSITE_SPEC §9, §13). */
export const ROBOTS_DISALLOW = ["/o/", "/t/", "/r/", "/ops", "/preview", "/styleguide", "/api/"] as const;

/** AI crawlers we explicitly welcome (GEO). */
export const AI_CRAWLERS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"] as const;

/** Stable anchor id for a heading ("How do I test a page?" → "how-do-i-test-a-page"). */
export function headingId(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "section"
  );
}

// ---------------------------------------------------------------- JSON-LD

type LdObject = Record<string, unknown>;

/** Serialize JSON-LD safely for inline <script> (escapes "<" per Next's JSON-LD guide). */
export function serializeLd(data: object | object[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** <script type="application/ld+json"> for one object or an array of objects. */
export function JsonLd({ data }: { data: object | object[] }): ReactElement {
  return createElement("script", {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: serializeLd(data) },
  });
}

const CONTEXT = "https://schema.org";

export function organizationLd(): LdObject {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    "@id": `${siteUrl()}/#organization`,
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/favicon.ico"),
    description:
      "JuryHour tests a landing page with real people who match your buyer, against an AI rewrite, and delivers a written verdict the same day.",
    email: supportEmail(),
    founder: { "@type": "Person", name: FOUNDER_NAME },
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: supportEmail() },
  };
}

export function websiteLd(): LdObject {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    name: SITE_NAME,
    url: absoluteUrl("/"),
    publisher: { "@id": `${siteUrl()}/#organization` },
    inLanguage: "en-US",
  };
}

const TIER_LABEL: Record<TierName, string> = {
  spark: "Spark",
  pulse: "Pulse",
  proof: "Proof",
  launch_pack: "Launch Pack",
  specialist: "Specialist",
};

/**
 * Product with one Offer per priced tier (USD, InStock). Specialist (quote-only) is omitted.
 * An active launch offer is added as its own priced Offer with priceValidUntil = its end time.
 */
export function productOffersLd(prices: Partial<Record<TierName, number | null>>, offer: LaunchOffer | null): LdObject {
  const offers: LdObject[] = [];
  for (const tier of Object.keys(TIERS) as TierName[]) {
    const price = prices[tier] ?? TIERS[tier].price;
    if (price === null || price === undefined) continue;
    offers.push({
      "@type": "Offer",
      name: `${TIER_LABEL[tier]} (${TIERS[tier].jurors} jurors)`,
      price: price.toFixed(2),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: absoluteUrl("/pricing"),
    });
  }
  if (offer) {
    offers.push({
      "@type": "Offer",
      name: `${TIER_LABEL[offer.tier]} launch offer (normally $${offer.normalUsd})`,
      price: offer.priceUsd.toFixed(2),
      priceCurrency: "USD",
      availability: "https://schema.org/LimitedAvailability",
      priceValidUntil: offer.endsAt,
      url: absoluteUrl("/pricing"),
    });
  }
  return {
    "@context": CONTEXT,
    "@type": "Product",
    name: "JuryHour landing page verdict",
    description:
      "Real people who match your buyer compare your landing page with an AI rewrite and explain which one wins. Directional signal from real people, not a sales guarantee.",
    brand: { "@type": "Brand", name: SITE_NAME },
    url: absoluteUrl("/pricing"),
    offers,
  };
}

export function faqLd(items: { q: string; aText: string }[]): LdObject {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.aText },
    })),
  };
}

export type ArticleLdInput = {
  title: string;
  description: string;
  path: string;
  datePublished: string; // ISO date
  dateModified?: string;
  author?: string;
  image?: string;
};

export function articleLd(i: ArticleLdInput): LdObject {
  const url = absoluteUrl(i.path);
  return {
    "@context": CONTEXT,
    "@type": "BlogPosting",
    headline: i.title,
    description: i.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: i.datePublished,
    dateModified: i.dateModified ?? i.datePublished,
    author: { "@type": "Person", name: i.author ?? FOUNDER_NAME },
    publisher: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
    image: i.image ?? ogImageUrl(i.title, "Blog"),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]): LdObject {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}
