// Required by @next/mdx in the App Router. Blog posts (content/blog/*.mdx) get stable heading ids so
// the article table of contents and deep links work; styling comes from the article's prose class.
import type { MDXComponents } from "mdx/types";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { headingId } from "@/lib/seo";

/** Plain text of a React children tree (for heading ids and the table of contents). */
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

type HeadingProps = ComponentPropsWithoutRef<"h2">;

function makeHeading(level: 2 | 3) {
  const Tag = level === 2 ? "h2" : "h3";
  function Heading({ children, id, ...rest }: HeadingProps) {
    const anchor = id ?? headingId(textOf(children));
    return (
      <Tag id={anchor} {...rest}>
        {children}
      </Tag>
    );
  }
  Heading.tocLevel = level;
  Heading.displayName = `MdxH${level}`;
  return Heading;
}

export const MdxH2 = makeHeading(2);
export const MdxH3 = makeHeading(3);

function MdxLink({ href = "", children, ...rest }: ComponentPropsWithoutRef<"a">) {
  const external = /^https?:\/\//.test(href);
  return (
    <a href={href} {...(external ? { rel: "noopener noreferrer" } : {})} {...rest}>
      {children}
    </a>
  );
}

function MdxTable(props: ComponentPropsWithoutRef<"table">) {
  return (
    <div role="region" aria-label="Table" tabIndex={0} style={{ overflowX: "auto" }}>
      <table {...props} />
    </div>
  );
}

const components: MDXComponents = {
  h2: MdxH2,
  h3: MdxH3,
  a: MdxLink,
  table: MdxTable,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
