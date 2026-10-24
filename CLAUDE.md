@AGENTS.md

# JuryHour

The full product and build specification is in `SPEC.md` (repo root). Read it before starting any work; it is the source of truth for scope, tech stack, data model, API contracts, guardrails and build phases. Where `SPEC.md` disagrees with a live API doc, the live doc wins — record the difference in `docs/API_DISCREPANCIES.md` and update `SPEC.md`.

## Decisions that override SPEC.md
- **Quick LLM calls use OpenAI, not the Anthropic Messages API** (user decision, 2026-10-24): preview + safety screen and juror grading go through `OPENAI_API_KEY`. Pick models from the key's live `/v1/models` list.
- **No Anthropic API key / no Managed Agents.** Agents run as **Claude Code cloud scheduled tasks** (formerly "routines") on the user's Claude Max plan (docs: https://code.claude.com/docs/en/routines). They run in Anthropic's cloud, no laptop needed.
  - Per-order agents (Researcher, Analyst, Procurement/Disputes/Support): tasks with an **API trigger**; the backend POSTs `{"text": "<order_id>"}` to each task's `/fire` URL with its bearer token (header `anthropic-beta: experimental-cc-routine-2026-04-01`). Fire text arrives as untrusted data, so pass only an ID and have the agent fetch everything via the Ops API.
  - CEO / Growth / CFO: **schedule triggers** (hourly minimum; use off-the-hour minutes like :07).
  - Limits: 30 fires/hour per task, 100 API fires/hour per account; runs use subscription usage (if the Max limit is hit, runs are rejected — reconciler must time out and refund).
  - No completion webhook: agents hand off via the Ops API; the reconciler handles timeouts. No per-run $ budget, so `ai_cost` for agents is $0 marginal.
  - Tasks need a GitHub repo (cloned each run; agent prompts live in `agents/*.md`), a cloud environment with Custom network access (`juryhour.com`, `api.exa.ai`) and network secrets for the Ops key and Exa key. API tokens can only be generated on the web at claude.ai/code/routines (user one-time step).
- **Whop sandbox is a separate business** ("Jury test", `WHOP_SANDBOX_COMPANY_ID`) from the live one ("JuryHour", `WHOP_COMPANY_ID`). Pick the key + company ID pair by `APP_MODE`; sandbox calls go to `sandbox-api.whop.com`.
