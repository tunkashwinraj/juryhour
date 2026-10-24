// HTTP basic auth for the company dashboard and its write routes (CONTRACTS §4).
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

export function proxy(request: NextRequest) {
  if (!isOpsPath(request.nextUrl.pathname)) {
    // Public page opened with ?src=: remember the channel (SPEC §9). Only reached via the
    // `has: query src` matcher below, so ordinary page loads never run the proxy.
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
    // pages carrying ?src= (not API routes, static assets or the juror page)
    { source: "/((?!api/|_next/|t/|favicon.ico).*)", has: [{ type: "query", key: "src" }] },
  ],
};
