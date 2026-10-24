// Cloudflare Turnstile server-side validation (SPEC §11.7, CONTRACTS §3 F).
// POST form-encoded { secret, response, remoteip? } to siteverify with a 5s timeout.
// TURNSTILE_SECRET unset → true only when APP_MODE=sandbox (dev); live fails closed.
import { env } from "@/lib/env";

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_TIMEOUT_MS = 5_000;
const MAX_TOKEN_LENGTH = 2048; // Cloudflare: tokens are at most 2048 chars

type SiteverifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
  action?: string;
  hostname?: string;
};

let warnedMissingSecret = false;

export async function verifyTurnstile(
  token: string | null,
  ip: string | null,
  opts: { action?: string } = {},
): Promise<boolean> {
  const e = env();
  if (!e.TURNSTILE_SECRET) {
    const allow = e.APP_MODE === "sandbox";
    if (!warnedMissingSecret) {
      console.warn(
        `[turnstile] TURNSTILE_SECRET is not configured; ${allow ? "allowing (APP_MODE=sandbox)" : "rejecting (APP_MODE=live, fail closed)"}`,
      );
      warnedMissingSecret = true;
    }
    return allow;
  }

  if (!token || token.length > MAX_TOKEN_LENGTH) return false;

  const body = new URLSearchParams({ secret: e.TURNSTILE_SECRET, response: token });
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[turnstile] siteverify HTTP ${res.status}`);
      return false;
    }
    const data = (await res.json()) as SiteverifyResponse;
    if (data.success !== true) {
      console.info(`[turnstile] rejected: ${(data["error-codes"] ?? []).join(",") || "unknown"}`);
      return false;
    }
    if (opts.action && data.action !== opts.action) {
      console.info(`[turnstile] action mismatch: got ${String(data.action)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[turnstile] siteverify failed: ${err instanceof Error ? err.name : "error"}`);
    return false;
  }
}

/** Test helper. */
export function resetTurnstileWarning() {
  warnedMissingSecret = false;
}
