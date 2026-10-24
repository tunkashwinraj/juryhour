// sitemap.xml (WEBSITE_SPEC §9): every public page in the IA plus published (non-draft) blog posts.
// URLs come from NEXT_PUBLIC_APP_URL. Opt-in public verdicts are not listed individually yet; the
// /verdicts gallery links to them.
import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, absoluteUrl } from "@/lib/seo";
import { listPosts } from "../../content/blog";

/** Date of the current site content; bump when pages change materially. */
const SITE_UPDATED = "2026-10-24";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = PUBLIC_PAGES.map((p) => ({
    url: absoluteUrl(p.path),
    lastModified: SITE_UPDATED,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
  const posts = (await listPosts())
    .filter((p) => !p.draft)
    .map((p) => ({
      url: absoluteUrl(`/blog/${p.slug}`),
      lastModified: p.updated ?? p.date,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  return [...pages, ...posts];
}
