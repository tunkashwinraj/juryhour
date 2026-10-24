// Outbound email via Resend (SPEC §11.6, CONTRACTS §3 F). Server-only.
// - Not configured (no RESEND_API_KEY) → { id: null, skipped: "not_configured" } (never throws for that).
// - Marketing templates (preview_followup_*) check email_suppressions → skipped: "unsubscribed".
// - Every email carries a signed unsubscribe link + RFC 8058 one-click List-Unsubscribe headers.
// - Sends use a Resend idempotency key (`${template}:${order_id|preview_id}`) so retries can't double-send
//   (Resend keeps keys for 24h; the follow-up timestamps on `previews` remain the long-term guard).
import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { env, has } from "@/lib/env";
import { MARKETING_TEMPLATES, renderEmail, type EmailTemplate } from "@/emails/templates";

export type { EmailTemplate } from "@/emails/templates";
export { EMAIL_TEMPLATES, MARKETING_TEMPLATES } from "@/emails/templates";

export type SendEmailInput = {
  template: EmailTemplate;
  to: string;
  vars: Record<string, string | number | null>;
  /** Override the default idempotency key (e.g. support replies: one key per inbound message). */
  idempotencyKey?: string;
};

export type SendEmailResult = { id: string | null; skipped?: "unsubscribed" | "not_configured" };

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

/** Canonical form used for signing and suppression lookups. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hmac(email: string): string {
  return createHmac("sha256", env().OPS_API_KEY).update(email, "utf8").digest("base64url");
}

/** `${APP_URL}/api/unsubscribe?e=<base64url email>&s=<HMAC-SHA256(email, OPS_API_KEY) base64url>` */
export function unsubscribeUrl(email: string): string {
  const e = normalizeEmail(email);
  const base = env().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  const q = new URLSearchParams({ e: Buffer.from(e, "utf8").toString("base64url"), s: hmac(e) });
  return `${base}/api/unsubscribe?${q.toString()}`;
}

/** Returns the normalized email when the signature is valid, else null (constant-time compare). */
export function verifyUnsubscribe(e: string | null, s: string | null): string | null {
  if (!e || !s || e.length > 1024 || s.length > 128) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(e) || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const email = normalizeEmail(Buffer.from(e, "base64url").toString("utf8"));
  if (!EMAIL_RE.test(email)) return null;
  const expected = Buffer.from(hmac(email), "utf8");
  const given = Buffer.from(s, "utf8");
  if (expected.length !== given.length) return null;
  return timingSafeEqual(expected, given) ? email : null;
}

/** True when the address has unsubscribed. Throws on DB error (callers must not send blind). */
export async function isSuppressed(email: string): Promise<boolean> {
  const res = await db()
    .from("email_suppressions")
    .select("email")
    .eq("email", normalizeEmail(email))
    .maybeSingle();
  if (res.error) throw new Error(`email_suppressions lookup: ${res.error.message}`);
  return res.data !== null;
}

/** Inserts a suppression; duplicates are fine. */
export async function suppressEmail(email: string): Promise<void> {
  const res = await db().from("email_suppressions").insert({ email: normalizeEmail(email) });
  if (res.error && res.error.code !== "23505") throw new Error(`email_suppressions insert: ${res.error.message}`);
}

let client: { key: string; resend: Resend } | undefined;
function resend(key: string): Resend {
  if (!client || client.key !== key) client = { key, resend: new Resend(key) };
  return client.resend;
}

function defaultIdempotencyKey(template: EmailTemplate, vars: SendEmailInput["vars"]): string | undefined {
  if (template === "support_reply") return undefined; // many replies per order; caller passes its own key
  const ref = vars.order_id ?? vars.preview_id;
  if (ref === null || ref === undefined || String(ref).trim() === "") return undefined;
  return `${template}:${String(ref).trim()}`.slice(0, 256);
}

let warnedNotConfigured = false;

export async function sendEmail(i: SendEmailInput): Promise<SendEmailResult> {
  const to = normalizeEmail(i.to);
  if (!EMAIL_RE.test(to)) throw new Error(`sendEmail: invalid recipient for "${i.template}"`);

  if (!has("RESEND_API_KEY")) {
    if (!warnedNotConfigured) {
      console.warn("[email] RESEND_API_KEY is not configured; emails are skipped");
      warnedNotConfigured = true;
    }
    return { id: null, skipped: "not_configured" };
  }

  if (MARKETING_TEMPLATES.has(i.template) && (await isSuppressed(to))) {
    return { id: null, skipped: "unsubscribed" };
  }

  const e = env();
  const unsub = unsubscribeUrl(to);
  const { subject, html, text } = renderEmail(i.template, i.vars, { appUrl: e.NEXT_PUBLIC_APP_URL, unsubscribeUrl: unsub });
  const idempotencyKey = i.idempotencyKey ?? defaultIdempotencyKey(i.template, i.vars);

  const res = await resend(e.RESEND_API_KEY as string).emails.send(
    {
      from: e.RESEND_FROM,
      to,
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${unsub}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [{ name: "template", value: i.template }],
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );
  if (res.error) {
    throw new Error(`Resend send failed (${i.template}): ${res.error.name}: ${res.error.message}`);
  }
  return { id: res.data.id };
}
