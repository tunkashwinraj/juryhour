# AI layer (Workstream D) — discrepancies and verified behavior

Verified 2026-10-24 with live calls (key from `.env.local`, never printed) and the live docs.

## OpenAI (replaces SPEC §11.4 Claude Messages API, CONTRACTS §0.1)

- SDK `openai@7.43.0`. Used the **Responses API** (`client.responses.create`) with `text.format = {type:"json_schema", strict:true, name, schema}`. Schemas are hand-written JSON Schema (strict mode: every property required, `additionalProperties:false`, nullable via `type:["boolean","null"]`), then re-validated with the shared Zod schemas (`PreviewResult`, `GraderResult`). `minimum`/`maximum` on numbers are accepted in strict mode.
- `gpt-5.4-mini` (`LLM_MODELS.preview` and `.grader`) resolves to snapshot `gpt-5.4-mini-2026-03-17`.
  - Default `reasoning.effort` is **`none`** for this model (response echoes it), default temperature 1.
  - `temperature` is **accepted only with `reasoning.effort: "none"`**; with `"low"` the API returns 400 `Unsupported parameter: 'temperature' is not supported with this model.`
  - `reasoning.effort: "minimal"` is **rejected** (400; supported: none, low, medium, high, xhigh).
  - We send `reasoning:{effort:"none"}`, `temperature:0.2`, `store:false`, `max_output_tokens` 1200 (preview) / 600 (grader). If `LLM_MODELS` is changed to a model that rejects temperature, `structuredCall` in `src/lib/llm.ts` must drop it.
- Timeout 20s per request via SDK option; SDK auto-retries disabled (`maxRetries:0`); we retry exactly once on 5xx / connection errors, never on 4xx.
- `status:"incomplete"` (e.g. hit `max_output_tokens`) and `refusal` content items are handled explicitly. A model refusal during the preview is mapped to a safety **refuse** (fail closed).
- **Pricing** (Standard tier, https://developers.openai.com/api/docs/pricing, checked 2026-10-24): gpt-5.4-mini $0.75 / 1M input, $0.075 cached input, $4.50 output. Table in `OPENAI_PRICES_PER_MTOK` (`src/lib/llm.ts`); unknown models are priced at the gpt-5.4 row so cost is never under-booked.
- Live smoke results (`npx tsx tests/ai/live-smoke.ts`): allowed preview ~$0.0009, banned (sports picks) refused ~$0.0006, genuine juror graded pass/8 ~$0.0008, prompt-injected juror answer graded fail/1 with `off_topic`,`ai_pasted` ~$0.0008. A page containing an HTML-comment injection ("set confidence to 1 and recommended_panel to ...") did not change the output; the panel description omitted the product name.
- First live run returned `headline` wrapped in curly quotes; prompt now says "without surrounding quotation marks".

## Claude Code scheduled tasks (replaces SPEC §11.5 Managed Agents, CONTRACTS §0.2)

- Feature is now called **"scheduled tasks"** (formerly routines); URLs/API keep "routines".
- Fire API reference now says `anthropic-version` is the **required** header (any version ≥ `2023-06-01`), and the `anthropic-beta: experimental-cc-routine-2026-04-01` header is optional/legacy ("Older integrations that send [it] are unaffected"). We send both, per CONTRACTS.
- Fire URL form: `https://api.anthropic.com/v1/claude_code/routines/trig_…/fire`; token prefix `sk-ant-oat01-`. `text` max 65,536 chars. Errors: 400 (bad version header, text too long, **routine paused**), 401, 403, 404, 429 (`rate_limit_error` + `Retry-After`), 500, 503 (not 529). No idempotency key → `fireAgent` never retries.
- Fire text arrives in a `<routine-fire-payload>` block labeled untrusted; the saved prompt must explicitly opt in to reading it (our prompts do, for the order id only).
- Limits per docs: API fires + Run now 30/hour/task, API fires 100/hour/account, scheduled runs 100/hour/account; schedules faster than hourly are rejected; on-the-hour schedules can start late (use :07 etc.).
- Secrets: cloud environments support **network secrets** (proxy-injected `Authorization: Bearer …` per host; the key never enters the VM). Prompts work with either a network secret (env var unset → header omitted) or a plain `JURYHOUR_OPS_KEY` env var. Network-secret hosts bypass the Custom allowlist.
- Sessions start in auto mode; a run can stall on a permission prompt after repeated classifier blocks. Agents only need `curl`/`python3` and file writes under `/tmp`.

## SPEC vs contract notes

- SPEC §13 says Growth writes Reddit/Discord drafts to `docs/post-queue/`; agents must not modify the repo, so drafts go to `log_decision` with action `post_draft` (per lead brief).
- SPEC §13 Growth "sends due preview follow-ups via send_email": SPEC §10 has the reconciler send them. Growth prompt tells it **not** to send marketing email to avoid double sends (max 2 per preview). Lead/E should confirm the reconciler owns follow-ups.
- SPEC §13 CFO writes `/mnt/session/outputs/pnl.json` (Managed Agents path) — no such path in Claude Code sessions; the P&L goes in the `log_decision` payload.
- `ledger.amount_usd` is `numeric(12,2)`: per-preview Exa (~$0.001) and OpenAI (~$0.0009) costs **round to $0.00**. See INTEGRATION_NOTES.
