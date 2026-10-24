# JuryHour Contracts (frozen at end of Phase 0)

Read with `SPEC.md` and `CLAUDE.md`. **Where this file and SPEC.md disagree, this file wins** (it records lead decisions made after the spec was written). Only the lead changes this file, `src/lib/types.ts`, `src/lib/constants.ts`, `src/lib/env.ts`, `src/lib/db.ts`, `src/lib/exa.ts` and `supabase/migrations/0001*`/`0002*`. Need a change? Write it in `docs/INTEGRATION_NOTES.md`.

## 0. Lead decisions that override SPEC.md

1. **OpenAI replaces the Claude Messages API** for quick calls (preview + safety, juror grading). Library: `openai` (installed). Models in `LLM_MODELS` (constants). Use Structured Outputs (JSON schema) — check the OpenAI docs for the current Responses/Chat API shape in the installed SDK version.
2. **No Anthropic Managed Agents / no Anthropic API key.** Agents are **Claude Code cloud scheduled tasks** ("routines", https://code.claude.com/docs/en/routines) on the owner's Max plan:
   - Per-order agents (researcher, analyst, procurement, disputes, support) have an **API trigger**. Backend fires: `POST <AGENT_X_FIRE_URL>` with headers `Authorization: Bearer <AGENT_X_FIRE_TOKEN>`, `anthropic-beta: experimental-cc-routine-2026-04-01`, `anthropic-version: 2023-06-01`, `Content-Type: application/json`, body `{"text": "<json string>"}`. Response `{type:"routine_fire", claude_code_session_id, claude_code_session_url}`. Limits: 30 fires/hour/task, 100/hour/account.
   - Fire `text` arrives to the agent as untrusted data. Send only `{"order_id": "...", "attempt": n}`; the agent fetches everything else from the Ops API.
   - **No completion webhook.** `/api/anthropic-webhook` is dropped. Agents hand results back through the Ops API; the reconciler detects timeouts by stage age. No per-run $ budget → agent `ai_cost` is $0 (subscription); OpenAI calls do record `ai_cost`.
   - CEO / Growth / CFO are schedule-triggered tasks (hourly min). They only call the Ops API.
   - Agents never call Exa directly: they use `/api/ops/exa_search` and `/api/ops/exa_contents` (cost booked to ledger). Their only secret is the Ops bearer key.
3. **Order status page uses polling** (`GET /api/order/[token]` every 4s) instead of Supabase Realtime: RLS blocks anon from `orders`, and the RPC is the only anon entry point.
4. **Whop has two businesses**: live (`WHOP_API_KEY`, `WHOP_COMPANY_ID`, `api.whop.com`) and sandbox (`WHOP_SANDBOX_API_KEY`, `WHOP_SANDBOX_COMPANY_ID`, `sandbox-api.whop.com`). Choose by the order's `mode` (new orders take `APP_MODE`). Separate webhook secrets: `WHOP_WEBHOOK_SECRET` / `WHOP_SANDBOX_WEBHOOK_SECRET`.
5. Package manager is **npm** (not pnpm): `npm run typecheck`, `npm test`.
6. Next.js is **16.4** with `cacheComponents: true`. Middleware is now `src/proxy.ts`. Route params are Promises (`const { token } = await ctx.params`). Read `node_modules/next/dist/docs/01-app/01-getting-started/{08-caching,15-route-handlers,16-proxy}.md` before writing pages/routes. Pages that read the DB per request must follow the Cache Components rules (dynamic data inside `<Suspense>` / `await connection()`).
7. Domain `juryhour.com` is not wired yet. Always build absolute URLs from `env().NEXT_PUBLIC_APP_URL`; never hardcode the host.
8. Missing keys (Terac, Turnstile, Whop webhook secrets, routine tokens) are expected right now. Every integration must: (a) work with mocks in tests, (b) fail with a clear `"<NAME> is not configured"` error at runtime via `need()`, (c) where noted, offer a dry-run path via `has()`.

## 1. Shared modules (lead-owned, import them, don't edit)

| Module | Exports |
|---|---|
| `@/lib/constants` | `TIERS`, `ADDONS`, `SPECIALIST_PRICE`, `MARGIN_FLOOR`, `PRICE_BAND`, limits, `STAGE_TIMEOUT_MINUTES`, `LLM_MODELS`, juror rules, `REPORT_CAVEAT`, `TERAC_CALLBACK_URL` |
| `@/lib/types` | Zod schemas + types: `Mode`, `Stage`, `Tier`, `Addon`, `Actor`, `AgentName`, `Card`, `JurorProfile`, `Questions`, `PublicTest`, `Answers`, `CardAnswers`, `JurorSubmission`, `QUOTABLE_FIELDS`, `PreviewResult`, `GraderResult`, `OrderStats`, `Quote`, `Report`, `OpsResult` |
| `@/lib/env` | `env()`, `need(name)`, `has(name)`, `resetEnvCache()` |
| `@/lib/db` | `db()` (service-role client), `must(res, what)`, `logEvent({...})`, `openIncident(kind, detail, orderId?)`, `claimWebhook(provider, eventId)` |
| `@/lib/exa` | `getPageText(url)`, `searchMarket(query)` (both return `costDollars`), `ExaError` |

## 2. Database (applied to Supabase)

`supabase/migrations/0001_init.sql`, `0002_company_interventions.sql`. Schema notes vs SPEC §6:
- `orders`: `price_usd` nullable (unpriced specialist quote); added `quote_expires_at`, `support_refund_used`, `retest_available`, `report jsonb`, `report_public`.
- `tests.order_id` unique (one test per order). `panels`: `audience_broadened`; partial unique index = one live panel per order.
- `responses`: added `understood_a`, `understood_b`, `grader_flags`, `decided_at`.
- `agent_runs`: `session_id` (claude_code_session_id), `session_url`, `status in (fired, completed, failed, timed_out)`, `attempt`.
- `ledger`: unique `(kind, ref)` when `ref` is set — use the provider's id as `ref` so replays can't double-book.
- New `email_suppressions(email)`; `company_state.human_interventions`.
- Views: `approved_responses` (adds `juror_number` 1..N by submission time → label `"Juror N"`), `order_stats` (all report numbers, rounded to 2 dp).
- RPC `get_order_by_token(p_token)` — the only thing anon can call.
- Migrations run with `npm run db:migrate` (lead only). Workstream E writes `0003_cron.sql` but the lead applies it.

## 3. Module interfaces between workstreams

B, C, D, F expose functions; E composes them; A renders. Signatures below are the contract — implement exactly (extra optional params are fine).

### B — `src/lib/whop.ts`, `src/lib/pricing.ts`
```ts
type WhopMode = Mode;
createCheckout(i: { orderId: string; amountUsd: number; title: string; mode: Mode; redirectUrl: string }): Promise<{ checkoutId: string; purchaseUrl: string }>
refundPayment(i: { paymentId: string; amountUsd?: number /* omit = full */; mode: Mode }): Promise<{ refundId: string | null; status: string }>
verifyWhopWebhook(rawBody: string, headers: Headers, mode: Mode): WhopEvent   // throws on bad/stale signature
listRecentPayments(i: { sinceMinutes: number; mode: Mode }): Promise<{ paymentId: string; orderId: string | null; amountUsd: number; status: string; createdAt: string }[]>
submitDisputeEvidence(i: { disputeId: string; mode: Mode; evidence: DisputeEvidence }): Promise<void>
setAdCampaignBudget(i: { campaignId: string; dailyUsd: number; mode: Mode }): Promise<void>  // may throw "ads not available"
computePrice(i: { tier: TierName; addons: AddonName[]; parentOrder?: { tier: TierName; price_usd: number; paid_at: string | null } | null; prices: Record<string, number> }): { priceUsd: number; creditUsd: number; jurors: number; jurorCostCap: number }
```
`WhopEvent` = `{ id: string; type: string; data: any }` normalized; B documents the payload fields it relies on.

### C — `src/lib/terac.ts`, `src/lib/juror.ts`
```ts
getTeracContext(): Promise<{ balanceDollars: number }>
requestQuote(i: { taskDescription: string; panelDescription: string; submissionCount: number; timelineHours: number }): Promise<{ id: string; status: string }>
getQuote(id: string): Promise<{ id: string; status: string; costPerParticipant: number | null }>
createOpportunity(i: { title: string; numParticipants: number; businessType: "b2c"|"b2b"; description: string; feasibilityRequestId: string; durationMinutes: number; testId: string; screeningQuestions: JurorProfile["screening_questions"]; filters: JurorProfile["filters"] }): Promise<{ id: string; totalCostCents: number; affordable: boolean }>
launchOpportunity(id: string): Promise<void>                // throws TeracPreconditionError on 412
getOpportunity(id: string): Promise<{ id: string; status: string; submissionStats: Record<string, number> }>
listSubmissions(opportunityId: string, status?: string): Promise<{ id: string; status: string }[]>
approveSubmission(id: string): Promise<void>
rejectSubmission(id: string, category: "low_quality"|"failed_instructions"|"incomplete"|"suspicious_patterns"|"other", reason: string): Promise<void>
stopOpportunity(id: string, reason: string): Promise<void>
verifyTeracWebhook(rawBody: string, headers: Headers): TeracEvent   // HMAC check, rejects > 5 min old
jurorTaskUrl(testId: string): string     // `${APP_URL}/t/${testId}?sid={TERAC_SUBMISSION_ID}`
// juror.ts
getPublicTest(testId: string): Promise<PublicTest | null>   // strips attention `correct`; live = panel status 'live'
```
Terac client never polls in loops; one request per call.

### D — `src/lib/llm.ts`, `src/lib/agents.ts`
```ts
previewAndSafety(i: { pageText: string; buyerDesc: string }): Promise<PreviewResult & { costUsd: number }>
gradeJurorResponse(i: { answers: Answers; cardA: Card; cardB: Card | null; attentionPassed: boolean; secondsSpent: number }): Promise<GraderResult & { approve: boolean; costUsd: number }>
   // code rules first (seconds ≥ 60, attention passed, what_it_does ≥ 15 words) → model refines; approve = pass && score ≥ 5
fireAgent(agent: AgentName, payload: { order_id: string; attempt: number }): Promise<{ sessionId: string; sessionUrl: string }>
   // throws "<AGENT>_FIRE_URL is not configured" when missing
```

### E — `src/lib/orders/*`, `src/lib/guardrails.ts`, `src/lib/stats.ts`
Webhook routes (owned by B and C) call these handlers — E implements them:
```ts
// src/lib/orders/handlers.ts
onPaymentSucceeded(i: { orderId: string; paymentId: string; amountUsd: number; receiptUrl: string | null; mode: Mode }): Promise<void>
onRefundCreated(i: { paymentId: string; refundId: string; amountUsd: number; mode: Mode }): Promise<void>
onDisputeCreated(i: { disputeId: string; paymentId: string; mode: Mode }): Promise<void>
onSubmissionAwaitingReview(teracSubmissionId: string): Promise<void>
// src/lib/orders/transition.ts — the ONLY code that writes orders.stage
transition(orderId: string, to: Stage, reason: string, patch?: Partial<OrderRow>): Promise<void>
```

### F — `src/lib/email.ts`, `src/lib/turnstile.ts`, `src/lib/analytics.ts`
```ts
type EmailTemplate = "paid"|"delivered"|"partial"|"refunded"|"preview_followup_1"|"preview_followup_2"|"quote_ready"|"support_reply";
sendEmail(i: { template: EmailTemplate; to: string; vars: Record<string, string | number | null> }): Promise<{ id: string | null; skipped?: "unsubscribed" | "not_configured" }>
   // marketing templates (preview_followup_*) check email_suppressions; every email has an unsubscribe link
verifyTurnstile(token: string | null, ip: string | null): Promise<boolean>   // true when TURNSTILE_SECRET unset AND APP_MODE=sandbox (dev), false otherwise
SRC_COOKIE = "jh_src"; readSrc(cookies): string | null; normalizeSrc(raw): string | null
```

## 4. HTTP routes

All JSON in/out, Zod-validated, errors as `{ ok:false, code, error }` with 4xx/5xx. Log a request id. Webhooks read the **raw body** (`await req.text()`) before parsing.

| Route | Owner | Contract |
|---|---|---|
| `POST /api/preview` | D | in `{ url?, pitch_text?, buyer_desc, email, turnstile_token, src? }` (url XOR pitch_text) → `{ ok:true, preview_id, result: PreviewResult }` or `{ ok:true, preview_id, refused:true, reason }`. Rate limits from constants (count `previews` rows). Exa cost + OpenAI cost → ledger (mode=APP_MODE, order_id null). |
| `POST /api/checkout` | B | in `{ tier, addons[], email, buyer_desc, url?, pitch_text?, preview_id?, parent_order_id?, src? }` → `{ ok:true, purchase_url, token }`. Refuses when `company_state.sales_paused`. Creates order CREATED (token = 32 random bytes base64url). |
| `POST /api/quote` | B | specialist quote request → order tier `specialist`, CREATED, price null, `quote_expires_at` +48h → `{ ok:true, token }`. |
| `POST /api/whop-webhook` | B | live + sandbox (`?mode=sandbox` query on the sandbox registration). Verify → `claimWebhook('whop:'+mode, id)` → call E handlers. 200 on replay. |
| `POST /api/terac-webhook` | C | verify → claim → on `submission.status.change` to `awaiting_review` call `onSubmissionAwaitingReview`. Must also answer the subscription confirmation ping with 2xx. |
| `POST /api/juror/submit` | C | in `JurorSubmission` → validates sid/test live/not duplicate, computes `attention_passed`, `seconds_spent` → inserts `responses` (decision null) → `{ ok:true, redirect }` (Terac callback URL; `result=rejected` if attention failed or seconds < 60). Duplicate sid → `{ ok:true, duplicate:true, redirect: completed }`. |
| `GET  /api/juror/test/[testId]` | C | → `PublicTest` (optional; page may load server-side instead). |
| `POST /api/reconcile` | E | bearer `INTERNAL_CRON_SECRET`; < 10s; ≤ 25 orders oldest first. |
| `POST /api/ops/[action]` | E | bearer `OPS_API_KEY`; actions in §5. |
| `GET  /api/order/[token]` | A | safe projection via RPC + report presence. |
| `POST /api/report/[token]/share` | A | `{ public: boolean }` → sets `orders.report_public` (token = auth). |
| `GET  /api/og/verdict/[token]` | A | `next/og` `ImageResponse` 1200×630; only if `report_public` or `?t=<token>` matches. |
| `POST /api/ops-ui/pause` / `resume` | A | basic-auth (proxy); pause increments `company_state.human_interventions` (be honest). |
| `GET  /api/unsubscribe?e=&s=` | F | HMAC-signed link (key: `OPS_API_KEY`) → inserts `email_suppressions` → plain confirmation page/JSON. |
| `src/proxy.ts` | A | HTTP basic auth for `/ops` and `/api/ops-ui/*` using `OPS_BASIC_AUTH_USER/PASSWORD`. |

## 5. Ops API (`POST /api/ops/<action>`, owner E)

Bearer `OPS_API_KEY`. Every call writes an `events` row (actor from body `actor` field, validated against `Actor`). Body JSON; response `OpsResult`. All checks from SPEC §12, plus:

| Action | Input | Notes |
|---|---|---|
| `get_order` | `{order_id}` | order (safe fields incl. page_text from preview if any), test (with attention `correct` — agents may see it), latest panel, `order_stats` row, approved responses `{response_id, juror_label, first_card, answers}` |
| `exa_search` | `{order_id, query}` | wraps `searchMarket`; ledger `exa_cost` |
| `exa_contents` | `{order_id, url}` | wraps `getPageText`; ledger `exa_cost` |
| `submit_test` | `{order_id, card_a, card_b?, juror_profile, questions, research_notes, rewrite_strategy}` | SPEC §12 checks; → QUOTING; then code immediately requests the Terac quote |
| `request_quote`, `launch_panel`, `broaden_audience`, `decide_submission`, `submit_report`, `refund`, `pause_sales`, `resume_sales`, `change_price`, `set_ads_budget`, `send_email`, `log_decision`, `metrics`, `dispute_evidence` | as SPEC §12 | `submit_report` validates `Report` + provenance: each quote's `text` must be a verbatim substring of that response's `QUOTABLE_FIELDS`, `juror_label` must match `approved_responses.juror_number`, scorecard must equal `order_stats` exactly, caveat must contain `REPORT_CAVEAT`. |

## 6. Ownership (Phase 1)

A Frontend: `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/o/**`, `src/app/r/**`, `src/app/ops/**`, `src/components/**`, `src/app/api/og/**`, `src/app/api/order/**`, `src/app/api/report/**`, `src/app/api/ops-ui/**`, `src/proxy.ts`, `src/lib/queries.ts`, `tests/frontend/**`
B Payments: `src/lib/whop.ts`, `src/lib/pricing.ts`, `src/app/api/checkout/**`, `src/app/api/quote/**`, `src/app/api/whop-webhook/**`, `scripts/register-whop-webhooks.ts`, `tests/payments/**`
C Terac + juror: `src/lib/terac.ts`, `src/lib/juror.ts`, `src/app/t/**`, `src/app/api/terac-webhook/**`, `src/app/api/juror/**`, `scripts/register-terac-webhooks.ts`, `tests/terac/**`, `tests/e2e/juror.spec.ts`, `playwright.config.ts`
D AI layer: `src/lib/llm.ts`, `src/lib/agents.ts`, `src/app/api/preview/**`, `agents/*.md`, `docs/AGENT_SETUP.md`, `tests/ai/**`
E Orchestration: `src/lib/orders/**`, `src/lib/guardrails.ts`, `src/lib/stats.ts`, `src/lib/ops/**`, `src/app/api/ops/**`, `src/app/api/reconcile/**`, `supabase/migrations/0003_cron.sql`, `scripts/chaos.ts`, `tests/orchestration/**`
F Email etc.: `src/lib/email.ts`, `src/emails/**`, `src/lib/turnstile.ts`, `src/lib/analytics.ts`, `src/app/api/unsubscribe/**`, `tests/email/**`
Lead: everything else (`package.json`, configs, shared modules, migrations 0001/0002, `docs/CONTRACTS.md`).

Dependencies are already installed (`zod`, `@supabase/supabase-js`, `openai`, `resend`, `standardwebhooks`, `vitest`, `@playwright/test`, `tsx`, `pg`). **Do not run `npm install`.** If you truly need a package, request it in `docs/INTEGRATION_NOTES.md`.
