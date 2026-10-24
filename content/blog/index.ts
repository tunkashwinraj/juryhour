// Blog registry. Each post is content/blog/<slug>.mdx and exports its own frontmatter:
//
//   export const frontmatter = { title, description, date: "YYYY-MM-DD", author, draft? }
//
// (@next/mdx has no YAML frontmatter support without extra plugins, so a named export is used.)
// Add the slug to POST_SLUGS when you add a file. Drafts render with a "Draft" label, are noindex,
// and are left out of the sitemap.
import type { MDXContent } from "mdx/types";

export const POST_SLUGS = ["zero-employee-company-in-one-day"] as const;
export type PostSlug = (typeof POST_SLUGS)[number];

export type PostFrontmatter = {
  title: string;
  description: string;
  date: string; // ISO date (YYYY-MM-DD)
  updated?: string;
  author: string;
  draft?: boolean;
};

export type PostSummary = PostFrontmatter & { slug: PostSlug };

export function isPostSlug(slug: string): slug is PostSlug {
  return (POST_SLUGS as readonly string[]).includes(slug);
}

/** Validates a post's frontmatter export; throws with the slug so a broken post fails the build. */
export function checkFrontmatter(slug: string, fm: unknown): PostFrontmatter {
  const f = fm as Partial<PostFrontmatter> | undefined;
  const ok =
    !!f &&
    typeof f.title === "string" &&
    f.title.length > 0 &&
    typeof f.description === "string" &&
    f.description.length > 0 &&
    typeof f.author === "string" &&
    typeof f.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(f.date);
  if (!ok) throw new Error(`content/blog/${slug}.mdx: missing or invalid \`export const frontmatter\``);
  return f as PostFrontmatter;
}

export async function loadPost(slug: PostSlug): Promise<{ Content: MDXContent; frontmatter: PostFrontmatter }> {
  const mod = (await import(`../blog/${slug}.mdx`)) as { default: MDXContent; frontmatter?: unknown };
  return { Content: mod.default, frontmatter: checkFrontmatter(slug, mod.frontmatter) };
}

/** All posts, newest first. */
export async function listPosts(): Promise<PostSummary[]> {
  const posts = await Promise.all(
    POST_SLUGS.map(async (slug) => ({ slug, ...(await loadPost(slug)).frontmatter })),
  );
  return posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
