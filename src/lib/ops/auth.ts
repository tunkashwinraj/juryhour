// Constant-time bearer check for the Ops API and the reconciler.
import { createHash, timingSafeEqual } from "node:crypto";

/** Compares SHA-256 digests so neither length nor content leaks through timing. */
export function bearerMatches(header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const a = createHash("sha256").update(m[1].trim(), "utf8").digest();
  const b = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(a, b);
}
