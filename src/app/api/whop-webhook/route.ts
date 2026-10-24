// POST /api/whop-webhook — Whop events for live (default) and sandbox (`?mode=sandbox`).
// raw body → verify (Standard Webhooks, per-mode secret) → claimWebhook('whop:'+mode, webhook-id)
// → E handlers. Replays answer 200 {ok:true, duplicate:true}. Unknown events answer 200.
// If a handler throws, the claim is released and we answer 500 so Whop retries (handlers are
// idempotent on whop_payment_id / ledger (kind, ref)); the reconciler's Whop sweep is the backstop.
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { claimWebhook, db, logEvent, openIncident } from "@/lib/db";
import { onDisputeCreated, onPaymentSucceeded, onRefundCreated } from "@/lib/orders/handlers";
import { Mode } from "@/lib/types";
import { verifyWhopWebhook, WhopWebhookError, type WhopEvent } from "@/lib/whop";
import { fail, ok } from "../checkout/_shared";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Finds our order for a payment: metadata.order_id first, then the checkout configuration id. */
async function findOrderId(mode: Mode, data: { metadata?: Record<string, unknown> | null; checkout_configuration_id?: string | null } | null): Promise<string | null> {
  const metaId = data?.metadata?.order_id;
  if (typeof metaId === "string" && UUID_RE.test(metaId)) {
    const r = await db().from("orders").select("id").eq("id", metaId).eq("mode", mode).maybeSingle();
    if (r.error) throw new Error(`orders by id: ${r.error.message}`);
    if (r.data) return (r.data as { id: string }).id;
  }
  const ch = data?.checkout_configuration_id;
  if (typeof ch === "string" && ch) {
    const r = await db().from("orders").select("id").eq("whop_checkout_id", ch).eq("mode", mode).maybeSingle();
    if (r.error) throw new Error(`orders by checkout: ${r.error.message}`);
    if (r.data) return (r.data as { id: string }).id;
  }
  return null;
}

const money = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

const paymentIdOf = (d: { payment?: { id?: string } | null; payment_id?: string } | null): string | null =>
  d?.payment?.id ?? d?.payment_id ?? null;

async function handle(ev: WhopEvent, mode: Mode, requestId: string): Promise<Record<string, unknown>> {
  const d = ev.data ?? {};
  switch (ev.type) {
    case "payment.succeeded": {
      const orderId = await findOrderId(mode, d);
      if (!orderId) {
        const detail = `payment ${d.id} (${mode}) has no matching order (metadata.order_id=${String(d.metadata?.order_id ?? "")})`;
        await logEvent({ actor: "code", action: "whop_payment_unmatched", reasoning: detail, payload: { event_id: ev.id, payment_id: d.id, mode } });
        await openIncident("whop_payment_unmatched", detail);
        return { unmatched: true };
      }
      await onPaymentSucceeded({
        orderId,
        paymentId: String(d.id),
        amountUsd: money(d.usd_total ?? d.total ?? d.subtotal),
        receiptUrl: typeof d.receipt_url === "string" ? d.receipt_url : null, // not in the pinned payload; kept for forward-compat
        mode,
      });
      return { order_id: orderId };
    }
    case "refund.created": {
      const paymentId = paymentIdOf(d);
      if (!paymentId || !d.id) throw new Error(`refund.created ${ev.id} without refund/payment id`);
      await onRefundCreated({ paymentId, refundId: String(d.id), amountUsd: money(d.amount), mode });
      return {};
    }
    case "dispute.created": {
      const paymentId = paymentIdOf(d);
      if (!d.id) throw new Error(`dispute.created ${ev.id} without dispute id`);
      await onDisputeCreated({ disputeId: String(d.id), paymentId: paymentId ?? "", mode });
      return {};
    }
    case "payment.failed":
    case "dispute.updated": {
      const orderId = ev.type === "payment.failed" ? await findOrderId(mode, d) : null;
      await logEvent({
        order_id: orderId,
        actor: "code",
        action: ev.type === "payment.failed" ? "whop_payment_failed" : "whop_dispute_updated",
        reasoning: ev.type === "payment.failed" ? (d.failure_message ?? d.decline_code ?? null) : (d.status ?? null),
        payload: { event_id: ev.id, mode, id: d.id ?? null, payment_id: paymentIdOf(d), status: d.status ?? null, request_id: requestId },
      });
      return {};
    }
    default:
      return { ignored: true };
  }
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  const rawBody = await req.text(); // raw bytes are what Whop signed — never parse first
  const modeParam = req.nextUrl.searchParams.get("mode") ?? "live";
  const modeParsed = Mode.safeParse(modeParam);
  if (!modeParsed.success) return fail(400, "bad_request", "mode must be live or sandbox", requestId);
  const mode = modeParsed.data;

  let ev: WhopEvent;
  try {
    ev = verifyWhopWebhook(rawBody, req.headers, mode);
  } catch (e) {
    if (e instanceof WhopWebhookError) {
      console.warn(`[whop-webhook ${requestId}] rejected (${mode}): ${e.message}`);
      return fail(401, "bad_signature", "Invalid webhook signature", requestId);
    }
    // e.g. "WHOP_WEBHOOK_SECRET is not configured" → 500 so Whop retries once it is.
    console.error(`[whop-webhook ${requestId}] ${(e as Error).message}`);
    return fail(500, "not_configured", (e as Error).message, requestId);
  }

  const provider = `whop:${mode}`;
  let claimed: boolean;
  try {
    claimed = await claimWebhook(provider, ev.id);
  } catch (e) {
    console.error(`[whop-webhook ${requestId}] claim failed: ${(e as Error).message}`);
    return fail(500, "internal", "claim failed", requestId);
  }
  if (!claimed) return ok({ duplicate: true }, requestId);

  try {
    const result = await handle(ev, mode, requestId);
    console.log(`[whop-webhook ${requestId}] ${mode} ${ev.type} ${ev.id} handled`);
    return ok({ type: ev.type, ...result }, requestId);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[whop-webhook ${requestId}] ${ev.type} ${ev.id} failed: ${msg}`);
    // Release the claim so Whop's retry is processed instead of being treated as a duplicate.
    await db().from("processed_webhooks").delete().match({ provider, event_id: ev.id }).then(() => {}, () => {});
    return fail(500, "handler_failed", "Event processing failed; will retry", requestId);
  }
}
