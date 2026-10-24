// Attribution + funnel helpers (SPEC §9 `?src=` capture, §15 analytics). No PII here.
// Flow: proxy/landing reads `?src=` → normalizeSrc → sets SRC_COOKIE (srcCookie()) → preview and
// checkout routes call readSrc(cookies) (or prefer a normalized body `src`) and store it on the row.

export const SRC_COOKIE = "jh_src";
export const SRC_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SRC_RE = /^[a-z0-9_-]{1,40}$/;

/** Lowercases + trims; returns the value only if it matches [a-z0-9_-]{1,40}, else null. */
export function normalizeSrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  return SRC_RE.test(s) ? s : null;
}

/** Anything with a Next-style `get(name)` (cookies(), NextRequest.cookies, RequestCookies). */
export type CookieReader = { get(name: string): { value: string } | undefined };

export function readSrc(cookies: CookieReader | null | undefined): string | null {
  if (!cookies) return null;
  try {
    return normalizeSrc(cookies.get(SRC_COOKIE)?.value);
  } catch {
    return null;
  }
}

/** `?src=` from a request URL (string or URL), normalized. */
export function srcFromUrl(url: string | URL): string | null {
  try {
    return normalizeSrc(new URL(url).searchParams.get("src"));
  } catch {
    return null;
  }
}

/** Options for `response.cookies.set(...)` / `(await cookies()).set(...)`. First-party, no PII. */
export function srcCookie(src: string, secure = true) {
  return {
    name: SRC_COOKIE,
    value: src,
    maxAge: SRC_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure,
  };
}

/** Body `src` wins over the cookie when valid (explicit attribution beats a stale cookie). */
export function pickSrc(bodySrc: unknown, cookies: CookieReader | null | undefined): string | null {
  return normalizeSrc(bodySrc) ?? readSrc(cookies);
}

// ---------- /ops funnel: previews by src → checkouts → paid ----------

export const DIRECT_SRC = "(direct)";

export type FunnelPreviewRow = { src: string | null; safety_verdict?: string | null };
export type FunnelOrderRow = { src: string | null; paid_at: string | null; mode?: string | null };
export type FunnelRow = {
  src: string;
  previews: number;
  checkouts: number;
  paid: number;
  /** paid / previews, 0..1 (null when there were no previews from this src) */
  previewToPaid: number | null;
  /** paid / checkouts, 0..1 (null when there were no checkouts) */
  checkoutToPaid: number | null;
};

/**
 * Pure aggregation over rows the caller fetched (e.g. last 7 days). Orders = checkouts started;
 * paid = orders with paid_at. Pass `mode: "live"` to exclude sandbox orders (SPEC §2.11).
 * Refused previews are counted (they are still top-of-funnel traffic). Sorted by previews desc.
 */
export function buildFunnel(
  previews: FunnelPreviewRow[],
  orders: FunnelOrderRow[],
  opts: { mode?: string } = {},
): FunnelRow[] {
  const by = new Map<string, { previews: number; checkouts: number; paid: number }>();
  const bucket = (src: string | null) => {
    const key = normalizeSrc(src) ?? DIRECT_SRC;
    let b = by.get(key);
    if (!b) by.set(key, (b = { previews: 0, checkouts: 0, paid: 0 }));
    return b;
  };
  for (const p of previews) bucket(p.src).previews++;
  for (const o of orders) {
    if (opts.mode && o.mode && o.mode !== opts.mode) continue;
    const b = bucket(o.src);
    b.checkouts++;
    if (o.paid_at) b.paid++;
  }
  const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10_000) / 10_000 : null);
  return [...by.entries()]
    .map(([src, b]) => ({
      src,
      ...b,
      previewToPaid: ratio(b.paid, b.previews),
      checkoutToPaid: ratio(b.paid, b.checkouts),
    }))
    .sort((x, y) => y.previews - x.previews || y.paid - x.paid || x.src.localeCompare(y.src));
}
