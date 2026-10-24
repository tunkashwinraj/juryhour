// Event handlers called by the Whop and Terac webhook routes (owned by B and C), plus the stage
// handlers the reconciler and Ops API share. All are idempotent: webhooks replay, the reconciler
// re-runs every minute, and the Whop sweep may deliver the same payment again.
import { WHOP_FEE } from "@/lib/constants";
import { sendEmail } from "@/lib/email";
import { deadlineFrom, panelSpec, round2 } from "@/lib/guardrails";
import type { Mode } from "@/lib/types";
import { refundPayment } from "@/lib/whop";
import { db, must } from "@/lib/db";
import { fireAgentRun } from "./agentRuns";
import { gradeAndDecide, stopLivePanel } from "./panel";
import {
  addLedger,
  bumpAttempts,
  errMessage,
  getOrder,
  getOrderByPayment,
  getPanel,
  incidentOnce,
  isNotConfigured,
  logEventSafe,
} from "./repo";
import { StageConflictError, transition } from "./transition";
import type { OrderRow, ResponseRow } from "./types";

export { transition } from "./transition";

function notConfiguredOrIncident(e: unknown, kind: string, orderId: string | null) {
  return isNotConfigured(e)
    ? incidentOnce("not_configured", errMessage(e), null)
    : incidentOnce(kind, errMessage(e), orderId);
}

// ---------------------------------------------------------------- stage handlers

/** PAID → fire Researcher → RESEARCHING. On a fire failure the order stays PAID for the reconciler. */
export async function startResearcher(order: OrderRow, reason: string): Promise<boolean> {
  try {
    await fireAgentRun(order.id, "researcher", order.attempts + 1, reason);
  } catch (e) {
    await notConfiguredOrIncident(e, "agent_fire_failed", order.id);
    if (!isNotConfigured(e)) await bumpAttempts(order);
    return false;
  }
  try {
    await transition(order.id, "RESEARCHING", "Researcher started", {}, { from: "PAID" });
  } catch (e) {
    if (!(e instanceof StageConflictError)) throw e;
  }
  return true;
}

/** GRADING → stop panel → fire Analyst → SYNTHESIZING. */
export async function startAnalyst(order: OrderRow, reason: string, opts: { forceStop?: boolean } = {}): Promise<boolean> {
  const stop = await stopLivePanel(order.id, "Grading complete", { force: opts.forceStop });
  if (!stop.stopped) return false; // Terac still has awaiting_review submissions; retry next minute
  try {
    await fireAgentRun(order.id, "analyst", order.attempts + 1, reason);
  } catch (e) {
    await notConfiguredOrIncident(e, "agent_fire_failed", order.id);
    if (!isNotConfigured(e)) await bumpAttempts(order);
    return false;
  }
  try {
    await transition(order.id, "SYNTHESIZING", "Analyst started", {}, { from: "GRADING" });
  } catch (e) {
    if (!(e instanceof StageConflictError)) throw e;
  }
  return true;
}

// ---------------------------------------------------------------- Whop

export async function onPaymentSucceeded(i: {
  orderId: string;
  paymentId: string;
  amountUsd: number;
  receiptUrl: string | null;
  mode: Mode;
}): Promise<void> {
  const order = await getOrder(i.orderId);
  if (!order) {
    await incidentOnce("payment_unknown_order", `Payment ${i.paymentId} (${i.mode}) references unknown order ${i.orderId}`);
    return;
  }
  if (order.mode !== i.mode) {
    // A sandbox payment must never pay for a live order (or vice versa).
    await incidentOnce("payment_mode_mismatch", `Payment ${i.paymentId} is ${i.mode} but order is ${order.mode}`, order.id);
    return;
  }
  if (order.whop_payment_id === i.paymentId) {
    // Replay (webhook retry or sweep). Nothing to do; the reconciler continues the pipeline.
    await logEventSafe({ order_id: order.id, actor: "code", action: "payment_replay_ignored", payload: { payment_id: i.paymentId } });
    return;
  }
  if (order.whop_payment_id && order.whop_payment_id !== i.paymentId) {
    // Paid twice for one order: refund the duplicate in full, by code.
    await incidentOnce("duplicate_payment", `Order already paid by ${order.whop_payment_id}; refunding duplicate ${i.paymentId}`, order.id);
    try {
      const r = await refundPayment({ paymentId: i.paymentId, mode: i.mode });
      await addLedger({ order_id: order.id, mode: i.mode, kind: "revenue", amount_usd: i.amountUsd, ref: i.paymentId, note: "duplicate payment" });
      await addLedger({ order_id: order.id, mode: i.mode, kind: "refund", amount_usd: -i.amountUsd, ref: r.refundId ?? `dup:${i.paymentId}`, note: "duplicate payment refunded" });
      await logEventSafe({ order_id: order.id, actor: "code", action: "duplicate_payment_refunded", payload: { payment_id: i.paymentId, refund_id: r.refundId } });
    } catch (e) {
      await incidentOnce("refund_failed", `Duplicate payment ${i.paymentId} refund failed: ${errMessage(e)}`, order.id);
    }
    return;
  }
  if (order.stage !== "CREATED") {
    await incidentOnce("payment_wrong_stage", `Payment ${i.paymentId} for order in ${order.stage}`, order.id);
    return;
  }
  if (order.price_usd !== null && i.amountUsd + 0.01 < Number(order.price_usd)) {
    await incidentOnce("underpayment", `Payment ${i.paymentId} is $${i.amountUsd}; order price is $${order.price_usd}`, order.id);
  }

  // Ledger first: idempotent on (kind, ref = payment id), so a crash after this point can't double-book.
  await addLedger({ order_id: order.id, mode: i.mode, kind: "revenue", amount_usd: i.amountUsd, ref: i.paymentId, note: `${order.tier} order` });
  await addLedger({ order_id: order.id, mode: i.mode, kind: "whop_fee", amount_usd: -round2(WHOP_FEE(i.amountUsd)), ref: i.paymentId, note: "estimated card fee" });

  const paidAt = new Date();
  const spec = panelSpec(order);
  try {
    await transition(
      order.id,
      "PAID",
      `Whop payment ${i.paymentId} succeeded ($${i.amountUsd})`,
      {
        whop_payment_id: i.paymentId,
        whop_receipt_url: i.receiptUrl,
        paid_at: paidAt.toISOString(),
        deadline_at: deadlineFrom(paidAt, spec).toISOString(),
        ...(order.tier === "launch_pack" ? { retest_available: true } : {}),
      },
      { from: "CREATED" },
    );
  } catch (e) {
    if (e instanceof StageConflictError) return; // a concurrent delivery of the same payment won
    throw e;
  }

  try {
    await sendEmail({
      template: "paid",
      to: order.email,
      vars: { token: order.token, jurors: spec.maxJurors, eta: deadlineFrom(paidAt, spec).toISOString(), order_id: order.id },
    });
  } catch (e) {
    await incidentOnce("email_failed", `paid email: ${errMessage(e)}`, order.id);
  }

  const fresh = await getOrder(order.id);
  if (fresh && fresh.stage === "PAID") await startResearcher(fresh, "Payment received");
}

export async function onRefundCreated(i: { paymentId: string; refundId: string; amountUsd: number; mode: Mode }): Promise<void> {
  const order = await getOrderByPayment(i.paymentId);
  if (!order) {
    await incidentOnce("refund_unknown_payment", `Refund ${i.refundId} for unknown payment ${i.paymentId} (${i.mode})`);
    return;
  }
  const amount = round2(Math.abs(i.amountUsd));
  // Already booked by our own refund code with the real Whop id?
  const existing = must(await db().from("ledger").select("id").eq("kind", "refund").eq("ref", i.refundId).limit(1), "ledger by ref") as { id: string }[] | null;
  if (existing && existing.length) return;

  // Booked by us with a placeholder ref (Whop didn't return the id synchronously)? Swap in the real id.
  const pending = must(
    await db().from("ledger").select("id, ref, amount_usd").eq("order_id", order.id).eq("kind", "refund").order("created_at", { ascending: true }),
    "ledger pending refunds",
  ) as { id: string; ref: string | null; amount_usd: number }[] | null;
  const match = (pending ?? []).find((r) => r.ref?.startsWith("pending:") && Math.abs(Math.abs(Number(r.amount_usd)) - amount) < 0.01);
  if (match) {
    must(await db().from("ledger").update({ ref: i.refundId }).eq("id", match.id), "ledger ref swap");
    await logEventSafe({ order_id: order.id, actor: "code", action: "refund_confirmed", payload: { refund_id: i.refundId, amount } });
    return;
  }

  // A refund we didn't initiate (Whop dashboard, processor): book it and count it against the order.
  const booked = await addLedger({ order_id: order.id, mode: i.mode, kind: "refund", amount_usd: -amount, ref: i.refundId, note: "refund.created (external)" });
  if (booked) {
    must(await db().from("orders").update({ refund_usd: round2(order.refund_usd + amount) }).eq("id", order.id), "orders refund_usd");
    await logEventSafe({ order_id: order.id, actor: "code", action: "external_refund_recorded", payload: { refund_id: i.refundId, amount } });
  }
}

export async function onDisputeCreated(i: { disputeId: string; paymentId: string; mode: Mode }): Promise<void> {
  const order = i.paymentId ? await getOrderByPayment(i.paymentId) : null;
  if (!order) {
    await incidentOnce("dispute_unknown_payment", `Dispute ${i.disputeId} for unknown payment ${i.paymentId || "(none)"} (${i.mode})`);
    return;
  }
  await logEventSafe({
    order_id: order.id,
    actor: "code",
    action: "dispute_created",
    reasoning: `Whop dispute ${i.disputeId} opened`,
    payload: { dispute_id: i.disputeId, payment_id: i.paymentId, mode: i.mode },
  });
  await incidentOnce("dispute", `Dispute ${i.disputeId} opened on payment ${i.paymentId}`, order.id);
  try {
    await fireAgentRun(order.id, "disputes", 1, `Dispute ${i.disputeId} opened`);
  } catch (e) {
    await notConfiguredOrIncident(e, "agent_fire_failed", order.id);
  }
}

// ---------------------------------------------------------------- Terac

/**
 * submission → awaiting_review. Finds our stored answers; none yet (the juror's POST hasn't landed) →
 * leave it for the reconciler. Otherwise grade (code rules + LLM) → approve / reject with category and
 * written reason, never above MAX_REJECT_RATE → counts, ledger, and GRADING once the panel is full.
 */
export async function onSubmissionAwaitingReview(teracSubmissionId: string): Promise<void> {
  const r = must(
    await db().from("responses").select("*").eq("terac_submission_id", teracSubmissionId).maybeSingle(),
    "responses by submission",
  ) as ResponseRow | null;
  if (!r) {
    await logEventSafe({
      actor: "code",
      action: "submission_awaiting_no_response",
      reasoning: "Terac says awaiting_review but no stored answers yet; the reconciler will retry",
      payload: { terac_submission_id: teracSubmissionId },
    });
    return;
  }
  if (r.decision !== null) return; // decided (or held for review) already: idempotent
  const panel = await getPanel(r.panel_id);
  const order = panel ? await getOrder(panel.order_id) : null;
  if (!panel || !order) return;
  if (order.stage !== "PANEL_LIVE" && order.stage !== "GRADING") {
    await logEventSafe({ order_id: order.id, actor: "code", action: "submission_ignored", reasoning: `order is ${order.stage}`, payload: { response_id: r.id } });
    return;
  }
  await gradeAndDecide(r);
}
