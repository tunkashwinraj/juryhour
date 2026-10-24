// Helpers shared by /api/leads and /api/order-lookup (Agent C). Not a route.
import { createHash } from "node:crypto";
import { after } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";

export const DAY_MS = 24 * 60 * 60 * 1000;

export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || null;
  return req.headers.get("x-real-ip")?.trim() || null;
}

/** sha256(ip | OPS_API_KEY): same scheme as /api/preview, so the raw IP is never stored. */
export function hashIp(ip: string | null): string {
  return createHash("sha256").update(`${ip ?? "unknown"}|${env().OPS_API_KEY}`).digest("hex");
}

/** Count `leads` rows in the last 24h matching one column, optionally limited to some kinds. */
export async function countLeads(column: "ip_hash" | "email", value: string, kinds: string[]): Promise<number> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const res = await db()
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .in("kind", kinds)
    .gte("created_at", since);
  if (res.error) throw new Error(`count leads by ${column}: ${res.error.message}`);
  return res.count ?? 0;
}

/** Runs work after the response is sent (constant response time); inline when outside a request. */
export async function runAfterResponse(task: () => Promise<void>, label: string): Promise<void> {
  const safe = () =>
    task().catch((e: unknown) => {
      console.error(`[${label}] background task failed: ${e instanceof Error ? e.message : String(e)}`);
    });
  try {
    after(safe);
  } catch {
    await safe();
  }
}

// ---------------------------------------------------------------- /api/leads

export const LEADS_PER_IP_PER_DAY = 5;

// ---------------------------------------------------------------- /api/order-lookup

export const LOOKUPS_PER_EMAIL_PER_DAY = 3;
export const LOOKUPS_PER_IP_PER_DAY = 10;
export const LOOKUP_MESSAGE = "If we have orders for that email, we've sent the links.";

type OrderRow = { id: string; token: string; tier: string; stage: string; created_at: string; paid_at: string | null };

/** Paid orders and specialist quote requests (abandoned checkouts are left out), newest first, max 10. */
export async function sendOrderLinks(email: string, leadRef: string): Promise<"sent" | "none" | "skipped"> {
  const res = await db()
    .from("orders")
    .select("id, token, tier, stage, created_at, paid_at")
    .eq("email", email)
    .eq("mode", env().APP_MODE)
    .order("created_at", { ascending: false })
    .limit(25);
  if (res.error) throw new Error(`orders by email: ${res.error.message}`);
  const orders = ((res.data ?? []) as OrderRow[]).filter((o) => o.paid_at || o.tier === "specialist").slice(0, 10);
  if (orders.length === 0) return "none";
  const out = await sendEmail({
    template: "order_lookup",
    to: email,
    vars: {
      orders: JSON.stringify(orders.map((o) => ({ id: o.id, token: o.token, tier: o.tier, stage: o.stage, created_at: o.created_at }))),
    },
    idempotencyKey: `order_lookup:${leadRef}`,
  });
  return out.id ? "sent" : "skipped";
}

