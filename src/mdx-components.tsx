// Required by @next/mdx in the App Router. Workstream E (blog) may style elements here.
import type { MDXComponents } from "mdx/types";

const components: MDXComponents = {};

export function useMDXComponents(): MDXComponents {
  return components;
}
