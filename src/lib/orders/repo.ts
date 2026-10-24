// Small DB helpers shared by handlers, the Ops API and the reconciler. Every write that books money
// goes through addLedger (idempotent on (kind, ref)); every decision is logged via logEventSafe.
import { refreshTag } from "@/lib/cache-tags";
import { db, logEvent, must } from "@/lib/db";
import { Refusal } from "@/lib/guardrails";
import type { Mode } from "@/lib/types";
import type {
  AgentRunRow,
  CompanyStateRow,
  LedgerKind,
  OrderRow,
  PanelRow,
  ResponseRow,
  TestRow,
} from "./types";

export const nowIso = () => new Date().toISOString();

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** need("X") throws "X is not configured"; exa.ts throws "EXA_API_KEY is not set". */
export function isNotConfigured(e: unknown): boolean {
  return /is not (configured|set)\b/.test(errMessage(e));
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function normOrder(r: OrderRow): OrderRow {
  return {
    ...r,
    price_usd: num(r.price_usd),
    refund_usd: Number(r.refund_usd ?? 0),
    attempts: Number(r.attempts ?? 0),
    addons: Array.isArray(r.addons) ? r.addons : [],
  };
}

function normPanel(p: PanelRow): PanelRow {
  return {
    ...p,
    cost_per_participant: num(p.cost_per_participant),
    budget_usd: num(p.budget_usd),
    requested_n: Number(p.requested_n),
    approved_n: Number(p.approved_n ?? 0),
    rejected_n: Number(p.rejected_n ?? 0),
  };
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  const r = must(await db().from("orders").select("*").eq("id", id).maybeSingle(), "orders select");
  return r ? normOrder(r as OrderRow) : null;
}

export async function mustGetOrder(id: string): Promise<OrderRow> {
  const o = await getOrder(id);
  if (!o) throw new Refusal("not_found", `order ${id} not found`, 404);
  return o;
}

export async function getOrderByPayment(paymentId: string): Promise<OrderRow | null> {
  const r = must(await db().from("orders").select("*").eq("whop_payment_id", paymentId).maybeSingle(), "orders by payment");
  return r ? normOrder(r as OrderRow) : null;
}

export async function getTest(orderId: string): Promise<TestRow | null> {
  return must(await db().from("tests").select("*").eq("order_id", orderId).maybeSingle(), "tests select") as TestRow | null;
}

export async function getTestById(id: string): Promise<TestRow | null> {
  return must(await db().from("tests").select("*").eq("id", id).maybeSingle(), "tests select") as TestRow | null;
}

export async function getPanels(orderId: string): Promise<PanelRow[]> {
  const rows = must(
    await db().from("panels").select("*").eq("order_id", orderId).order("created_at", { ascending: true }),
    "panels select",
  ) as PanelRow[];
  return (rows ?? []).map(normPanel);
}

export async function getLatestPanel(orderId: string): Promise<PanelRow | null> {
  const ps = await getPanels(orderId);
  return ps.length ? ps[ps.length - 1] : null;
}

export async function getPanel(id: string): Promise<PanelRow | null> {
  const r = must(await db().from("panels").select("*").eq("id", id).maybeSingle(), "panel select");
  return r ? normPanel(r as PanelRow) : null;
}

export async function updatePanel(id: string, patch: Partial<PanelRow>): Promise<void> {
  must(await db().from("panels").update(patch).eq("id", id), "panels update");
}

export async function getResponses(panelId: string): Promise<ResponseRow[]> {
  return (must(
    await db().from("responses").select("*").eq("panel_id", panelId).order("created_at", { ascending: true }),
    "responses select",
  ) ?? []) as ResponseRow[];
}

export async function getCompanyState(): Promise<CompanyStateRow> {
  const r = must(await db().from("company_state").select("*").eq("id", 1).maybeSingle(), "company_state select");
  if (!r) throw new Error("company_state row is missing");
  return { ...(r as CompanyStateRow), terac_balance_usd: num((r as CompanyStateRow).terac_balance_usd) };
}

export async function updateCompanyState(patch: Partial<CompanyStateRow>): Promise<void> {
  must(await db().from("company_state").update({ ...patch, updated_at: nowIso() }).eq("id", 1), "company_state update");
  if ("sales_paused" in patch) refreshTag("company_state");
}

export async function getAgentRuns(orderId: string, agent?: string): Promise<AgentRunRow[]> {
  let q = db().from("agent_runs").select("*").eq("order_id", orderId);
  if (agent) q = q.eq("agent", agent);
  return (must(await q.order("started_at", { ascending: true }), "agent_runs select") ?? []) as AgentRunRow[];
}

/**
 * Books one ledger row. Positive = revenue, negative = cost/refund. Idempotent when `ref` is set:
 * a replay hits the unique (kind, ref) index and returns false instead of double-booking.
 */
export async function addLedger(row: {
  order_id: string | null;
  mode: Mode;
  kind: LedgerKind;
  amount_usd: number;
  ref?: string | null;
  note?: string | null;
}): Promise<boolean> {
  const res = await db().from("ledger").insert({
    order_id: row.order_id,
    mode: row.mode,
    kind: row.kind,
    amount_usd: Math.round(row.amount_usd * 10000) / 10000, // numeric(12,4) since 0004
    ref: row.ref ?? null,
    note: row.note ?? null,
  });
  if (!res.error) return true;
  if (res.error.code === "23505") return false;
  throw new Error(`ledger insert: ${res.error.message}`);
}

/** logEvent that never fails the caller because of a dangling order_id (FK) — retries without it. */
export async function logEventSafe(e: {
  order_id?: string | null;
  actor: string;
  action: string;
  reasoning?: string | null;
  payload?: unknown;
}): Promise<void> {
  try {
    await logEvent(e);
  } catch (err) {
    if (e.order_id) {
      try {
        await logEvent({ ...e, order_id: null, payload: { order_id: e.order_id, payload: e.payload ?? null } });
        return;
      } catch {
        /* fall through */
      }
    }
    console.error("[events] failed to log", e.action, errMessage(err));
  }
}

/** Opens an incident unless an unresolved one with the same kind/order/detail already exists. */
export async function incidentOnce(kind: string, detail: string, orderId?: string | null): Promise<boolean> {
  try {
    let q = db().from("incidents").select("id").eq("kind", kind).eq("resolved", false).eq("detail", detail);
    q = orderId ? q.eq("order_id", orderId) : q.is("order_id", null);
    const existing = must(await q.limit(1), "incidents select") as { id: string }[] | null;
    if (existing && existing.length) return false;
    const res = await db().from("incidents").insert({ kind, detail: detail.slice(0, 2000), order_id: orderId ?? null });
    if (res.error) throw new Error(res.error.message);
    return true;
  } catch (err) {
    console.error("[incidents] failed to open", kind, errMessage(err));
    return false;
  }
}

/** Increments orders.attempts (not a stage write). */
export async function bumpAttempts(order: Pick<OrderRow, "id" | "attempts">): Promise<number> {
  const next = Number(order.attempts ?? 0) + 1;
  must(await db().from("orders").update({ attempts: next }).eq("id", order.id), "orders attempts");
  return next;
}

export async function resetAttempts(orderId: string): Promise<void> {
  must(await db().from("orders").update({ attempts: 0 }).eq("id", orderId), "orders attempts reset");
}
