// Fire a Claude Code cloud scheduled task ("routine") through its API trigger (CONTRACTS §0.2).
// Docs: https://platform.claude.com/docs/en/api/claude-code/routines-fire
// The fire `text` reaches the agent wrapped in a <routine-fire-payload> block as untrusted data,
// so we send only {order_id, attempt}; the agent fetches everything else from the Ops API.
// There is no idempotency key: every successful POST creates a new session, so this function
// never retries. Retries belong to the reconciler (it bumps `attempt`).
// Server-only (holds routine tokens): never import from a client component.
import { z } from "zod";
import { need } from "./env";
import type { AgentName } from "./types";

const FIRE_TIMEOUT_MS = 15_000;
const BETA_HEADER = "experimental-cc-routine-2026-04-01";
const ANTHROPIC_VERSION = "2023-06-01";

const ENV_KEYS = {
  researcher: { url: "AGENT_RESEARCHER_FIRE_URL", token: "AGENT_RESEARCHER_FIRE_TOKEN" },
  analyst: { url: "AGENT_ANALYST_FIRE_URL", token: "AGENT_ANALYST_FIRE_TOKEN" },
  procurement: { url: "AGENT_PROCUREMENT_FIRE_URL", token: "AGENT_PROCUREMENT_FIRE_TOKEN" },
  disputes: { url: "AGENT_DISPUTES_FIRE_URL", token: "AGENT_DISPUTES_FIRE_TOKEN" },
  support: { url: "AGENT_SUPPORT_FIRE_URL", token: "AGENT_SUPPORT_FIRE_TOKEN" },
} as const satisfies Record<AgentName, { url: string; token: string }>;

const FirePayload = z.object({
  order_id: z.string().uuid(),
  attempt: z.number().int().min(1).max(10),
});

const FireResponse = z.object({
  type: z.literal("routine_fire"),
  claude_code_session_id: z.string().min(1),
  claude_code_session_url: z.string().min(1),
});

/** 429 from /fire: the per-task (30/h) or per-account (100/h) cap is reached. Not retryable now. */
export class AgentRateLimitError extends Error {
  readonly agent: AgentName;
  /** Seconds until the window resets, from the Retry-After header (null if absent). */
  readonly retryAfterSeconds: number | null;
  constructor(agent: AgentName, retryAfterSeconds: number | null) {
    super(`Agent ${agent} fire rate-limited (hourly cap)${retryAfterSeconds !== null ? `; retry after ${retryAfterSeconds}s` : ""}`);
    this.name = "AgentRateLimitError";
    this.agent = agent;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Any other /fire failure (bad token, paused routine, 5xx, network, bad response). */
export class AgentFireError extends Error {
  readonly agent: AgentName;
  readonly status: number | null;
  constructor(agent: AgentName, message: string, status: number | null = null) {
    super(message);
    this.name = "AgentFireError";
    this.agent = agent;
    this.status = status;
  }
}

function parseRetryAfter(h: string | null): number | null {
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, Math.round(secs));
  const at = Date.parse(h);
  return Number.isNaN(at) ? null : Math.max(0, Math.round((at - Date.now()) / 1000));
}

/** Short, key-free description of an error body (the Anthropic error envelope). */
async function errorSummary(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { type?: string; message?: string } };
    return [body.error?.type, body.error?.message].filter(Boolean).join(": ").slice(0, 300) || res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function fireAgent(
  agent: AgentName,
  payload: { order_id: string; attempt: number },
): Promise<{ sessionId: string; sessionUrl: string }> {
  const keys = ENV_KEYS[agent];
  if (!keys) throw new Error(`Unknown agent: ${String(agent)}`);
  const url = need(keys.url);
  const token = need(keys.token);
  const body = FirePayload.parse(payload);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": BETA_HEADER,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: JSON.stringify({ order_id: body.order_id, attempt: body.attempt }) }),
      signal: AbortSignal.timeout(FIRE_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.name === "TimeoutError" ? "timed out" : err.message : String(err);
    throw new AgentFireError(agent, `Agent ${agent} fire failed: ${msg}`);
  }

  if (res.status === 429) throw new AgentRateLimitError(agent, parseRetryAfter(res.headers.get("retry-after")));
  if (!res.ok) {
    throw new AgentFireError(agent, `Agent ${agent} fire failed: ${res.status} ${await errorSummary(res)}`, res.status);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new AgentFireError(agent, `Agent ${agent} fire returned non-JSON`, res.status);
  }
  const parsed = FireResponse.safeParse(json);
  if (!parsed.success) throw new AgentFireError(agent, `Agent ${agent} fire returned an unexpected body`, res.status);
  return { sessionId: parsed.data.claude_code_session_id, sessionUrl: parsed.data.claude_code_session_url };
}
