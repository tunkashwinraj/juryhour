// Firing per-order agents (Claude Code scheduled tasks via @/lib/agents) and tracking agent_runs.
// There is no completion webhook (CONTRACTS §0.2): a run is "completed" when its expected Ops API
// handoff happens (submit_test, submit_report, launch_panel, refund, dispute_evidence, ...), and the
// reconciler times out runs older than AGENT_RUN_TIMEOUT_MINUTES.
import { fireAgent } from "@/lib/agents";
import { db, must } from "@/lib/db";
import type { AgentName } from "@/lib/types";
import { logEventSafe, nowIso } from "./repo";
import type { AgentRunRow } from "./types";

export async function fireAgentRun(
  orderId: string,
  agent: AgentName,
  attempt: number,
  reason: string,
): Promise<Pick<AgentRunRow, "session_id" | "session_url" | "attempt">> {
  const { sessionId, sessionUrl } = await fireAgent(agent, { order_id: orderId, attempt });
  const res = await db().from("agent_runs").insert({
    order_id: orderId,
    agent,
    session_id: sessionId,
    session_url: sessionUrl,
    status: "fired",
    attempt,
  });
  if (res.error) console.error("[agent_runs] insert failed", res.error.message);
  await logEventSafe({
    order_id: orderId,
    actor: "code",
    action: "agent_fired",
    reasoning: reason,
    payload: { agent, attempt, session_id: sessionId, session_url: sessionUrl },
  });
  return { session_id: sessionId, session_url: sessionUrl, attempt };
}

/** Marks this order's open runs of `agent` completed (its Ops handoff arrived). */
export async function completeRuns(orderId: string, agent: AgentName): Promise<void> {
  must(
    await db()
      .from("agent_runs")
      .update({ status: "completed", ended_at: nowIso() })
      .eq("order_id", orderId)
      .eq("agent", agent)
      .eq("status", "fired"),
    "agent_runs complete",
  );
}

export async function markRun(runId: string, status: "timed_out" | "failed"): Promise<void> {
  must(
    await db().from("agent_runs").update({ status, ended_at: nowIso() }).eq("id", runId).eq("status", "fired"),
    "agent_runs mark",
  );
}

/** Which agent's handoff a given Ops action/actor completes. */
export function agentForHandoff(action: string, actor: string): AgentName | null {
  if (action === "submit_test") return "researcher";
  if (action === "submit_report") return "analyst";
  if (action === "dispute_evidence") return "disputes";
  if (actor === "procurement" && ["launch_panel", "broaden_audience", "refund"].includes(action)) return "procurement";
  if (actor === "support" && ["refund", "send_email"].includes(action)) return "support";
  return null;
}
