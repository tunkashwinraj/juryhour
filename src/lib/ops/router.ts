// POST /api/ops/<action> dispatcher: bearer auth (constant-time) → known action → JSON → actor →
// Zod → handler. Every authenticated call writes one events row (outcome ok / refused / error).
// Refusals are { ok:false, code, error } with a 4xx status; agents must handle them.
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { isRefusal } from "@/lib/guardrails";
import { agentForHandoff, completeRuns } from "@/lib/orders/agentRuns";
import { errMessage, incidentOnce, isNotConfigured, logEventSafe } from "@/lib/orders/repo";
import { InvalidTransitionError, StageConflictError } from "@/lib/orders/transition";
import { HANDLERS, type OpsContext } from "./actions";
import { bearerMatches } from "./auth";
import { ACTION_SCHEMAS, OpsActor, type OpsAction } from "./schemas";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown, requestId: string): Response {
  return Response.json(body, { status, headers: { "x-request-id": requestId, "cache-control": "no-store" } });
}

/** Keeps event payloads small: long strings truncated, big arrays/objects summarized. */
export function summarize(v: unknown, depth = 0): unknown {
  if (typeof v === "string") return v.length > 500 ? `${v.slice(0, 500)}…(${v.length} chars)` : v;
  if (v === null || typeof v !== "object") return v;
  if (depth >= 4) return Array.isArray(v) ? `[${v.length} items]` : "{…}";
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => summarize(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v).slice(0, 40)) out[k] = summarize(x, depth + 1);
  return out;
}

function errorStatus(e: unknown): { status: number; code: string; message: string } {
  if (isRefusal(e)) return { status: e.status, code: e.code, message: e.message };
  if (e instanceof StageConflictError) return { status: 409, code: "stage_conflict", message: e.message };
  if (e instanceof InvalidTransitionError) return { status: 409, code: "wrong_stage", message: e.message };
  const message = errMessage(e);
  if (isNotConfigured(e)) return { status: 503, code: "not_configured", message };
  const name = e instanceof Error ? e.name : "";
  if (/^(Terac|Whop|Exa|Agent|Llm)/.test(name)) return { status: 502, code: "upstream_error", message };
  return { status: 500, code: "internal_error", message };
}

export async function handleOpsRequest(req: Request, action: string): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  if (!bearerMatches(req.headers.get("authorization"), env().OPS_API_KEY)) {
    return json(401, { ok: false, code: "unauthorized", error: "missing or invalid bearer token" }, requestId);
  }
  if (!Object.prototype.hasOwnProperty.call(ACTION_SCHEMAS, action)) {
    return json(404, { ok: false, code: "unknown_action", error: `unknown action '${action}'` }, requestId);
  }
  const name = action as OpsAction;

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    const parsed: unknown = text.trim() ? JSON.parse(text) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, code: "invalid_json", error: "body must be a JSON object" }, requestId);
  }

  const actorParse = OpsActor.safeParse(body.actor);
  if (!actorParse.success) {
    return json(400, { ok: false, code: "invalid_actor", error: `actor must be one of ${OpsActor.options.join(", ")}` }, requestId);
  }
  const actor = actorParse.data;
  const reasoning = typeof body.reasoning === "string" ? body.reasoning.slice(0, 8000) : null;
  const orderIdHint = typeof body.order_id === "string" && UUID_RE.test(body.order_id) ? body.order_id : null;
  const { actor: _a, ...inputForLog } = body;
  void _a;

  const parsed = ACTION_SCHEMAS[name].safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message }));
    await logEventSafe({
      order_id: orderIdHint,
      actor,
      action: name,
      reasoning,
      payload: { request_id: requestId, outcome: "refused", code: "invalid_input", issues, input: summarize(inputForLog) },
    });
    return json(400, { ok: false, code: "invalid_input", error: issues.map((i) => `${i.path || "(body)"}: ${i.message}`).join("; "), issues }, requestId);
  }

  const ctx: OpsContext = { actor, reasoning, now: new Date() };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (HANDLERS[name] as any)(parsed.data, ctx);
    const orderId = out.orderId ?? orderIdHint;
    if (name === "log_decision") {
      const d = parsed.data as { action: string; reasoning: string; payload?: unknown };
      await logEventSafe({ order_id: orderId, actor, action: d.action, reasoning: d.reasoning, payload: d.payload ?? null });
    } else {
      await logEventSafe({ order_id: orderId, actor, action: name, reasoning, payload: { request_id: requestId, outcome: "ok", input: summarize(inputForLog) } });
    }
    const agent = agentForHandoff(name, actor);
    if (agent && orderId) await completeRuns(orderId, agent).catch(() => undefined);
    return json(200, { ok: true, data: out.data }, requestId);
  } catch (e) {
    const { status, code, message } = errorStatus(e);
    const details = isRefusal(e) ? e.details : undefined;
    await logEventSafe({
      order_id: orderIdHint,
      actor,
      action: name,
      reasoning,
      payload: { request_id: requestId, outcome: status >= 500 ? "error" : "refused", code, error: message.slice(0, 1000), input: summarize(inputForLog) },
    });
    if (status >= 500 && code !== "not_configured") await incidentOnce("ops_error", `${name}: ${message}`.slice(0, 500), orderIdHint);
    if (code === "not_configured") await incidentOnce("not_configured", message, null);
    console.error(`[ops ${requestId}] ${name} → ${status} ${code}: ${message}`);
    return json(status, { ok: false, code, error: message, ...(details !== undefined ? { details } : {}) }, requestId);
  }
}
