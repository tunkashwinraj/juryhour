// HTTP basic auth for the company dashboard and its write routes (CONTRACTS §4), ?src= capture, and
// the vercel.app → canonical domain redirect (docs/WEBSITE_SPEC.md §9).
import { NextResponse, type NextRequest } from "next/server";
import { srcCookie, srcFromUrl } from "@/lib/analytics";

/** Constant-time string compare (no early exit on the first differing byte). */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export type BasicAuthResult = "ok" | "unauthorized" | "not_configured";

/** Checks an `Authorization: Basic …` header against the configured credentials. Fails closed. */
export function checkBasicAuth(
  header: string | null,
  user: string | undefined = process.env.OPS_BASIC_AUTH_USER,
  password: string | undefined = process.env.OPS_BASIC_AUTH_PASSWORD,
): BasicAuthResult {
  if (!user || !password) return "not_configured";
  if (!header || !header.startsWith("Basic ")) return "unauthorized";
  let decoded: string;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return "unauthorized";
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return "unauthorized";
  const okUser = safeEqual(decoded.slice(0, sep), user);
  const okPass = safeEqual(decoded.slice(sep + 1), password);
  return okUser && okPass ? "ok" : "unauthorized";
}

export function isOpsPath(pathname: string): boolean {
  return pathname === "/ops" || pathname.startsWith("/ops/") || pathname.startsWith("/api/ops-ui/");
}

/** Production aliases that should 308 to the canonical domain. Preview deployments keep working. */
const PRODUCTION_ALIASES = new Set(["juryhour.vercel.app", "juryhour-ashwin-raj-tunks-projects.vercel.app"]);

/**
 * Where a request should be redirected for the canonical domain, or null. Only when CANONICAL_HOST is
 * set (the lead sets it once DNS resolves), only from production aliases, and never for /api (Whop,
 * Terac and pg_cron POST to the vercel.app URL) or /t (juror links handed to Terac).
 */
export function canonicalRedirect(url: URL, host: string | null, canonical = process.env.CANONICAL_HOST): string | null {
  if (!canonical || !host) return null;
  const h = host.toLowerCase().split(":")[0];
  if (!PRODUCTION_ALIASES.has(h) || h === canonical) return null;
  const p = url.pathname;
  if (p.startsWith("/api/") || p === "/api" || p.startsWith("/t/") || p.startsWith("/_next/")) return null;
  return `https://${canonical}${p}${url.search}`;
}

export function proxy(request: NextRequest) {
  const target = canonicalRedirect(request.nextUrl, request.headers.get("host"));
  if (target) return NextResponse.redirect(target, 308);
  if (!isOpsPath(request.nextUrl.pathname)) {
    // Public page opened with ?src=: remember the channel (SPEC §9).
    const res = NextResponse.next();
    const src = srcFromUrl(request.url);
    if (src) res.cookies.set(srcCookie(src, request.nextUrl.protocol === "https:"));
    return res;
  }
  const result = checkBasicAuth(request.headers.get("authorization"));
  if (result === "ok") return NextResponse.next();
  if (result === "not_configured") {
    return new NextResponse("OPS_BASIC_AUTH_USER / OPS_BASIC_AUTH_PASSWORD is not configured", { status: 503 });
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="JuryHour ops", charset="UTF-8"' },
  });
}

export const config = {
  matcher: [
    "/ops",
    "/ops/:path*",
    "/api/ops-ui/:path*",
    // pages (not API routes, static assets or the juror page): ?src= capture + canonical redirect
    "/((?!api/|_next/|t/|favicon.ico|robots.txt|sitemap.xml|llms).*)",
  ],
};
