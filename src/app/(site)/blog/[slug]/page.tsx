import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd, articleLd, pageMetadata } from "@/lib/seo";
import { POST_SLUGS, isPostSlug, loadPost } from "../../../../../content/blog";
import { Breadcrumbs, Toc } from "../../legal/_ui/LegalPage";
import s from "../../legal/_ui/prose.module.css";
import { extractToc } from "../_ui/toc";
import { formatPostDate } from "../_ui/date";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return POST_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isPostSlug(slug)) return {};
  const { frontmatter: fm } = await loadPost(slug);
  return pageMetadata({ title: fm.title, description: fm.description, path: `/blog/${slug}`, noindex: fm.draft });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  if (!isPostSlug(slug)) notFound();
  const { Content, frontmatter: fm } = await loadPost(slug);
  const path = `/blog/${slug}`;
  const toc = extractToc(Content({}));

  return (
    <main id="main" className={s.page}>
      <Breadcrumbs
        items={[
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: fm.title, path },
        ]}
      />
      <article>
        <header className={s.header}>
          <p className={s.eyebrow}>Blog</p>
          <h1 className={s.title}>{fm.title}</h1>
          <p className={s.lede}>{fm.description}</p>
          <p className={s.meta}>
            <span>By {fm.author}</span>
            <time dateTime={fm.date}>{formatPostDate(fm.date)}</time>
            {fm.draft ? <span className={s.badge}>Draft</span> : null}
          </p>
        </header>
        <div className={s.layout}>
          <Toc items={toc} />
          <div className={s.prose}>
            <Content />
          </div>
        </div>
      </article>
      <JsonLd
        data={articleLd({
          title: fm.title,
          description: fm.description,
          path,
          datePublished: fm.date,
          dateModified: fm.updated,
          author: fm.author,
        })}
      />
    </main>
  );
}
