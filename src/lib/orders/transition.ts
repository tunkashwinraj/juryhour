// The ONLY code that writes orders.stage (SPEC §7). Validates the move against ALLOWED_TRANSITIONS,
// sets stage_entered_at, resets attempts, applies the patch and writes an events row (actor 'code').
// The update is conditional on the stage we read (`.eq('stage', from)`), so a webhook and the
// reconciler racing on the same order can never both transition it: the loser gets StageConflictError.
import { db } from "@/lib/db";
import type { Stage } from "@/lib/types";
import { logEventSafe, nowIso } from "./repo";
import type { OrderRow } from "./types";

export type { OrderRow } from "./types";

/** In-flight stages that may fail (SPEC §7: any ──3 failed attempts──► FAILED). */
export const IN_FLIGHT_STAGES = ["PAID", "RESEARCHING", "QUOTING", "PANEL_LIVE", "GRADING", "SYNTHESIZING"] as const satisfies readonly Stage[];

export const ALLOWED_TRANSITIONS: Readonly<Record<Stage, readonly Stage[]>> = {
  CREATED: ["PAID"],
  PAID: ["RESEARCHING", "FAILED"],
  RESEARCHING: ["QUOTING", "FAILED"],
  QUOTING: ["PANEL_LIVE", "REFUNDED", "FAILED"],
  PANEL_LIVE: ["GRADING", "REFUNDED", "FAILED"],
  GRADING: ["SYNTHESIZING", "FAILED"],
  SYNTHESIZING: ["DELIVERED", "PARTIAL", "FAILED"],
  FAILED: ["REFUNDED"],
  // A support-policy refund of the whole price after delivery closes the order as REFUNDED.
  DELIVERED: ["REFUNDED"],
  PARTIAL: ["REFUNDED"],
  REFUNDED: [],
  BLOCKED: [], // blocked previews never create an order
};

export function canTransition(from: Stage, to: Stage): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidTransitionError extends Error {
  constructor(readonly from: Stage, readonly to: Stage) {
    super(`Invalid stage transition ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/** The row moved (or vanished) between our read and our conditional update. */
export class StageConflictError extends Error {
  constructor(readonly orderId: string, readonly expected: Stage, readonly to: Stage) {
    super(`Order ${orderId} is no longer in ${expected}; refusing ${expected} → ${to}`);
    this.name = "StageConflictError";
  }
}

/** Fields transition() owns; a patch can't set them. */
const RESERVED = new Set(["id", "stage", "stage_entered_at", "attempts", "created_at", "updated_at"]);

export async function transition(
  orderId: string,
  to: Stage,
  reason: string,
  patch: Partial<OrderRow> = {},
  opts: { from?: Stage | readonly Stage[]; actor?: string } = {},
): Promise<{ from: Stage; to: Stage }> {
  const cur = await db().from("orders").select("id, stage").eq("id", orderId).maybeSingle();
  if (cur.error) throw new Error(`transition read: ${cur.error.message}`);
  if (!cur.data) throw new Error(`transition: order ${orderId} not found`);
  const from = cur.data.stage as Stage;

  if (opts.from !== undefined) {
    const expected = Array.isArray(opts.from) ? opts.from : [opts.from as Stage];
    if (!expected.includes(from)) throw new StageConflictError(orderId, expected[0], to);
  }
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (!RESERVED.has(k) && v !== undefined) clean[k] = v;

  const at = nowIso();
  const upd = await db()
    .from("orders")
    .update({ ...clean, stage: to, stage_entered_at: at, attempts: 0 })
    .eq("id", orderId)
    .eq("stage", from)
    .select("id");
  if (upd.error) throw new Error(`transition update: ${upd.error.message}`);
  if (!upd.data || upd.data.length === 0) throw new StageConflictError(orderId, from, to);

  await logEventSafe({
    order_id: orderId,
    actor: "code",
    action: "transition",
    reasoning: reason,
    payload: { from, to, at, by: opts.actor ?? "code", patch: Object.keys(clean) },
  });
  return { from, to };
}
