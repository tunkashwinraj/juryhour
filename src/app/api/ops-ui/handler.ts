// Shared handler for POST /api/ops-ui/pause and /api/ops-ui/resume (the human kill switch).
import { logEvent } from "@/lib/db";
import { setSalesPaused } from "@/lib/queries";
import { checkBasicAuth } from "@/proxy";
import { jsonError, jsonOk, log, rid } from "@/components/api";

export const OPS_UI_HEADER = "x-ops-ui";

export async function handleKillSwitch(req: Request, paused: boolean): Promise<Response> {
  const id = rid();
  // Defense in depth: the proxy already enforces basic auth, check again here.
  if (checkBasicAuth(req.headers.get("authorization")) !== "ok") {
    return jsonError(401, "unauthorized", "Basic auth required", id);
  }
  // CSRF guard: a custom header forces a CORS preflight, so other sites can't trigger this
  // with the browser's cached basic-auth credentials.
  if (req.headers.get(OPS_UI_HEADER) !== "1") {
    return jsonError(400, "missing_header", `Missing ${OPS_UI_HEADER} header`, id);
  }
  try {
    const result = await setSalesPaused(paused);
    await logEvent({
      actor: "code",
      action: paused ? "human_kill_switch" : "human_resume",
      reasoning: paused
        ? "A human pressed 'Pause all sales' on /ops. Counted as a human intervention."
        : "A human pressed 'Resume sales' on /ops. Counted as a human intervention.",
      payload: { sales_paused: paused, human_interventions_company: result.humanInterventions },
    });
    log(id, "api/ops-ui", paused ? "sales paused by human" : "sales resumed by human");
    return jsonOk(result, id);
  } catch (e) {
    log(id, "api/ops-ui", "kill switch failed", (e as Error).message);
    return jsonError(500, "internal", (e as Error).message, id);
  }
}
