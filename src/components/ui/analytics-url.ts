// Strip private-link secrets from URLs before Vercel Analytics stores them (pure; tested in tests/website/a).

const PRIVATE: { prefix: string; placeholder: string }[] = [
  { prefix: "o", placeholder: "[token]" },
  { prefix: "r", placeholder: "[token]" },
  { prefix: "t", placeholder: "[id]" },
  { prefix: "preview", placeholder: "[id]" },
];

/**
 * "/o/abc123?x=1" → "/o/[token]"; "https://host/r/tok#s" → "https://host/r/[token]";
 * "/t/uuid" → "/t/[id]"; "/preview/uuid" → "/preview/[id]". Query and hash are dropped for those
 * paths only; every other URL is returned unchanged. Works for absolute and root-relative URLs.
 */
export function redactPrivateUrl(url: string): string {
  const m = /^((?:[a-z][a-z0-9+.-]*:)?\/\/[^/?#]*)?(\/[^?#]*)?([?#].*)?$/i.exec(url);
  if (!m) return url;
  const origin = m[1] ?? "";
  const path = m[2] ?? "";
  const segs = path.split("/"); // ["", "o", "<token>", ...]
  const rule = PRIVATE.find((p) => segs[1] === p.prefix);
  if (!rule || segs.length < 3 || segs[2] === "") return url;
  segs[2] = rule.placeholder;
  return origin + segs.join("/");
}

/** `beforeSend` for <Analytics />. */
export function redactAnalyticsEvent<E extends { url: string }>(event: E): E {
  return { ...event, url: redactPrivateUrl(event.url) };
}
