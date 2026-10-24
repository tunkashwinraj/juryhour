// The reconciler (SPEC §14, adapted per CONTRACTS §0.2): runs every minute from pg_cron, works for
// at most ~8s, then stops and leaves the rest for the next minute. Agent completion is detected by
// the expected Ops handoff (a tests row, a stored report); stage timeouts come from constants.
// Every step is isolated: an error bumps the order's attempts and opens an incident; a missing
// integration ("X is not configured") is recorded once and the step is skipped.
import {
  AGENT_RUN_TIMEOUT_MINUTES,
  FOLLOWUP_1_AFTER_MINUTES,
  FOLLOWUP_2_AFTER_HOURS,
  LOW_TERAC_BALANCE_USD,
  MAX_STAGE_ATTEMPTS,
  PANEL_GRACE_HOURS,
  RECONCILE_MAX_ORDERS,
  RESUME_TERAC_BALANCE_USD,
  SPECIALIST_PRICE,
  STAGE_TIMEOUT_MINUTES,
  TERAC_BALANCE_REFRESH_MINUTES,
  TIERS,
  WHOP_SWEEP_EVERY_MINUTES,
} from "@/lib/constants";
import { db, must } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { env, has } from "@/lib/env";
import { COST_REFUSAL_CODES, isRefusal, panelSpec, productLabelFromUrl } from "@/lib/guardrails";
import { getQuote, getTeracContext, listSubmissions, requestQuote } from "@/lib/terac";
import type { AgentName, Mode, Stage } from "@/lib/types";
import { createCheckout, listRecentPayments } from "@/lib/whop";
import { fireAgentRun, markRun } from "./agentRuns";
import { partialRefundOwed, settlePartialRefund } from "./delivery";
import { onPaymentSucceeded, startAnalyst, startResearcher } from "./handlers";
import {
  closeAutoRejected,
  finishPanel,
  gradeAndDecide,
  isTeracAutoRejected,
  launchPanel,
  pollQuote,
  recountPanel,
  rejectOrphanSubmission,
  requestPanelQuote,
  instantPriceCoolingDown,
  RECONCILE_PRICE_TIMEOUT_MS,
  retryPanelQuote,
  taskDescription,
} from "./panel";
import { closeWithFullRefund, failAndRefund } from "./refunds";
import {
  bumpAttempts,
  errMessage,
  getAgentRuns,
  getCompanyState,
  getOrder,
  getPanel,
  getPanels,
  getResponses,
  getTest,
  incidentOnce,
  isNotConfigured,
  logEventSafe,
  resetAttempts,
  updateCompanyState,
} from "./repo";
import { IN_FLIGHT_STAGES, StageConflictError, transition } from "./transition";
import type { OrderRow, PreviewRow } from "./types";

/** Pause reason prefix of the reconciler's automatic low-balance pause; auto-resume only clears these. */
export const AUTO_PAUSE_PREFIX = "auto: low Terac balance";
/** Work budget per run (the route must answer well inside 10s). */
export const RECONCILE_BUDGET_MS = 8_000;
/** Grading calls per order per run (each is an LLM call). */
const MAX_GRADES_PER_ORDER = 3;
const MAX_FOLLOWUPS_PER_RUN = 10;
const MIN = 60_000;

export const RECONCILE_STAGES = [...IN_FLIGHT_STAGES, "FAILED"] as const satisfies readonly Stage[];

export type ReconcileSummary = {
  started_at: string;
  orders: { order_id: string; stage: Stage; result: string }[];
  steps: Record<string, string>;
  out_of_time: boolean;
  elapsed_ms: number;
};

type Clock = { now: Date; timeLeft: () => number };

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

// ---------------------------------------------------------------- entry point

export async function runReconcile(opts: { budgetMs?: number; maxOrders?: number } = {}): Promise<ReconcileSummary> {
  const now = new Date();
  const t0 = performance.now();
  const budget = opts.budgetMs ?? RECONCILE_BUDGET_MS;
  const clock: Clock = { now, timeLeft: () => budget - (performance.now() - t0) };
  const summary: ReconcileSummary = { started_at: now.toISOString(), orders: [], steps: {}, out_of_time: false, elapsed_ms: 0 };

  const step = async (name: string, fn: () => Promise<string>) => {
    if (clock.timeLeft() <= 0) {
      summary.out_of_time = true;
      summary.steps[name] = "skipped: out of time";
      return;
    }
    try {
      summary.steps[name] = await fn();
    } catch (e) {
      summary.steps[name] = `error: ${errMessage(e)}`;
      if (isNotConfigured(e)) await incidentOnce("not_configured", errMessage(e), null);
      else await incidentOnce("reconcile_step_failed", `${name}: ${errMessage(e)}`.slice(0, 500), null);
    }
  };

  await step("company_state", () => companyStateStep(clock));
  await step("agent_runs", () => agentRunTimeoutStep(clock));
  await step("whop_sweep", () => whopSweepStep(clock));

  const orders = must(
    await db().from("orders").select("*").in("stage", [...RECONCILE_STAGES]).order("stage_entered_at", { ascending: true }).limit(opts.maxOrders ?? RECONCILE_MAX_ORDERS),
    "orders active",
  ) as OrderRow[] | null;
  for (const raw of orders ?? []) {
    if (clock.timeLeft() <= 0) {
      summary.out_of_time = true;
      break;
    }
    const order = await getOrder(raw.id);
    if (!order) continue;
    let result: string;
    try {
      result = await reconcileOrder(order, clock);
    } catch (e) {
      result = await orderStepFailed(order, e);
    }
    summary.orders.push({ order_id: order.id, stage: order.stage, result });
  }

  await step("partial_refunds", () => partialRefundStep(clock));
  await step("specialist_quotes", () => specialistQuoteStep(clock));
  await step("followups", () => followupStep(clock));
  summary.elapsed_ms = Math.round(performance.now() - t0);
  return summary;
}

/** A failed step: attempts++ and an incident; MAX_STAGE_ATTEMPTS → FAILED → full refund. */
async function orderStepFailed(order: OrderRow, e: unknown): Promise<string> {
  const msg = errMessage(e);
  if (isNotConfigured(e)) {
    await incidentOnce("not_configured", msg, null);
    return `skipped: ${msg}`;
  }
  if (e instanceof StageConflictError) return "moved concurrently";
  await incidentOnce("reconcile_error", `${order.stage}: ${msg}`.slice(0, 500), order.id);
  if (!(IN_FLIGHT_STAGES as readonly string[]).includes(order.stage)) return `error: ${msg}`;
  const attempts = await bumpAttempts(order);
  if (attempts >= MAX_STAGE_ATTEMPTS) {
    try {
      await failAndRefund(order.id, `${order.stage} failed ${attempts} times: ${msg}`);
      return `failed after ${attempts} attempts`;
    } catch (f) {
      return `error: ${errMessage(f)}`;
    }
  }
  return `error (attempt ${attempts}): ${msg}`;
}

// ---------------------------------------------------------------- per order

export async function reconcileOrder(order: OrderRow, clock: Clock): Promise<string> {
  switch (order.stage) {
    case "PAID":
      return paidStep(order);
    case "RESEARCHING":
      return researchingStep(order, clock);
    case "QUOTING":
      return quotingStep(order, clock);
    case "PANEL_LIVE":
      return panelLiveStep(order, clock);
    case "GRADING":
      return gradingStep(order, clock);
    case "SYNTHESIZING":
      return agentTimeoutStep(order, "analyst", STAGE_TIMEOUT_MINUTES.SYNTHESIZING, clock);
    case "FAILED": {
      const r = await closeWithFullRefund(order.id, "failed", "Order failed; refunding in full");
      return r.refunded ? "refunded" : "refund pending";
    }
    default:
      return "noop";
  }
}

async function paidStep(order: OrderRow): Promise<string> {
  if (order.attempts >= MAX_STAGE_ATTEMPTS) {
    await failAndRefund(order.id, `Researcher could not be started after ${order.attempts} attempts`);
    return "failed";
  }
  const runs = await getAgentRuns(order.id, "researcher");
  if (runs.some((r) => r.status === "fired" && ms(r.started_at) >= ms(order.stage_entered_at))) {
    await transition(order.id, "RESEARCHING", "Researcher already fired", {}, { from: "PAID" });
    return "researching";
  }
  return (await startResearcher(order, `Reconciler start (attempt ${order.attempts + 1})`)) ? "researcher fired" : "fire failed";
}

async function researchingStep(order: OrderRow, clock: Clock): Promise<string> {
  const test = await getTest(order.id);
  if (test) {
    // The handoff happened but the stage didn't move (crash between insert and transition).
    await transition(order.id, "QUOTING", "Test found; continuing to quote", {}, { from: "RESEARCHING" });
    if ((await getPanels(order.id)).length === 0) await requestPanelQuote(order, test);
    return "quoting";
  }
  return agentTimeoutStep(order, "researcher", STAGE_TIMEOUT_MINUTES.RESEARCHING, clock);
}

/**
 * Agent stage with no completion webhook: if the expected handoff hasn't arrived within `timeoutMin`
 * of the last fire (or stage entry), the run is timed out and re-fired with attempt+1, up to
 * MAX_STAGE_ATTEMPTS → FAILED → full refund. A fire that throws counts as a failed attempt.
 */
export async function agentTimeoutStep(order: OrderRow, agent: AgentName, timeoutMin: number, clock: Clock): Promise<string> {
  const runs = await getAgentRuns(order.id, agent);
  const last = runs.length ? runs[runs.length - 1] : null;
  const since = Math.max(ms(order.stage_entered_at), ms(last?.started_at));
  if (clock.now.getTime() - since < timeoutMin * MIN) return "waiting";
  if (last && last.status === "fired") await markRun(last.id, "timed_out");
  const attempts = await bumpAttempts(order);
  await logEventSafe({ order_id: order.id, actor: "code", action: "stage_timeout", reasoning: `${agent} produced no handoff within ${timeoutMin} min`, payload: { stage: order.stage, attempts } });
  if (attempts >= MAX_STAGE_ATTEMPTS) {
    await failAndRefund(order.id, `${agent} timed out ${attempts} times in ${order.stage}`);
    return "failed";
  }
  try {
    await fireAgentRun(order.id, agent, attempts + 1, `Retry after ${timeoutMin}-minute timeout`);
    return `refired (attempt ${attempts + 1})`;
  } catch (e) {
    if (isNotConfigured(e)) await incidentOnce("not_configured", errMessage(e), null);
    else await incidentOnce("agent_fire_failed", errMessage(e), order.id);
    return `refire failed: ${errMessage(e)}`;
  }
}

async function fireProcurementOnce(order: OrderRow, sinceIso: string, reason: string): Promise<string> {
  const runs = await getAgentRuns(order.id, "procurement");
  if (runs.some((r) => ms(r.started_at) >= ms(sinceIso))) return "procurement already fired";
  try {
    await fireAgentRun(order.id, "procurement", runs.length + 1, reason);
    return "procurement fired";
  } catch (e) {
    if (isNotConfigured(e)) await incidentOnce("not_configured", errMessage(e), null);
    else await incidentOnce("agent_fire_failed", `procurement: ${errMessage(e)}`, order.id);
    return `procurement fire failed: ${errMessage(e)}`;
  }
}

/** Code-path launch with the same checks as /api/ops/launch_panel. Cost/feasibility refusals → Procurement. */
async function tryLaunch(order: OrderRow, panelCreatedAt: string): Promise<string> {
  try {
    const r = await launchPanel(order.id, { actor: "code", reason: "Quote answered; launching within limits" });
    return `launched ${r.n} jurors`;
  } catch (e) {
    if (!isRefusal(e)) throw e;
    if (COST_REFUSAL_CODES.has(e.code)) {
      await logEventSafe({ order_id: order.id, actor: "code", action: "launch_refused", reasoning: e.message, payload: { code: e.code, details: e.details ?? null } });
      return `${e.code}; ${await fireProcurementOnce(order, panelCreatedAt, `Launch refused: ${e.code}`)}`;
    }
    if (e.code === "insufficient_terac_balance" || e.code === "terac_precondition") {
      await incidentOnce(e.code, e.message, order.id);
    }
    return `launch deferred: ${e.code}`;
  }
}

async function quotingStep(order: OrderRow, clock: Clock): Promise<string> {
  const test = await getTest(order.id);
  if (!test) {
    await incidentOnce("panel_state", "Order in QUOTING without a test", order.id);
    return "no test";
  }
  const age = clock.now.getTime() - ms(order.stage_entered_at);
  const timeout = STAGE_TIMEOUT_MINUTES.QUOTING * MIN;
  if (age > timeout + AGENT_RUN_TIMEOUT_MINUTES * MIN) {
    await closeWithFullRefund(order.id, "infeasible", `No feasible panel within ${STAGE_TIMEOUT_MINUTES.QUOTING + AGENT_RUN_TIMEOUT_MINUTES} minutes`);
    return "refunded (quote timeout)";
  }

  const panels = await getPanels(order.id);
  const latest = panels[panels.length - 1];
  let result: string;
  if (!latest) {
    await requestPanelQuote(order, test);
    result = "quote requested";
  } else if (latest.status === "quoting") {
    if (!latest.terac_feasibility_id) {
      // Instant pricing (no human quote): retry the draft-pricing call, at most every few minutes.
      if (await instantPriceCoolingDown(order, latest, clock.now.getTime())) {
        result = "instant pricing pending";
      } else if (await retryPanelQuote(order, latest, test, RECONCILE_PRICE_TIMEOUT_MS)) {
        result = await tryLaunch(order, latest.created_at);
      } else {
        result = "instant pricing retry failed";
      }
    } else {
      const q = await pollQuote(order, latest); // one getQuote per order per run
      if (q === "priced") result = await tryLaunch(order, latest.created_at);
      else if (q === "infeasible") result = `infeasible; ${await fireProcurementOnce(order, latest.created_at, "Terac could not quote this audience")}`;
      else result = "quote pending";
    }
  } else if (latest.status === "priced") {
    const procurement = await getAgentRuns(order.id, "procurement");
    result = procurement.some((r) => ms(r.started_at) >= ms(latest.created_at))
      ? "waiting for procurement"
      : await tryLaunch(order, latest.created_at);
  } else if (latest.status === "infeasible") {
    result = await fireProcurementOnce(order, latest.created_at, "Terac could not quote this audience");
  } else {
    result = `panel ${latest.status}`;
  }

  const fresh = await getOrder(order.id);
  if (fresh?.stage === "QUOTING" && age > timeout) {
    result += `; ${await fireProcurementOnce(fresh, fresh.stage_entered_at, `No launch after ${STAGE_TIMEOUT_MINUTES.QUOTING} minutes`)}`;
  }
  if (order.attempts > 0) await resetAttempts(order.id);
  return result;
}

/** Closes auto-rejected answers and grades undecided ones Terac lists as awaiting_review (race fix). */
async function settleUndecided(order: OrderRow, panelId: string, opportunityId: string | null, clock: Clock): Promise<{ undecided: number; awaitingIds: Set<string> | null }> {
  const responses = await getResponses(panelId);
  for (const r of responses) if (r.decision === null && isTeracAutoRejected(r)) await closeAutoRejected(r);
  const undecided = responses.filter((r) => r.decision === null && !isTeracAutoRejected(r));
  if (undecided.length === 0 || !opportunityId) return { undecided: undecided.length, awaitingIds: null };
  const awaiting = new Set((await listSubmissions(opportunityId, "awaiting_review")).map((s) => s.id));
  let graded = 0;
  for (const r of undecided) {
    if (graded >= MAX_GRADES_PER_ORDER || clock.timeLeft() < 2_000) break;
    if (!awaiting.has(r.terac_submission_id)) continue;
    await gradeAndDecide(r);
    graded++;
  }
  const left = (await getResponses(panelId)).filter((r) => r.decision === null && !isTeracAutoRejected(r)).length;
  return { undecided: left, awaitingIds: awaiting };
}

async function panelLiveStep(order: OrderRow, clock: Clock): Promise<string> {
  const panels = await getPanels(order.id);
  const live = panels.find((p) => p.status === "live");
  if (!live) {
    await incidentOnce("panel_state", "Order in PANEL_LIVE without a live panel", order.id);
    return "no live panel";
  }
  const settle = await settleUndecided(order, live.id, live.terac_opportunity_id, clock);
  await recountPanel(live.id); // responses are the source of truth for the counts
  const panel = (await getPanel(live.id)) ?? live;
  const spec = panelSpec(order);
  if (order.attempts > 0) await resetAttempts(order.id);

  if (panel.approved_n >= panel.requested_n) {
    return (await finishPanel(order.id, `Panel full: ${panel.approved_n}/${panel.requested_n} approved`)) ? "grading" : "full; stop pending";
  }
  const deadline = ms(order.deadline_at);
  if (!deadline || clock.now.getTime() <= deadline) return `live ${panel.approved_n}/${panel.requested_n}`;

  // Past the deadline: Terac won't stop while submissions await review, so reject orphans first.
  if (panel.terac_opportunity_id) {
    const awaiting = settle.awaitingIds ?? new Set((await listSubmissions(panel.terac_opportunity_id, "awaiting_review")).map((s) => s.id));
    const known = new Set((await getResponses(panel.id)).map((r) => r.terac_submission_id));
    for (const id of awaiting) if (!known.has(id)) await rejectOrphanSubmission(order.id, id);
  }
  const graceOver = clock.now.getTime() > deadline + PANEL_GRACE_HOURS * 3_600_000;
  if (panel.approved_n >= spec.minJurors) {
    const moved = await finishPanel(order.id, `Deadline: ${panel.approved_n}/${panel.requested_n} approved (min ${spec.minJurors})`, { force: graceOver });
    return moved ? "grading (deadline)" : "deadline; stop pending";
  }
  if (graceOver) {
    await closeWithFullRefund(order.id, "short_panel", `Only ${panel.approved_n} of ${spec.minJurors} required jurors by the deadline + ${PANEL_GRACE_HOURS}h`);
    return "refunded (short panel)";
  }
  return `past deadline, waiting grace (${panel.approved_n}/${spec.minJurors})`;
}

async function gradingStep(order: OrderRow, clock: Clock): Promise<string> {
  if (order.attempts >= MAX_STAGE_ATTEMPTS) {
    await failAndRefund(order.id, `Analyst could not be started after ${order.attempts} attempts`);
    return "failed";
  }
  const panels = await getPanels(order.id);
  const ran = [...panels].reverse().find((p) => p.launched_at !== null);
  const timedOut = clock.now.getTime() - ms(order.stage_entered_at) > STAGE_TIMEOUT_MINUTES.GRADING * MIN;
  if (ran) {
    const settle = await settleUndecided(order, ran.id, ran.terac_opportunity_id, clock);
    if (settle.undecided > 0 && !timedOut) return `grading: ${settle.undecided} undecided`;
  }
  const ok = await startAnalyst(order, timedOut ? "Grading timed out; continuing with decided responses" : "All responses decided", { forceStop: timedOut });
  return ok ? "analyst fired" : "analyst not started";
}

// ---------------------------------------------------------------- company-level steps

async function companyStateStep(clock: Clock): Promise<string> {
  let state = await getCompanyState();
  const stale = clock.now.getTime() - ms(state.terac_balance_checked_at) > TERAC_BALANCE_REFRESH_MINUTES * MIN;
  let note = "";
  if (stale && has("TERAC_API_KEY")) {
    const ctx = await getTeracContext();
    await updateCompanyState({ terac_balance_usd: ctx.balanceDollars, terac_balance_checked_at: clock.now.toISOString() });
    state = { ...state, terac_balance_usd: ctx.balanceDollars };
    note = `balance refreshed $${ctx.balanceDollars}; `;
  } else if (stale) {
    await incidentOnce("not_configured", "TERAC_API_KEY is not configured", null);
  }
  const bal = state.terac_balance_usd;
  if (bal === null) return `${note}no balance yet`;
  if (bal < LOW_TERAC_BALANCE_USD && !state.sales_paused) {
    const reason = `${AUTO_PAUSE_PREFIX} ($${bal} < $${LOW_TERAC_BALANCE_USD})`;
    await updateCompanyState({ sales_paused: true, pause_reason: reason });
    await logEventSafe({ actor: "code", action: "pause_sales", reasoning: reason, payload: { terac_balance_usd: bal } });
    await incidentOnce("low_terac_balance", reason, null);
    return `${note}paused`;
  }
  if (bal > RESUME_TERAC_BALANCE_USD && state.sales_paused && (state.pause_reason ?? "").startsWith(AUTO_PAUSE_PREFIX)) {
    await updateCompanyState({ sales_paused: false, pause_reason: null });
    await logEventSafe({ actor: "code", action: "resume_sales", reasoning: `Terac balance $${bal} > $${RESUME_TERAC_BALANCE_USD}`, payload: { terac_balance_usd: bal } });
    return `${note}resumed`;
  }
  return `${note}ok ($${bal})`;
}

async function agentRunTimeoutStep(clock: Clock): Promise<string> {
  const cutoff = new Date(clock.now.getTime() - AGENT_RUN_TIMEOUT_MINUTES * MIN).toISOString();
  const res = await db().from("agent_runs").update({ status: "timed_out", ended_at: clock.now.toISOString() }).eq("status", "fired").lt("started_at", cutoff).select("id, order_id, agent");
  if (res.error) throw new Error(`agent_runs timeout: ${res.error.message}`);
  const n = res.data?.length ?? 0;
  if (n) await logEventSafe({ actor: "code", action: "agent_runs_timed_out", reasoning: `${n} run(s) older than ${AGENT_RUN_TIMEOUT_MINUTES} min`, payload: { runs: res.data } });
  return `${n} timed out`;
}

/** Webhook-loss protection: every WHOP_SWEEP_EVERY_MINUTES, paid Whop payments must have a PAID+ order. */
async function whopSweepStep(clock: Clock): Promise<string> {
  if (clock.now.getUTCMinutes() % WHOP_SWEEP_EVERY_MINUTES !== 0) return "not due";
  const modes: Mode[] = [];
  if (has("WHOP_API_KEY") && has("WHOP_COMPANY_ID")) modes.push("live");
  if (has("WHOP_SANDBOX_API_KEY") && has("WHOP_SANDBOX_COMPANY_ID")) modes.push("sandbox");
  if (modes.length === 0) return "not configured";
  let recovered = 0;
  for (const mode of modes) {
    const payments = await listRecentPayments({ sinceMinutes: 60, mode });
    for (const p of payments) {
      const paid = p.status === "paid" || (p as { substatus?: string | null }).substatus === "succeeded";
      if (!paid || !p.orderId) continue;
      const order = await getOrder(p.orderId);
      if (!order || order.mode !== mode || order.stage !== "CREATED" || order.whop_payment_id) continue;
      await onPaymentSucceeded({ orderId: order.id, paymentId: p.paymentId, amountUsd: p.amountUsd, receiptUrl: null, mode });
      recovered++;
    }
  }
  if (recovered) await logEventSafe({ actor: "code", action: "whop_sweep", reasoning: `Recovered ${recovered} payment(s) missed by webhooks`, payload: { recovered, modes } });
  return `${recovered} recovered`;
}

async function partialRefundStep(clock: Clock): Promise<string> {
  const since = new Date(clock.now.getTime() - 7 * 86_400_000).toISOString();
  const rows = (must(await db().from("orders").select("*").eq("stage", "PARTIAL").gte("delivered_at", since).limit(5), "orders partial") ?? []) as OrderRow[];
  let n = 0;
  for (const raw of rows) {
    const order = await getOrder(raw.id);
    if (!order) continue;
    const { owed } = await partialRefundOwed(order);
    if (owed > 0 && (await settlePartialRefund(order.id)) > 0) n++;
  }
  return `${n} settled`;
}

async function latestEvent(orderId: string, action: string): Promise<{ payload: Record<string, unknown> | null } | null> {
  const rows = must(
    await db().from("events").select("payload, created_at").eq("order_id", orderId).eq("action", action).order("created_at", { ascending: false }).limit(1),
    "events latest",
  ) as { payload: Record<string, unknown> | null }[] | null;
  return rows?.[0] ?? null;
}

/** Specialist quote requests: request/poll a Terac quote, then email a Whop checkout link; expire after 48h. */
async function specialistQuoteStep(clock: Clock): Promise<string> {
  const rows = (must(
    await db().from("orders").select("*").eq("tier", "specialist").eq("stage", "CREATED").is("price_usd", null).order("created_at", { ascending: true }).limit(5),
    "orders specialist",
  ) ?? []) as OrderRow[];
  const out: string[] = [];
  for (const order of rows) {
    if (clock.timeLeft() < 1_000) break;
    if (order.quote_expires_at && ms(order.quote_expires_at) < clock.now.getTime()) {
      if (!(await latestEvent(order.id, "specialist_quote_expired"))) {
        await logEventSafe({ order_id: order.id, actor: "code", action: "specialist_quote_expired", reasoning: "Quote request expired after 48h" });
      }
      continue;
    }
    if (await latestEvent(order.id, "specialist_quote_ready")) continue;
    if (await latestEvent(order.id, "specialist_quote_infeasible")) continue;
    const requested = await latestEvent(order.id, "specialist_quote_requested");
    const spec = panelSpec(order);
    if (!requested) {
      const label = productLabelFromUrl(order.url);
      let desc = order.buyer_desc.replace(/\s+/g, " ").trim();
      if (label) desc = desc.replace(new RegExp(label, "gi"), "the product");
      const q = await requestQuote({
        taskDescription: taskDescription(spec),
        panelDescription: desc.slice(0, 400),
        submissionCount: TIERS.specialist.jurors,
        timelineHours: TIERS.specialist.deadlineHours,
        loiMinutes: spec.minutes,
      });
      await logEventSafe({ order_id: order.id, actor: "code", action: "specialist_quote_requested", payload: { feasibility_id: q.id } });
      out.push("requested");
      continue;
    }
    const fid = String(requested.payload?.feasibility_id ?? "");
    if (!fid) continue;
    const q = await getQuote(fid);
    if (q.costPerParticipant !== null && q.costPerParticipant > 0) {
      const price = SPECIALIST_PRICE(q.costPerParticipant, TIERS.specialist.jurors);
      const base = env().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
      const co = await createCheckout({ orderId: order.id, amountUsd: price, title: "JuryHour Specialist Jury", mode: order.mode, redirectUrl: `${base}/o/${order.token}?paid=1` });
      must(await db().from("orders").update({ price_usd: price, whop_checkout_id: co.checkoutId }).eq("id", order.id).is("price_usd", null), "orders specialist price");
      await sendEmail({
        template: "quote_ready",
        to: order.email,
        vars: { token: order.token, price_usd: price, purchase_url: co.purchaseUrl, expires_at: order.quote_expires_at, order_id: order.id },
      });
      await logEventSafe({ order_id: order.id, actor: "code", action: "specialist_quote_ready", reasoning: `Quoted $${q.costPerParticipant}/juror → price $${price}`, payload: { feasibility_id: fid, cpi: q.costPerParticipant, price } });
      out.push("priced");
    } else if (["LOST", "NOT_PURSUED"].includes(String(q.status).toUpperCase())) {
      await logEventSafe({ order_id: order.id, actor: "code", action: "specialist_quote_infeasible", reasoning: `Terac status ${q.status}` });
      await incidentOnce("specialist_infeasible", `Specialist quote ${fid} came back ${q.status}`, order.id);
      out.push("infeasible");
    }
  }
  return out.join(", ") || "none";
}

/** Preview follow-ups: +15 min and +24h, never after a purchase, respecting suppressions, max 2 per preview. */
async function followupStep(clock: Clock): Promise<string> {
  const now = clock.now.getTime();
  const iso = (offset: number) => new Date(now - offset).toISOString();
  const first = (must(
    await db().from("previews").select("*").eq("safety_verdict", "allow").is("followup_1_sent_at", null).not("email", "is", null)
      .lte("created_at", iso(FOLLOWUP_1_AFTER_MINUTES * MIN)).gte("created_at", iso(24 * 60 * MIN)).order("created_at", { ascending: true }).limit(MAX_FOLLOWUPS_PER_RUN),
    "previews followup 1",
  ) ?? []) as PreviewRow[];
  const second = (must(
    await db().from("previews").select("*").eq("safety_verdict", "allow").not("followup_1_sent_at", "is", null).is("followup_2_sent_at", null).not("email", "is", null)
      .lte("created_at", iso(FOLLOWUP_2_AFTER_HOURS * 60 * MIN)).gte("created_at", iso(72 * 60 * MIN)).order("created_at", { ascending: true }).limit(MAX_FOLLOWUPS_PER_RUN),
    "previews followup 2",
  ) ?? []) as PreviewRow[];

  const seen = new Set<string>();
  let sent = 0;
  let skipped = 0;
  const jobs: [PreviewRow, 1 | 2][] = [...first.map((p) => [p, 1] as [PreviewRow, 1]), ...second.map((p) => [p, 2] as [PreviewRow, 2])];
  for (const [p, n] of jobs) {
    if (sent >= MAX_FOLLOWUPS_PER_RUN || clock.timeLeft() < 1_000) break;
    const email = (p.email ?? "").trim();
    const lower = email.toLowerCase();
    const col = n === 1 ? "followup_1_sent_at" : "followup_2_sent_at";
    const mark = async () => must(await db().from("previews").update({ [col]: clock.now.toISOString() }).eq("id", p.id), "previews mark");
    if (!email) {
      await mark();
      continue;
    }
    if (seen.has(lower)) continue; // one follow-up per address per run
    seen.add(lower);
    const bought = must(await db().from("orders").select("id").in("email", [...new Set([email, lower])]).not("paid_at", "is", null).limit(1), "orders bought") as unknown[] | null;
    const suppressed = must(await db().from("email_suppressions").select("email").eq("email", lower).maybeSingle(), "suppressions");
    if ((bought && bought.length) || suppressed) {
      await mark(); // never retry: purchased or unsubscribed
      skipped++;
      continue;
    }
    const vars: Record<string, string | number | null> = { preview_id: p.id };
    if (n === 1) vars.weakest_line = p.weakest_line ?? null;
    const res = await sendEmail({ template: n === 1 ? "preview_followup_1" : "preview_followup_2", to: email, vars });
    if (res.skipped === "not_configured") {
      await incidentOnce("not_configured", "RESEND_API_KEY is not configured", null);
      return `not configured (${jobs.length} due)`;
    }
    await mark();
    if (res.skipped) skipped++;
    else sent++;
  }
  return `${sent} sent, ${skipped} skipped`;
}

