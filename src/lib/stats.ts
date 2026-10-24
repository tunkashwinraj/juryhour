// Report numbers come ONLY from SQL (SPEC §2.6): the order_stats and approved_responses views.
// This module reads them; it never computes a statistic itself.
import { db, must } from "@/lib/db";
import type { OrderStats } from "@/lib/types";
import type { ApprovedResponseRow } from "@/lib/orders/types";

const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function getOrderStats(testId: string): Promise<OrderStats | null> {
  const r = must(await db().from("order_stats").select("*").eq("test_id", testId).maybeSingle(), "order_stats select") as Record<string, unknown> | null;
  if (!r) return null;
  return {
    test_id: String(r.test_id),
    order_id: String(r.order_id),
    n_approved: Number(r.n_approved ?? 0),
    prefer_a: Number(r.prefer_a ?? 0),
    prefer_b: Number(r.prefer_b ?? 0),
    clarity_a: n(r.clarity_a),
    clarity_b: n(r.clarity_b),
    intent_a: n(r.intent_a),
    intent_b: n(r.intent_b),
    understanding_rate_a: n(r.understanding_rate_a),
    understanding_rate_b: n(r.understanding_rate_b),
  };
}

/** Approved responses with their stable anonymous number (label "Juror N"). */
export async function getApprovedResponses(testId: string): Promise<ApprovedResponseRow[]> {
  const rows = must(
    await db().from("approved_responses").select("*").eq("test_id", testId).order("juror_number", { ascending: true }),
    "approved_responses select",
  ) as ApprovedResponseRow[] | null;
  return (rows ?? []).map((r) => ({ ...r, juror_number: Number(r.juror_number) }));
}

export const jurorLabel = (jurorNumber: number) => `Juror ${jurorNumber}`;
