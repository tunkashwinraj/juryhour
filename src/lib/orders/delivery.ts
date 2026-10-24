// Delivery after the provenance checker has passed: DELIVERED, or PARTIAL with a pro-rata refund when
// fewer jurors were approved than requested (SPEC §8: price × (requested − approved) / requested).
import { refreshTag } from "@/lib/cache-tags";
import { sendEmail } from "@/lib/email";
import { panelSpec, proRataRefund, round2 } from "@/lib/guardrails";
import { getOrderStats } from "@/lib/stats";
import type { Report } from "@/lib/types";
import { errMessage, getOrder, getPanels, getTest, incidentOnce } from "./repo";
import { issueRefund } from "./refunds";
import { transition } from "./transition";
import type { OrderRow } from "./types";

/** requested_n of the panel that actually ran (latest launched), else the tier's max. */
export async function requestedJurors(order: OrderRow): Promise<number> {
  const panels = await getPanels(order.id);
  const ran = [...panels].reverse().find((p) => p.launched_at !== null && (p.status === "live" || p.status === "stopped"));
  return ran?.requested_n ?? panelSpec(order).maxJurors;
}

/** Pro-rata refund still owed on a PARTIAL order (0 when settled). */
export async function partialRefundOwed(order: OrderRow): Promise<{ owed: number; requested: number; approved: number }> {
  const test = await getTest(order.id);
  const stats = test ? await getOrderStats(test.id) : null;
  const requested = await requestedJurors(order);
  const approved = stats?.n_approved ?? 0;
  const due = proRataRefund(Number(order.price_usd ?? 0), requested, approved);
  return { owed: round2(Math.max(0, due - order.refund_usd)), requested, approved };
}

export async function settlePartialRefund(orderId: string, actor = "code"): Promise<number> {
  const order = await getOrder(orderId);
  if (!order || order.stage !== "PARTIAL") return 0;
  const { owed, requested, approved } = await partialRefundOwed(order);
  if (owed <= 0) return 0;
  try {
    const r = await issueRefund(order, {
      amount: owed,
      policy: "short_panel",
      actor,
      reason: `Pro-rata refund: ${approved} of ${requested} jurors delivered`,
    });
    return r.amount;
  } catch (e) {
    await incidentOnce("refund_failed", `Pro-rata refund of $${owed} failed: ${errMessage(e)}`, orderId);
    return 0;
  }
}

export async function deliverReport(orderId: string, report: Report, actor: string): Promise<{ stage: "DELIVERED" | "PARTIAL"; refund_usd: number }> {
  const order = await getOrder(orderId);
  if (!order) throw new Error(`order ${orderId} not found`);
  const test = await getTest(orderId);
  const stats = test ? await getOrderStats(test.id) : null;
  const requested = await requestedJurors(order);
  const approved = stats?.n_approved ?? 0;
  const deliveredAt = new Date().toISOString();
  refreshTag("counters"); // home/about live counters include this verdict

  if (approved >= requested) {
    await transition(orderId, "DELIVERED", `Report passed the provenance checker (${approved}/${requested} jurors)`, { report, delivered_at: deliveredAt }, { from: "SYNTHESIZING", actor });
    try {
      await sendEmail({ template: "delivered", to: order.email, vars: { token: order.token, verdict: report.headline_verdict, n: approved, order_id: order.id } });
    } catch (e) {
      await incidentOnce("email_failed", `delivered email: ${errMessage(e)}`, orderId);
    }
    return { stage: "DELIVERED", refund_usd: 0 };
  }

  await transition(orderId, "PARTIAL", `Short panel: ${approved}/${requested} jurors; report delivered with pro-rata refund`, { report, delivered_at: deliveredAt }, { from: "SYNTHESIZING", actor });
  const refunded = await settlePartialRefund(orderId);
  try {
    await sendEmail({
      template: "partial",
      to: order.email,
      vars: { token: order.token, delivered_n: approved, ordered_n: requested, refund_usd: refunded, summary: report.headline_verdict, order_id: order.id },
    });
  } catch (e) {
    await incidentOnce("email_failed", `partial email: ${errMessage(e)}`, orderId);
  }
  return { stage: "PARTIAL", refund_usd: refunded };
}
