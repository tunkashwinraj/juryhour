// All DB reads for Workstream A pages and routes. Server-only (service role via db()).
// Callers inside React Server Components must be behind <Suspense> (Cache Components).
import { cacheLife, cacheTag } from "next/cache";
import { refreshTag } from "@/lib/cache-tags";
import { db, must } from "@/lib/db";
import { BUYABLE_TIERS, TIERS, type TierName } from "@/lib/constants";
import { Report, type Card, type Answers, type Mode, type Stage } from "@/lib/types";
import { isUuid, isValidToken, type LedgerRow } from "@/components/rules";

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ---------------------------------------------------------------- landing

export type LandingData = {
  prices: Record<TierName, number | null>;
  salesPaused: boolean;
  publicVerdicts: { orderId: string; verdict: string; n: number }[];
};

function mergePrices(rows: { tier: string; current_usd: unknown }[] | null): Record<TierName, number | null> {
  const prices = Object.fromEntries(
    (Object.keys(TIERS) as TierName[]).map((t) => [t, TIERS[t].price]),
  ) as Record<TierName, number | null>;
  // Prices table wins; constants are the fallback when the read fails or a tier is missing.
  for (const row of rows ?? []) {
    if ((BUYABLE_TIERS as readonly string[]).includes(row.tier) && row.current_usd !== null) {
      prices[row.tier as TierName] = Number(row.current_usd);
    }
  }
  return prices;
}

export async function getCurrentPrices(): Promise<Record<TierName, number | null>> {
  const res = await db().from("prices").select("tier, current_usd");
  return mergePrices(res.error ? null : res.data);
}

/**
 * Prices for the prerendered shell (no loading state, readable without JS). Cached and tagged
 * "prices": ops/change_price revalidates the tag. Falls back to constants if the DB read fails.
 */
export async function getShellPrices(): Promise<Record<TierName, number | null>> {
  "use cache";
  cacheLife("minutes");
  cacheTag("prices");
  try {
    return await getCurrentPrices();
  } catch {
    return mergePrices(null);
  }
}

/** Opt-in public verdicts (live orders whose owner ticked "show publicly"), newest first. */
export async function getPublicVerdicts(limit = 60): Promise<LandingData["publicVerdicts"]> {
  const res = await db()
    .from("orders")
    .select("id, report, delivered_at")
    .eq("report_public", true)
    .not("report", "is", null)
    .eq("mode", "live")
    .order("delivered_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  const out: LandingData["publicVerdicts"] = [];
  for (const row of res.error ? [] : res.data ?? []) {
    const parsed = Report.safeParse(row.report);
    if (parsed.success) out.push({ orderId: row.id, verdict: parsed.data.headline_verdict, n: parsed.data.scorecard.n_approved });
  }
  return out;
}

export async function getLandingData(): Promise<LandingData> {
  const sb = db();
  const [pricesRes, stateRes, publicRes] = await Promise.all([
    sb.from("prices").select("tier, current_usd"),
    sb.from("company_state").select("sales_paused").eq("id", 1).maybeSingle(),
    sb
      .from("orders")
      .select("id, report, delivered_at")
      .eq("report_public", true)
      .not("report", "is", null)
      .eq("mode", "live")
      .order("delivered_at", { ascending: false, nullsFirst: false })
      .limit(3),
  ]);

  const prices = mergePrices(pricesRes.error ? null : pricesRes.data);

  const publicVerdicts: LandingData["publicVerdicts"] = [];
  for (const row of publicRes.error ? [] : publicRes.data ?? []) {
    const parsed = Report.safeParse(row.report);
    if (parsed.success) {
      publicVerdicts.push({
        orderId: row.id,
        verdict: parsed.data.headline_verdict,
        n: parsed.data.scorecard.n_approved,
      });
    }
  }

  return {
    prices,
    salesPaused: stateRes.error ? false : Boolean(stateRes.data?.sales_paused),
    publicVerdicts,
  };
}

// ---------------------------------------------------------------- order status

export type OrderStatus = {
  token: string;
  mode: Mode;
  stage: Stage;
  tier: string;
  price_usd: number | null;
  paid_at: string | null;
  delivered_at: string | null;
  deadline_at: string | null;
  refund_usd: number;
  requested_n: number | null;
  approved_n: number;
  has_report: boolean;
  created_at: string;
};

/** Same semantics as the anon RPC get_order_by_token: safe projection only. */
export async function getOrderStatus(token: string): Promise<OrderStatus | null> {
  if (!isValidToken(token)) return null;
  const rows = must(await db().rpc("get_order_by_token", { p_token: token }), "get_order_by_token") as
    | Record<string, unknown>[]
    | null;
  const r = rows?.[0];
  if (!r) return null;
  return {
    token: String(r.token),
    mode: r.mode as Mode,
    stage: r.stage as Stage,
    tier: String(r.tier),
    price_usd: num(r.price_usd),
    paid_at: (r.paid_at as string | null) ?? null,
    delivered_at: (r.delivered_at as string | null) ?? null,
    deadline_at: (r.deadline_at as string | null) ?? null,
    refund_usd: num(r.refund_usd) ?? 0,
    requested_n: num(r.requested_n),
    approved_n: num(r.approved_n) ?? 0,
    has_report: Boolean(r.has_report),
    created_at: String(r.created_at),
  };
}

// ---------------------------------------------------------------- report

export type JurorRow = {
  juror_number: number;
  first_card: "A" | "B";
  answers: Answers;
  understood_a: boolean | null;
  understood_b: boolean | null;
};

export type ReportData = {
  orderId: string;
  token: string;
  mode: Mode;
  tier: string;
  stage: Stage;
  pricePaid: number | null;
  paidAt: string | null;
  refundUsd: number;
  reportPublic: boolean;
  report: Report | null; // null when not delivered yet or invalid
  cardA: Card | null;
  cardB: Card | null;
  jurors: JurorRow[];
  stats: {
    n_approved: number;
    prefer_a: number;
    prefer_b: number;
    clarity_a: number | null;
    clarity_b: number | null;
    intent_a: number | null;
    intent_b: number | null;
    understanding_rate_a: number | null;
    understanding_rate_b: number | null;
  } | null;
};

export async function getReportData(token: string): Promise<ReportData | null> {
  if (!isValidToken(token)) return null;
  const sb = db();
  const order = must(
    await sb
      .from("orders")
      .select("id, token, mode, tier, stage, price_usd, paid_at, refund_usd, report, report_public")
      .eq("token", token)
      .maybeSingle(),
    "orders by token",
  );
  if (!order) return null;

  const test = must(
    await sb.from("tests").select("id, card_a, card_b").eq("order_id", order.id).maybeSingle(),
    "tests by order",
  );

  let jurors: JurorRow[] = [];
  let stats: ReportData["stats"] = null;
  if (test) {
    const [jr, st] = await Promise.all([
      // Only anonymous fields: never select anything that could identify a juror.
      sb
        .from("approved_responses")
        .select("juror_number, first_card, answers, understood_a, understood_b")
        .eq("test_id", test.id)
        .order("juror_number", { ascending: true }),
      sb.from("order_stats").select("*").eq("test_id", test.id).maybeSingle(),
    ]);
    jurors = (must(jr, "approved_responses") ?? []) as JurorRow[];
    const s = must(st, "order_stats");
    if (s) {
      stats = {
        n_approved: Number(s.n_approved),
        prefer_a: Number(s.prefer_a),
        prefer_b: Number(s.prefer_b),
        clarity_a: num(s.clarity_a),
        clarity_b: num(s.clarity_b),
        intent_a: num(s.intent_a),
        intent_b: num(s.intent_b),
        understanding_rate_a: num(s.understanding_rate_a),
        understanding_rate_b: num(s.understanding_rate_b),
      };
    }
  }

  const parsed = order.report ? Report.safeParse(order.report) : null;
  const delivered = order.stage === "DELIVERED" || order.stage === "PARTIAL";
  return {
    orderId: order.id,
    token: order.token,
    mode: order.mode,
    tier: order.tier,
    stage: order.stage,
    pricePaid: num(order.price_usd),
    paidAt: order.paid_at,
    refundUsd: num(order.refund_usd) ?? 0,
    reportPublic: Boolean(order.report_public),
    report: delivered && parsed?.success ? parsed.data : null,
    cardA: (test?.card_a as Card | null) ?? null,
    cardB: (test?.card_b as Card | null) ?? null,
    jurors,
    stats,
  };
}

/** Lightweight read for the OG route: either the token or the order id. */
export async function getOgOrder(ref: string): Promise<{
  id: string;
  token: string;
  report_public: boolean;
  has_report: boolean;
  report: Report | null;
} | null> {
  const col = isUuid(ref) ? "id" : isValidToken(ref) ? "token" : null;
  if (!col) return null;
  const row = must(
    await db().from("orders").select("id, token, stage, report, report_public").eq(col, ref).maybeSingle(),
    "orders for og",
  );
  if (!row) return null;
  const parsed = row.report ? Report.safeParse(row.report) : null;
  const ok = parsed?.success && (row.stage === "DELIVERED" || row.stage === "PARTIAL");
  return {
    id: row.id,
    token: row.token,
    report_public: Boolean(row.report_public),
    has_report: Boolean(ok),
    report: ok && parsed?.success ? parsed.data : null,
  };
}

// ---------------------------------------------------------------- ops dashboard

export type OpsData = {
  ledger: LedgerRow[];
  previewsBySrc: { src: string | null }[];
  ordersForFunnel: { src: string | null; paid_at: string | null; mode: Mode }[];
  previewCount: number;
  payingCustomers: number;
  humanInterventions: number;
  companyState: {
    sales_paused: boolean;
    pause_reason: string | null;
    terac_balance_usd: number | null;
    terac_balance_checked_at: string | null;
    human_interventions: number;
  };
  orders: {
    id: string;
    token: string;
    mode: Mode;
    stage: Stage;
    tier: string;
    price_usd: number | null;
    email: string;
    src: string | null;
    stage_entered_at: string;
    created_at: string;
  }[];
  events: {
    id: string;
    order_id: string | null;
    actor: string;
    action: string;
    reasoning: string | null;
    created_at: string;
  }[];
  agentRuns: {
    id: string;
    order_id: string | null;
    agent: string;
    status: string;
    attempt: number;
    session_url: string | null;
    started_at: string;
    ended_at: string | null;
  }[];
  incidents: { id: string; order_id: string | null; kind: string; detail: string | null; resolved: boolean; created_at: string }[];
};

export async function getOpsData(filter: { actor?: string | null; orderId?: string | null }): Promise<OpsData> {
  const sb = db();
  let events = sb
    .from("events")
    .select("id, order_id, actor, action, reasoning, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter.actor) events = events.eq("actor", filter.actor);
  if (filter.orderId && isUuid(filter.orderId)) events = events.eq("order_id", filter.orderId);

  const [ledger, previews, previewCount, allOrders, state, orders, ev, runs, incidents] = await Promise.all([
    sb.from("ledger").select("mode, kind, amount_usd").limit(10000),
    sb.from("previews").select("src").limit(10000),
    sb.from("previews").select("id", { count: "exact", head: true }),
    sb.from("orders").select("src, paid_at, mode, email, human_interventions").limit(10000),
    sb
      .from("company_state")
      .select("sales_paused, pause_reason, terac_balance_usd, terac_balance_checked_at, human_interventions")
      .eq("id", 1)
      .maybeSingle(),
    sb
      .from("orders")
      .select("id, token, mode, stage, tier, price_usd, email, src, stage_entered_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    events,
    sb
      .from("agent_runs")
      .select("id, order_id, agent, status, attempt, session_url, started_at, ended_at")
      .order("started_at", { ascending: false })
      .limit(30),
    sb
      .from("incidents")
      .select("id, order_id, kind, detail, resolved, created_at")
      .order("resolved", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const all = (must(allOrders, "orders (all)") ?? []) as {
    src: string | null;
    paid_at: string | null;
    mode: Mode;
    email: string;
    human_interventions: number;
  }[];
  const cs = must(state, "company_state");
  const companyState = {
    sales_paused: Boolean(cs?.sales_paused),
    pause_reason: cs?.pause_reason ?? null,
    terac_balance_usd: num(cs?.terac_balance_usd),
    terac_balance_checked_at: cs?.terac_balance_checked_at ?? null,
    human_interventions: Number(cs?.human_interventions ?? 0),
  };
  const paying = new Set(all.filter((o) => o.paid_at && o.mode === "live").map((o) => o.email.toLowerCase()));

  return {
    ledger: (must(ledger, "ledger") ?? []) as LedgerRow[],
    previewsBySrc: (must(previews, "previews") ?? []) as { src: string | null }[],
    ordersForFunnel: all.map(({ src, paid_at, mode }) => ({ src, paid_at, mode })),
    previewCount: previewCount.count ?? 0,
    payingCustomers: paying.size,
    humanInterventions:
      all.reduce((s, o) => s + Number(o.human_interventions ?? 0), 0) + companyState.human_interventions,
    companyState,
    orders: ((must(orders, "orders (recent)") ?? []) as OpsData["orders"]).map((o) => ({
      ...o,
      price_usd: num(o.price_usd),
    })),
    events: (must(ev, "events") ?? []) as OpsData["events"],
    agentRuns: (must(runs, "agent_runs") ?? []) as OpsData["agentRuns"],
    incidents: (must(incidents, "incidents") ?? []) as OpsData["incidents"],
  };
}

// ---------------------------------------------------------------- ops writes (kill switch)

/**
 * Human kill switch. Every press is a human intervention and is counted honestly
 * (company_state.human_interventions) and logged as an `events` row.
 */
export async function setSalesPaused(paused: boolean): Promise<{ salesPaused: boolean; humanInterventions: number }> {
  const sb = db();
  const cur = must(
    await sb.from("company_state").select("human_interventions").eq("id", 1).single(),
    "company_state read",
  );
  const next = Number(cur?.human_interventions ?? 0) + 1;
  must(
    await sb
      .from("company_state")
      .update({
        sales_paused: paused,
        pause_reason: paused ? "Paused by a human from /ops (kill switch)" : null,
        human_interventions: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1),
    "company_state update",
  );
  refreshTag("company_state");
  return { salesPaused: paused, humanInterventions: next };
}

/** Customer share opt-in. Token is the auth. Returns false when no delivered report exists. */
export async function setReportPublic(token: string, isPublic: boolean): Promise<boolean> {
  if (!isValidToken(token)) return false;
  const rows = must(
    await db()
      .from("orders")
      .update({ report_public: isPublic })
      .eq("token", token)
      .not("report", "is", null)
      .select("id"),
    "orders share update",
  );
  return (rows?.length ?? 0) > 0;
}
