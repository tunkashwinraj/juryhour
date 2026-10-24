// Service-role Supabase client. Server-only: never import from a client component.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | undefined;

export function db(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("db() is server-only");
  if (!client) {
    const e = env();
    client = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Throws on a Supabase error, returns data otherwise. */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/** Append-only decision log row (SPEC §13: every consequential action is logged). */
export async function logEvent(e: {
  order_id?: string | null;
  actor: string;
  action: string;
  reasoning?: string | null;
  payload?: unknown;
}) {
  const res = await db().from("events").insert({
    order_id: e.order_id ?? null,
    actor: e.actor,
    action: e.action,
    reasoning: e.reasoning ?? null,
    payload: e.payload ?? null,
  });
  if (res.error) throw new Error(`logEvent: ${res.error.message}`);
}

/** Opens an incident (shown on /ops). */
export async function openIncident(kind: string, detail: string, order_id?: string | null) {
  const res = await db().from("incidents").insert({ kind, detail, order_id: order_id ?? null });
  if (res.error) throw new Error(`openIncident: ${res.error.message}`);
}

/**
 * Webhook idempotency: returns true the first time (provider, eventId) is seen, false on replay.
 */
export async function claimWebhook(provider: string, eventId: string): Promise<boolean> {
  const res = await db().from("processed_webhooks").insert({ provider, event_id: eventId });
  if (!res.error) return true;
  if (res.error.code === "23505") return false;
  throw new Error(`claimWebhook: ${res.error.message}`);
}
