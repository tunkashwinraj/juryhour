import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { listPosts } from "../../../../content/blog";
import { Breadcrumbs } from "../legal/_ui/LegalPage";
import s from "../legal/_ui/prose.module.css";
import { formatPostDate } from "./_ui/date";

export const metadata: Metadata = pageMetadata({
  title: "Blog",
  description:
    "Notes from building JuryHour, a company run by AI agents: how it works, what broke, and what real buyers say about landing pages.",
  path: "/blog",
});

export default async function BlogIndexPage() {
  const posts = await listPosts();
  return (
    <main id="main" className={s.page}>
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
        ]}
      />
      <header className={s.header}>
        <p className={s.eyebrow}>Blog</p>
        <h1 className={s.title}>Notes from a company with zero employees</h1>
        <p className={s.lede}>How JuryHour is built and run, written by its founder. No numbers until they&apos;re real.</p>
      </header>
      {posts.length === 0 ? (
        <p className={s.cardText}>No posts yet.</p>
      ) : (
        <ul className={s.cardList}>
          {posts.map((p) => (
            <li key={p.slug}>
              <h2 className={s.cardTitle}>
                <a href={`/blog/${p.slug}`}>{p.title}</a>
              </h2>
              <p className={s.cardText}>{p.description}</p>
              <p className={s.meta}>
                <span>{p.author}</span>
                <time dateTime={p.date}>{formatPostDate(p.date)}</time>
                {p.draft ? <span className={s.badge}>Draft</span> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
