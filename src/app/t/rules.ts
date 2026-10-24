// Pure juror-page rules shared by the client page and the server routes (no server imports here).
import { TERAC_CALLBACK_URL } from "@/lib/constants";

/** Words = whitespace-separated tokens containing at least one letter or digit. */
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

const SID_RE = /^[A-Za-z0-9_\-:.]{1,200}$/;

/** A usable Terac submission id: not empty, not an unsubstituted `{TERAC_SUBMISSION_ID}` placeholder. */
export function isValidSid(sid: string | null | undefined): sid is string {
  return typeof sid === "string" && SID_RE.test(sid.trim());
}

/** Reads the submission id from `sid`, `teracSubmissionId` or `submissionId` (first valid wins). */
export function pickSid(params: Record<string, string | string[] | undefined>): string | null {
  for (const key of ["sid", "teracSubmissionId", "submissionId"]) {
    const raw = params[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (isValidSid(v)) return v.trim();
  }
  return null;
}

/** Terac's "Run a demo redirect" sends `teracSubmissionId=demo_…`; never store those. */
export function isDemoSid(sid: string): boolean {
  return sid.startsWith("demo_");
}

export type CallbackResult = "completed" | "rejected";

export function teracCallbackUrl(sid: string, result: CallbackResult): string {
  return `${TERAC_CALLBACK_URL}?teracSubmissionId=${encodeURIComponent(sid)}&result=${result}`;
}

/** Fisher–Yates shuffle (copy). */
export function shuffle<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
