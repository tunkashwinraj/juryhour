import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MdxH2, MdxH3, useMDXComponents } from "@/mdx-components";
import { extractToc } from "@/app/(site)/blog/_ui/toc";
import { formatPostDate } from "@/app/(site)/blog/_ui/date";
import { POST_SLUGS, checkFrontmatter } from "../../../content/blog";
import { fullTitle, DESCRIPTION_MAX, TITLE_MAX } from "@/lib/seo";

const root = join(__dirname, "../../..");

describe("blog content", () => {
  it.each(POST_SLUGS)("%s.mdx exists and exports valid frontmatter", (slug) => {
    const file = join(root, "content/blog", `${slug}.mdx`);
    expect(existsSync(file)).toBe(true);
    const src = readFileSync(file, "utf8");
    const m = /export const frontmatter = (\{[^]*?\n\})/.exec(src);
    expect(m).not.toBeNull();
    // The export is a plain object literal; evaluate it to check the shape.
    const fm = checkFrontmatter(slug, new Function(`return (${m![1]});`)());
    expect(fullTitle(fm.title).length).toBeLessThanOrEqual(TITLE_MAX);
    expect(fm.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("checkFrontmatter rejects a missing date", () => {
    expect(() => checkFrontmatter("x", { title: "t", description: "d", author: "a" })).toThrow(/content\/blog\/x\.mdx/);
  });
});

describe("table of contents", () => {
  it("mdx components give headings stable ids", () => {
    const html = renderToStaticMarkup(createElement(MdxH2, null, "Agents decide, code enforces"));
    expect(html).toBe('<h2 id="agents-decide-code-enforces">Agents decide, code enforces</h2>');
    expect(useMDXComponents().h2).toBe(MdxH2);
  });

  it("extractToc finds h2/h3 in an MDX-like tree, in order", () => {
    const tree = createElement(
      Fragment,
      null,
      createElement("p", null, "intro"),
      createElement(MdxH2, null, "What JuryHour does"),
      createElement("ul", null, createElement("li", null, "x")),
      createElement(MdxH3, null, "The ", createElement("em", null, "agents")),
      createElement("h2", null, "plain h2 is ignored"),
    );
    expect(extractToc(tree)).toEqual([
      { id: "what-juryhour-does", title: "What JuryHour does", level: 2 },
      { id: "the-agents", title: "The agents", level: 3 },
    ]);
  });

  it("formats dates without the clock", () => {
    expect(formatPostDate("2026-10-24")).toBe("Oct 24, 2026");
  });
});
