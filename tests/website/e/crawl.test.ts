import { describe, expect, it, vi } from "vitest";

vi.mock("../../../content/blog", () => ({
  listPosts: async () => [
    { slug: "draft-post", title: "D", description: "d", date: "2026-10-24", author: "A", draft: true },
    { slug: "live-post", title: "L", description: "l", date: "2026-10-25", author: "A" },
  ],
}));

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { PUBLIC_PAGES } from "@/lib/seo";

const APP = process.env.NEXT_PUBLIC_APP_URL!;

describe("robots", () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];

  it("allows AI crawlers and everyone else", () => {
    const agents = rules.flatMap((x) => (Array.isArray(x.userAgent) ? x.userAgent : [x.userAgent]));
    for (const a of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "*"]) expect(agents).toContain(a);
  });

  it("disallows private surfaces in every group, keeps OG images crawlable", () => {
    for (const rule of rules) {
      const dis = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
      for (const p of ["/o/", "/t/", "/r/", "/ops", "/preview", "/styleguide", "/api/"]) expect(dis).toContain(p);
      expect(rule.allow).toContain("/");
      expect(rule.allow).toContain("/api/og");
    }
  });

  it("points at the sitemap on the app URL", () => {
    expect(r.sitemap).toBe(`${APP}/sitemap.xml`);
  });
});

describe("sitemap", () => {
  it("lists every public page plus non-draft posts on the app URL, never private routes", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    for (const p of PUBLIC_PAGES) expect(urls).toContain(p.path === "/" ? `${APP}/` : `${APP}${p.path}`);
    expect(urls).toContain(`${APP}/blog/live-post`);
    expect(urls).not.toContain(`${APP}/blog/draft-post`);
    for (const u of urls) {
      expect(u.startsWith(APP)).toBe(true);
      expect(new URL(u).pathname).not.toMatch(/^\/(o|t|r|ops|preview|styleguide|api)(\/|$)/);
    }
    for (const p of ["/legal/privacy", "/legal/terms", "/legal/refunds", "/legal/accessibility", "/pricing", "/blog"]) {
      expect(urls).toContain(`${APP}${p}`);
    }
  });
});
