// POST /api/terac-webhook — Terac submission events (CONTRACTS §4, docs/discrepancies/terac.md).
// Order: raw body → verify signature/timestamp → confirmation ping (2xx) → dedupe on X-Event-ID → act.
// Terac times deliveries out after 10s, so grading runs in after(); the reconciler is the safety net.
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { claimWebhook, logEvent, openIncident } from "@/lib/db";
import { onSubmissionAwaitingReview } from "@/lib/orders/handlers";
import { TeracWebhookError, verifyTeracWebhook, type TeracEvent } from "@/lib/terac";

function json(status: number, body: Record<string, unknown>, requestId: string) {
  return Response.json(body, { status, headers: { "x-request-id": requestId } });
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const rawBody = await req.text();

  let event: TeracEvent;
  try {
    event = verifyTeracWebhook(rawBody, req.headers);
  } catch (e) {
    if (e instanceof TeracWebhookError) {
      // 4xx is not retried by Terac — correct for forged/stale requests.
      console.warn(`[terac-webhook ${requestId}] rejected: ${e.reason}`);
      return json(e.reason === "bad_payload" ? 400 : 401, { ok: false, code: e.reason, error: e.message }, requestId);
    }
    // e.g. "TERAC_WEBHOOK_SECRET is not configured": 5xx so Terac retries once we are configured.
    console.error(`[terac-webhook ${requestId}]`, e);
    return json(503, { ok: false, code: "not_configured", error: e instanceof Error ? e.message : "error" }, requestId);
  }

  // Subscription confirmation handshake: answer 2xx, nothing to store.
  if (event.type === "webhook.ping") return json(200, { ok: true, ping: true }, requestId);

  let first: boolean;
  try {
    first = await claimWebhook("terac", event.id);
  } catch (e) {
    console.error(`[terac-webhook ${requestId}] claim failed`, e);
    return json(500, { ok: false, code: "internal", error: "claim failed" }, requestId); // Terac retries 5xx
  }
  if (!first) return json(200, { ok: true, replay: true }, requestId);

  const submissionId = typeof event.data.resource_id === "string" ? event.data.resource_id : null;
  const awaitingId = event.type === "submission.status.change" && event.data.to === "awaiting_review" ? submissionId : null;

  after(async () => {
    try {
      if (awaitingId) {
        await onSubmissionAwaitingReview(awaitingId);
      } else {
        await logEvent({
          actor: "code",
          action: "terac_webhook",
          reasoning: `${event.type}${event.data.to ? ` → ${String(event.data.to)}` : ""}`,
          payload: { event_id: event.id, ...event.data },
        });
      }
    } catch (e) {
      console.error(`[terac-webhook ${requestId}] handler failed`, e);
      try {
        await openIncident("terac_webhook_handler_failed", `${event.type} ${event.id} submission=${submissionId ?? "-"}: ${e instanceof Error ? e.message : String(e)}`);
      } catch (e2) {
        console.error(`[terac-webhook ${requestId}] openIncident failed`, e2);
      }
    }
  });

  return json(200, { ok: true }, requestId);
}
