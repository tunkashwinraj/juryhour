// POST /api/reconcile — called every minute by pg_cron + pg_net (supabase/migrations/0003_cron.sql).
// Bearer INTERNAL_CRON_SECRET. Works for < 10s and leaves the rest for the next minute (SPEC §14).
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { bearerMatches } from "@/lib/ops/auth";
import { runReconcile } from "@/lib/orders/reconcile";

export const maxDuration = 30;

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const headers = { "x-request-id": requestId, "cache-control": "no-store" };
  if (!bearerMatches(req.headers.get("authorization"), env().INTERNAL_CRON_SECRET)) {
    return Response.json({ ok: false, code: "unauthorized", error: "missing or invalid bearer token" }, { status: 401, headers });
  }
  try {
    const summary = await runReconcile();
    return Response.json({ ok: true, data: summary }, { headers });
  } catch (e) {
    console.error(`[reconcile ${requestId}]`, e);
    return Response.json({ ok: false, code: "internal_error", error: e instanceof Error ? e.message : String(e) }, { status: 500, headers });
  }
}
