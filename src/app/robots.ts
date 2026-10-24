// robots.txt (WEBSITE_SPEC §9): everyone, including AI crawlers, may read the marketing site; private
// order/report/juror/ops pages and the API are off limits. OG images stay crawlable so link previews work.
import type { MetadataRoute } from "next";
import { AI_CRAWLERS, ROBOTS_DISALLOW, absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const allow = ["/", "/api/og"];
  const disallow = [...ROBOTS_DISALLOW];
  return {
    rules: [
      { userAgent: [...AI_CRAWLERS], allow, disallow },
      { userAgent: "*", allow, disallow },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
