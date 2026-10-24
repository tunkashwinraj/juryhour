// /api/ops/metrics: company numbers for the CEO / Growth / CFO agents. Live and sandbox are kept
// separate everywhere (SPEC §2.11); sandbox numbers are tests, never revenue.
import { db, must } from "@/lib/db";
import { round2 } from "@/lib/guardrails";
import type { Mode } from "@/lib/types";

type LedgerRow = { mode: Mode; kind: string; amount_usd: number };
type OrderLite = { mode: Mode; stage: string; tier: string; src: string | null; paid_at: string | null; human_interventions: number };
type PreviewLite = { src: string | null; safety_verdict: string; created_at: string };

const PAGE = 1000;

/** PostgREST caps rows per request (1000 on Supabase): page through with range(). */
async function fetchAll<T>(table: string, cols: string, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < maxPages; p++) {
    const rows = must(await db().from(table).select(cols).order("created_at", { ascending: true }).range(p * PAGE, p * PAGE + PAGE - 1), `${table} page`) as T[] | null;
    out.push(...(rows ?? []));
    if (!rows || rows.length < PAGE) break;
  }
  return out;
}

export const ADS_EVENT = "ads_budget_set";

/** Latest daily budget per campaign, from the ads_budget_set events the Ops API writes. */
export async function currentAdBudgets(): Promise<Record<string, number>> {
  const rows = must(
    await db().from("events").select("payload, created_at").eq("action", ADS_EVENT).order("created_at", { ascending: false }).limit(500),
    "events ads",
  ) as { payload: { campaign_id?: string; daily_usd?: number } | null }[] | null;
  const out: Record<string, number> = {};
  for (const r of rows ?? []) {
    const id = r.payload?.campaign_id;
    if (id && !(id in out)) out[id] = Number(r.payload?.daily_usd ?? 0);
  }
  return out;
}

function moneyFor(rows: LedgerRow[], mode: Mode) {
  const sum = (k: string) => round2(rows.filter((r) => r.mode === mode && r.kind === k).reduce((s, r) => s + Number(r.amount_usd), 0));
  const revenue = sum("revenue");
  const refunds = sum("refund");
  const costs = {
    terac_cost: sum("terac_cost"),
    ai_cost: sum("ai_cost"),
    exa_cost: sum("exa_cost"),
    whop_fee: sum("whop_fee"),
    affiliate: sum("affiliate"),
    ads: sum("ads"),
  };
  const netRevenue = round2(revenue + refunds);
  const totalCosts = round2(Object.values(costs).reduce((s, v) => s + v, 0));
  const gross = round2(netRevenue + totalCosts);
  return {
    revenue,
    refunds,
    net_revenue: netRevenue,
    ...costs,
    gross_profit: gross,
    gross_margin_pct: netRevenue > 0 ? round2((gross / netRevenue) * 100) : null,
    refund_reserve_usd: round2(netRevenue * 0.03),
  };
}

function ordersFor(orders: OrderLite[], mode: Mode) {
  const mine = orders.filter((o) => o.mode === mode);
  const byStage: Record<string, number> = {};
  const byTier: Record<string, { checkouts: number; paid: number }> = {};
  const bySrc: Record<string, { checkouts: number; paid: number }> = {};
  for (const o of mine) {
    byStage[o.stage] = (byStage[o.stage] ?? 0) + 1;
    const t = (byTier[o.tier] ??= { checkouts: 0, paid: 0 });
    const s = (bySrc[o.src ?? "direct"] ??= { checkouts: 0, paid: 0 });
    t.checkouts++;
    s.checkouts++;
    if (o.paid_at) {
      t.paid++;
      s.paid++;
    }
  }
  return { orders_total: mine.length, paid_orders: mine.filter((o) => o.paid_at).length, orders_by_stage: byStage, orders_by_tier: byTier, orders_by_src: bySrc };
}

export async function buildMetrics(now = new Date()) {
  const [ledger, orders, previews] = await Promise.all([
    fetchAll<LedgerRow>("ledger", "mode, kind, amount_usd"),
    fetchAll<OrderLite>("orders", "mode, stage, tier, src, paid_at, human_interventions"),
    fetchAll<PreviewLite>("previews", "src, safety_verdict, created_at"),
  ]);
  const state = must(await db().from("company_state").select("*").eq("id", 1).maybeSingle(), "company_state") as Record<string, unknown> | null;
  const prices = must(await db().from("prices").select("*"), "prices") as unknown[] | null;
  const runs = must(
    await db().from("agent_runs").select("agent, order_id, attempt, started_at, session_url").eq("status", "fired").order("started_at", { ascending: true }).limit(50),
    "agent_runs active",
  ) as unknown[] | null;
  const incidents = must(
    await db().from("incidents").select("id, kind, detail, order_id, created_at").eq("resolved", false).order("created_at", { ascending: false }).limit(20),
    "incidents open",
  ) as unknown[] | null;
  const openRes = await db().from("incidents").select("id", { count: "exact", head: true }).eq("resolved", false);
  const since24h = new Date(now.getTime() - 86_400_000).toISOString();
  const drafts = await db().from("events").select("id", { count: "exact", head: true }).eq("action", "post_draft").gte("created_at", since24h);
  const ads = await currentAdBudgets();

  const previewsBySrc: Record<string, number> = {};
  for (const p of previews) if (p.safety_verdict === "allow") previewsBySrc[p.src ?? "direct"] = (previewsBySrc[p.src ?? "direct"] ?? 0) + 1;
  const humanFromOrders = orders.reduce((s, o) => s + Number(o.human_interventions ?? 0), 0);

  return {
    generated_at: now.toISOString(),
    live: { ...moneyFor(ledger, "live"), ...ordersFor(orders, "live") },
    sandbox: { label: "SANDBOX — test data, not revenue", ...moneyFor(ledger, "sandbox"), ...ordersFor(orders, "sandbox") },
    funnel: {
      previews_total: previews.length,
      previews_allowed: previews.filter((p) => p.safety_verdict === "allow").length,
      previews_refused: previews.filter((p) => p.safety_verdict === "refuse").length,
      previews_last_24h: previews.filter((p) => p.created_at >= since24h).length,
      previews_by_src: previewsBySrc,
    },
    prices: prices ?? [],
    company: {
      sales_paused: Boolean(state?.sales_paused),
      pause_reason: (state?.pause_reason as string | null) ?? null,
      terac_balance_usd: state?.terac_balance_usd === null || state?.terac_balance_usd === undefined ? null : Number(state.terac_balance_usd),
      terac_balance_checked_at: (state?.terac_balance_checked_at as string | null) ?? null,
      human_interventions: Number(state?.human_interventions ?? 0) + humanFromOrders,
    },
    agents: { active_runs: (runs ?? []).length, runs: runs ?? [] },
    incidents: { open: openRes.count ?? (incidents ?? []).length, latest: incidents ?? [] },
    ads: { campaigns: ads, total_daily_usd: round2(Object.values(ads).reduce((s, v) => s + v, 0)) },
    growth: { post_drafts_last_24h: drafts.count ?? 0 },
  };
}
