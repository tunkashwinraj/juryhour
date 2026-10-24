// Table of contents from a rendered MDX element tree. The h2/h3 components in src/mdx-components.tsx
// carry a static `tocLevel` and derive their id from their text, so walking the tree that MDXContent
// returns gives exactly the anchors that end up in the page. Unknown shapes yield an empty TOC.
import { isValidElement, type ReactNode } from "react";
import { textOf } from "@/mdx-components";
import { headingId } from "@/lib/seo";

export type TocItem = { id: string; title: string; level: 2 | 3 };

export function extractToc(node: ReactNode, out: TocItem[] = [], depth = 0): TocItem[] {
  if (depth > 50 || node === null || node === undefined || typeof node === "boolean") return out;
  if (Array.isArray(node)) {
    for (const child of node) extractToc(child, out, depth + 1);
    return out;
  }
  if (!isValidElement(node)) return out;
  const props = node.props as { children?: ReactNode; id?: string };
  const level = typeof node.type === "function" ? (node.type as { tocLevel?: unknown }).tocLevel : undefined;
  if (level === 2 || level === 3) {
    const title = textOf(props.children).trim();
    if (title) out.push({ id: props.id ?? headingId(title), title, level });
    return out;
  }
  return extractToc(props.children, out, depth + 1);
}
