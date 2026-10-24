# Workstream F: email, Turnstile, analytics: discrepancies vs SPEC

Checked against the installed `resend@6.34.1` types (`node_modules/resend/dist/index.d.mts`) and the Cloudflare Turnstile server-side validation page (fetched 2026-10-24).

## Resend
- `resend.emails.send(payload, { idempotencyKey })`: the SDK sends `Idempotency-Key`. It does **not throw** on API errors; it returns `{ data, error }`. `sendEmail` throws `Resend send failed (<template>): <name>: <message>` on `error`.
- Idempotency keys only last **24h** on Resend, so they protect against retries, not against a reconciler that re-sends days later. The `previews.followup_{1,2}_sent_at` columns stay the real guard (owned by E). Default key = `${template}:${order_id ?? preview_id}`. That means **callers must pass `order_id` or `preview_id` in `vars`** to get one. `support_reply` has no default key (there can be many per order), so the caller passes `idempotencyKey` (e.g. `support:<inbound message id>`).
- SPEC §11.6 says "store `unsubscribed` on previews/orders by email". CONTRACTS uses a dedicated `email_suppressions(email)` table instead, and that's what I implemented. Emails are stored lowercased and trimmed.
- SPEC: "every marketing email has an unsubscribe link". CONTRACTS and this build: **every** email has the link plus RFC 8058 `List-Unsubscribe` / `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers. Only marketing templates (`preview_followup_1/2`) check suppressions. Transactional mail (paid/delivered/refunds/quotes/support) always sends.
- One-click unsubscribe needs a POST endpoint, so `/api/unsubscribe` handles **GET (HTML page) and POST (JSON)** on the same signed URL. CONTRACTS lists only GET; POST is additive.
- `RESEND_API_KEY` in `.env.local` is send-only, so it cannot verify domains. Domain verification for `RESEND_FROM` (`verdict@juryhour.com`) has to be checked in the Resend dashboard. Sends from an unverified domain return a `validation_error` and `sendEmail` throws.
- Not configured → `{ id: null, skipped: "not_configured" }` plus a one-time `console.warn`. Invalid recipient, missing required template vars and DB errors during the suppression lookup **throw**: marketing never sends blind.
- React Email isn't installed. Templates are typed functions in `src/emails/templates.ts` that return `{ subject, html, text }`.

## Turnstile
- Endpoint and params match SPEC: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`, form-encoded `secret`, `response`, optional `remoteip`. Cloudflare also accepts JSON and an optional `idempotency_key`, which isn't used.
- Tokens are at most 2048 chars, valid for 300s, and **single-use**. A re-check of the same token fails with `timeout-or-duplicate`, so verify once per request and never on retries. Over-length or missing tokens are rejected locally without a network call.
- Cloudflare's examples use a 10s timeout. We use 5s as instructed (`AbortSignal.timeout`). Timeouts, network errors and non-200 responses all return `false` (fail closed).
- Optional extra param: `verifyTurnstile(token, ip, { action })` rejects when the widget `action` doesn't match. It's unused unless the front end sets `data-action`.
- Missing `TURNSTILE_SECRET`: `APP_MODE=sandbox` → true and `live` → false, with a one-time warning.

## Analytics
- `?src=` values are normalized to `[a-z0-9_-]{1,40}` after trim and lowercase. Anything else is dropped (null), so no PII or free text gets in.
- Vercel Web Analytics (`@vercel/analytics`) isn't installed. It's requested in `docs/INTEGRATION_NOTES.md`.

## Known risk
- Some corporate mail scanners prefetch GET links, which can unsubscribe someone unintentionally. CONTRACTS requires GET to insert, so I kept that. If it shows up in practice, switch GET to a confirm page whose button POSTs (the POST path already exists).
