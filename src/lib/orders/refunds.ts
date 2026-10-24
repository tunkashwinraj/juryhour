// The only paths that move money back to customers. Agents reach issueRefund only through
// /api/ops/refund (policy-checked); code reaches it through closeWithFullRefund / failAndRefund.
import { sendEmail } from "@/lib/email";
import { db } from "@/lib/db";
import { checkRefund, refundRemaining, refuse, round2 } from "@/lib/guardrails";
import { refundPayment } from "@/lib/whop";
import { addLedger, errMessage, getOrder, incidentOnce, logEventSafe } from "./repo";
import { stopLivePanel } from "./panel";
import { IN_FLIGHT_STAGES, StageConflictError, canTransition, transition } from "./transition";
import type { OrderRow, RefundPolicy } from "./types";

export type RefundResult = { refundId: string | null; amount: number; refundedTotal: number; status: string };

/**
 * Checks (amount ≤ price − refunded, policy, support once), reserves the amount on the order with a
 * conditional update (so two concurrent refunds can't both pass the cap), calls Whop, books the ledger.
 */
export async function issueRefund(
  order: OrderRow,
  i: { amount: number; policy: RefundPolicy; actor: string; reason: string },
): Promise<RefundResult> {
  const amount = checkRefund({
    price: order.price_usd,
    refunded: order.refund_usd,
    amount: i.amount,
    policy: i.policy,
    supportUsed: order.support_refund_used,
    stage: order.stage,
    paid: Boolean(order.whop_payment_id && order.paid_at),
  });
  const price = Number(order.price_usd);
  const before = Number(order.refund_usd);
  const after = round2(before + amount);
  const support = i.policy === "support";

  let q = db()
    .from("orders")
    .update(support ? { refund_usd: after, support_refund_used: true } : { refund_usd: after })
    .eq("id", order.id)
    .eq("refund_usd", before);
  if (support) q = q.eq("support_refund_used", false);
  const reserved = await q.select("id");
  if (reserved.error) throw new Error(`refund reserve: ${reserved.error.message}`);
  if (!reserved.data || reserved.data.length === 0) refuse("refund_conflict", "the order's refund state changed concurrently; re-read and retry", 409);

  let r: { refundId: string | null; status: string };
  try {
    const full = before === 0 && amount >= price - 1e-6;
    r = await refundPayment({ paymentId: order.whop_payment_id!, amountUsd: full ? undefined : amount, mode: order.mode });
  } catch (e) {
    await db()
      .from("orders")
      .update(support ? { refund_usd: before, support_refund_used: false } : { refund_usd: before })
      .eq("id", order.id)
      .eq("refund_usd", after);
    throw e;
  }

  // ref = Whop refund id, so the refund.created webhook can't double-book it (onRefundCreated swaps
  // a pending: ref for the real id when Whop didn't return one synchronously).
  await addLedger({
    order_id: order.id,
    mode: order.mode,
    kind: "refund",
    amount_usd: -amount,
    ref: r.refundId ?? `pending:${order.id}:${after.toFixed(2)}`,
    note: `${i.policy}: ${i.reason}`.slice(0, 500),
  });
  order.refund_usd = after;
  if (support) order.support_refund_used = true;
  await logEventSafe({
    order_id: order.id,
    actor: i.actor,
    action: "refund_issued",
    reasoning: i.reason,
    payload: { amount, policy: i.policy, refund_id: r.refundId, whop_status: r.status, refunded_total: after, price },
  });
  return { refundId: r.refundId, amount, refundedTotal: after, status: r.status };
}

/**
 * Refunds whatever is left and closes the order as REFUNDED. Stages that can't go straight to REFUNDED
 * pass through FAILED. If Whop fails the order is left in FAILED so the reconciler retries the refund.
 */
export async function closeWithFullRefund(
  orderId: string,
  policy: RefundPolicy,
  reason: string,
  actor = "code",
): Promise<{ refunded: boolean; stage: string }> {
  let order = await getOrder(orderId);
  if (!order) throw new Error(`order ${orderId} not found`);
  if (order.stage === "REFUNDED") return { refunded: true, stage: "REFUNDED" };

  if ((IN_FLIGHT_STAGES as readonly string[]).includes(order.stage)) await stopLivePanel(order.id, reason, { force: true });
  if (!canTransition(order.stage, "REFUNDED")) {
    await transition(order.id, "FAILED", reason, {}, { from: order.stage });
    order = { ...order, stage: "FAILED" };
  }
  const effectivePolicy: RefundPolicy = order.stage === "FAILED" && policy !== "support" ? "failed" : policy;

  const remaining = refundRemaining(Number(order.price_usd ?? 0), order.refund_usd);
  let refundAmount = 0;
  if (remaining > 0) {
    if (!order.whop_payment_id) {
      await incidentOnce("refund_no_payment", `Order owes $${remaining} but has no whop_payment_id`, order.id);
      return { refunded: false, stage: order.stage };
    }
    try {
      const r = await issueRefund(order, { amount: remaining, policy: effectivePolicy, actor, reason });
      refundAmount = r.amount;
    } catch (e) {
      await incidentOnce("refund_failed", `Full refund of $${remaining} failed: ${errMessage(e)}`, order.id);
      if (order.stage !== "FAILED" && canTransition(order.stage, "FAILED")) {
        try {
          await transition(order.id, "FAILED", `Refund failed, will retry: ${errMessage(e)}`, {}, { from: order.stage });
        } catch (t) {
          if (!(t instanceof StageConflictError)) throw t;
        }
      }
      return { refunded: false, stage: "FAILED" };
    }
  }

  await transition(order.id, "REFUNDED", reason, {}, { from: order.stage });
  try {
    await sendEmail({
      template: "refunded",
      to: order.email,
      vars: { refund_usd: round2(order.refund_usd || refundAmount), token: order.token, reason, order_id: order.id },
    });
  } catch (e) {
    await incidentOnce("email_failed", `refunded email: ${errMessage(e)}`, order.id);
  }
  return { refunded: true, stage: "REFUNDED" };
}

/** SPEC §7: any ──(3 failed attempts)──► FAILED → auto full refund → REFUNDED. */
export async function failAndRefund(orderId: string, reason: string): Promise<{ refunded: boolean; stage: string }> {
  const order = await getOrder(orderId);
  if (!order) throw new Error(`order ${orderId} not found`);
  if ((IN_FLIGHT_STAGES as readonly string[]).includes(order.stage)) {
    await stopLivePanel(order.id, reason, { force: true });
    await transition(order.id, "FAILED", reason, {}, { from: order.stage });
  }
  return closeWithFullRefund(orderId, "failed", reason);
}
