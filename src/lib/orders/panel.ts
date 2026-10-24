// Terac panel lifecycle: quote → launch → decide submissions → stop. Shared by the Ops API (agents)
// and the reconciler (code) so both run exactly the same checks.
import { JUROR_MIN_SECONDS, MAX_REJECT_RATE, TIERS } from "@/lib/constants";
import { db, must } from "@/lib/db";
import { checkLaunch, grossMargin, marginOk, panelSpec, refuse, round2, type PanelSpec } from "@/lib/guardrails";
import { gradeJurorResponse } from "@/lib/llm";
import {
  approveSubmission,
  createOpportunity,
  getQuote,
  getTeracContext,
  launchOpportunity,
  rejectSubmission,
  requestQuote,
  stopOpportunity,
} from "@/lib/terac";
import type { GraderResult } from "@/lib/types";
import {
  addLedger,
  errMessage,
  getCompanyState,
  getOrder,
  getPanel,
  getPanels,
  getTestById,
  incidentOnce,
  isNotConfigured,
  logEventSafe,
  mustGetOrder,
  nowIso,
  updateCompanyState,
  updatePanel,
} from "./repo";
import { StageConflictError, transition } from "./transition";
import type { Decision, OrderRow, PanelRow, ResponseRow, TestRow } from "./types";

export const REJECT_CATEGORIES = ["low_quality", "failed_instructions", "incomplete", "suspicious_patterns", "other"] as const;
export type RejectCategory = (typeof REJECT_CATEGORIES)[number];

/** Terac feasibility statuses that mean "no quote is coming" (OpenAPI: RECEIVED|RESPONDED|WON|LOST|NOT_PURSUED). */
const QUOTE_DEAD = new Set(["LOST", "NOT_PURSUED", "REJECTED", "DECLINED", "CANCELLED", "CANCELED", "EXPIRED", "INFEASIBLE"]);

// Never the product name (SPEC §21): generic task wording only.
export function taskDescription(spec: PanelSpec): string {
  return (
    `Read a short description of a product or service and answer a few questions about it in your own words ` +
    `(about ${spec.minutes} minutes). There are no right answers; honest first impressions only.`
  );
}

export function opportunityTitle(spec: PanelSpec): string {
  return `Quick opinion on a product description (${spec.minutes} min)`;
}

// ---------------------------------------------------------------- quotes

/** Requests a Terac quote and records a `panels` row (status quoting). A failed request still records
 *  the row with no feasibility id; the reconciler retries it. */
export async function requestPanelQuote(
  order: OrderRow,
  test: TestRow,
  opts: { audienceBroadened?: boolean; actor?: string } = {},
): Promise<PanelRow> {
  const spec = panelSpec(order);
  let feasibilityId: string | null = null;
  let failure: unknown = null;
  try {
    const q = await requestQuote({
      taskDescription: taskDescription(spec),
      panelDescription: test.juror_profile.panel_description,
      submissionCount: spec.maxJurors,
      timelineHours: Math.max(1, Math.round(spec.deadlineHours)),
      loiMinutes: spec.minutes,
    });
    feasibilityId = q.id;
  } catch (e) {
    failure = e;
  }
  const res = await db()
    .from("panels")
    .insert({
      order_id: order.id,
      test_id: test.id,
      mode: order.mode,
      terac_feasibility_id: feasibilityId,
      requested_n: spec.maxJurors,
      status: "quoting",
      audience_broadened: opts.audienceBroadened ?? false,
    })
    .select("*")
    .single();
  const panel = must(res, "panels insert") as PanelRow;
  await logEventSafe({
    order_id: order.id,
    actor: "code",
    action: "quote_requested",
    reasoning: failure ? `Terac quote request failed: ${errMessage(failure)}` : "Requested Terac feasibility quote",
    payload: { panel_id: panel.id, feasibility_id: feasibilityId, submission_count: spec.maxJurors, by: opts.actor ?? "code" },
  });
  if (failure) {
    await incidentOnce(isNotConfigured(failure) ? "not_configured" : "terac_error", `requestQuote: ${errMessage(failure)}`, isNotConfigured(failure) ? null : order.id);
  }
  return panel;
}

/** Retries the quote request for a panel that has no feasibility id yet. */
export async function retryPanelQuote(order: OrderRow, panel: PanelRow, test: TestRow): Promise<boolean> {
  const spec = panelSpec(order);
  const q = await requestQuote({
    taskDescription: taskDescription(spec),
    panelDescription: test.juror_profile.panel_description,
    submissionCount: panel.requested_n,
    timelineHours: Math.max(1, Math.round(spec.deadlineHours)),
    loiMinutes: spec.minutes,
  });
  await updatePanel(panel.id, { terac_feasibility_id: q.id });
  await logEventSafe({ order_id: order.id, actor: "code", action: "quote_requested", reasoning: "Retried Terac quote request", payload: { panel_id: panel.id, feasibility_id: q.id } });
  return true;
}

/** One getQuote call. Records the price or infeasibility on the panel. */
export async function pollQuote(order: OrderRow, panel: PanelRow): Promise<"priced" | "pending" | "infeasible"> {
  if (!panel.terac_feasibility_id) return "pending";
  const q = await getQuote(panel.terac_feasibility_id);
  if (q.costPerParticipant !== null && q.costPerParticipant > 0) {
    await updatePanel(panel.id, { cost_per_participant: q.costPerParticipant, status: "priced" });
    panel.cost_per_participant = q.costPerParticipant;
    panel.status = "priced";
    await logEventSafe({
      order_id: order.id,
      actor: "code",
      action: "quote_priced",
      reasoning: `Terac quoted $${q.costPerParticipant} per juror`,
      payload: { panel_id: panel.id, feasibility_id: q.id, status: q.status, cost_per_participant: q.costPerParticipant },
    });
    return "priced";
  }
  if (QUOTE_DEAD.has(String(q.status).toUpperCase())) {
    await updatePanel(panel.id, { status: "infeasible" });
    panel.status = "infeasible";
    await logEventSafe({ order_id: order.id, actor: "code", action: "quote_infeasible", reasoning: `Terac quote status ${q.status}`, payload: { panel_id: panel.id, status: q.status } });
    return "infeasible";
  }
  return "pending";
}

// ---------------------------------------------------------------- launch

export type LaunchResult = { panel_id: string; opportunity_id: string; n: number; budget_usd: number; cost_per_participant: number };

/**
 * SPEC §12 launch_panel: quote RESPONDED; n within [minJurors, jurors]; cpi·n ≤ cap; margin ≥ 30%;
 * budget ≥ $5; Terac balance covers; exactly one live panel; sales not paused → create + launch → PANEL_LIVE.
 */
export async function launchPanel(orderId: string, opts: { n?: number | null; actor: string; reason?: string }): Promise<LaunchResult> {
  const order = await mustGetOrder(orderId);
  const state = await getCompanyState();
  if (state.sales_paused) refuse("sales_paused", `Sales are paused (${state.pause_reason ?? "no reason"}); panels cannot launch`, 409);
  if (order.stage !== "QUOTING") refuse("wrong_stage", `order is in ${order.stage}, launch needs QUOTING`, 409);
  if (order.price_usd === null) refuse("not_priced", "order has no price", 409);

  const panels = await getPanels(orderId);
  if (panels.some((p) => p.status === "live")) refuse("panel_already_live", "this order already has a live panel", 409);
  const panel = panels[panels.length - 1];
  if (!panel) refuse("quote_not_ready", "no Terac quote has been requested yet", 409);
  if (panel.status === "infeasible") refuse("quote_infeasible", "Terac could not quote this audience; broaden it or refund", 422);
  if (panel.status !== "priced" || panel.cost_per_participant === null) refuse("quote_not_ready", "the Terac quote has not been answered yet", 409);
  if (!panel.terac_feasibility_id) refuse("quote_not_ready", "panel has no feasibility request id", 409);

  const spec = panelSpec(order);
  const cpi = Number(panel.cost_per_participant);
  const price = Number(order.price_usd);
  const { n, budget } = checkLaunch({ price, cpi, n: opts.n ?? null, spec });

  const ctx = await getTeracContext();
  await updateCompanyState({ terac_balance_usd: ctx.balanceDollars, terac_balance_checked_at: nowIso() });
  if (ctx.balanceDollars < budget) {
    refuse("insufficient_terac_balance", `Terac balance $${ctx.balanceDollars} does not cover the $${budget} launch budget`, 422);
  }

  const test = await getTestById(panel.test_id);
  if (!test) refuse("no_test", "the panel's test is missing", 409);

  // Claim the panel so a concurrent launch (agent + reconciler) can't create two opportunities.
  const claim = await db().from("panels").update({ launched_at: nowIso() }).eq("id", panel.id).eq("status", "priced").is("launched_at", null).select("id");
  if (claim.error) throw new Error(`panels claim: ${claim.error.message}`);
  if (!claim.data || claim.data.length === 0) refuse("launch_in_progress", "another launch of this panel is in progress", 409);

  let opportunityId = panel.terac_opportunity_id;
  try {
    if (!opportunityId || panel.requested_n !== n) {
      const opp = await createOpportunity({
        title: opportunityTitle(spec),
        numParticipants: n,
        businessType: test.juror_profile.business_type,
        description: taskDescription(spec),
        feasibilityRequestId: panel.terac_feasibility_id,
        durationMinutes: spec.minutes,
        testId: test.id,
        screeningQuestions: test.juror_profile.screening_questions ?? [],
        filters: order.tier === "specialist" ? (test.juror_profile.filters ?? []) : [],
      });
      opportunityId = opp.id;
      const total = round2(opp.totalCostCents / 100);
      await updatePanel(panel.id, { terac_opportunity_id: opp.id, requested_n: n, budget_usd: total });
      // Terac's own total is the money that will move: it must pass the same caps.
      if (total > spec.costCap + 0.01 || !marginOk(price, total / n, n)) {
        refuse("terac_cost_mismatch", `Terac priced the opportunity at $${total}, above the cap $${spec.costCap} or the margin floor`, 422, { total, cap: spec.costCap });
      }
      if (!opp.affordable) refuse("insufficient_terac_balance", "Terac reports the opportunity is not affordable with the current balance", 422);
    }
    try {
      await launchOpportunity(opportunityId);
    } catch (e) {
      if (e instanceof Error && e.name === "TeracPreconditionError") refuse("terac_precondition", `Terac refused the launch: ${e.message}`, 422);
      throw e;
    }
  } catch (e) {
    await db().from("panels").update({ launched_at: null }).eq("id", panel.id).eq("status", "priced");
    throw e;
  }

  const live = await db().from("panels").update({ status: "live", launched_at: nowIso() }).eq("id", panel.id).select("id");
  if (live.error) {
    await incidentOnce("panel_state", `Opportunity ${opportunityId} launched but panel ${panel.id} could not be marked live: ${live.error.message}`, orderId);
    throw new Error(`panels live: ${live.error.message}`);
  }
  await transition(orderId, "PANEL_LIVE", opts.reason ?? `Panel launched: ${n} jurors at $${cpi}`, {}, { from: "QUOTING", actor: opts.actor });
  await logEventSafe({
    order_id: orderId,
    actor: opts.actor,
    action: "panel_launched",
    reasoning: `Launched ${n} jurors at $${cpi} each ($${budget}); margin $${round2(grossMargin(price, cpi, n))}`,
    payload: { panel_id: panel.id, opportunity_id: opportunityId, n, budget, cpi, price },
  });
  return { panel_id: panel.id, opportunity_id: opportunityId!, n, budget_usd: budget, cost_per_participant: cpi };
}

// ---------------------------------------------------------------- stop

/**
 * Stops the order's live panel (Terac stop refunds unused budget). Terac refuses to stop while any
 * submission is awaiting_review, so by default a failed stop leaves the panel live and returns
 * { stopped: false } (callers retry next minute). `force` (refund/fail paths) marks it stopped anyway.
 */
export async function stopLivePanel(orderId: string, reason: string, opts: { force?: boolean } = {}): Promise<{ stopped: boolean; panel: PanelRow | null }> {
  const panels = await getPanels(orderId);
  const live = panels.find((p) => p.status === "live");
  if (!live) return { stopped: true, panel: null };
  if (live.terac_opportunity_id) {
    try {
      await stopOpportunity(live.terac_opportunity_id, reason);
    } catch (e) {
      await incidentOnce("terac_stop_failed", `stopOpportunity ${live.terac_opportunity_id}: ${errMessage(e)}`, orderId);
      if (!opts.force) return { stopped: false, panel: live };
    }
  }
  await updatePanel(live.id, { status: "stopped", stopped_at: nowIso() });
  await logEventSafe({ order_id: orderId, actor: "code", action: "panel_stopped", reasoning: reason, payload: { panel_id: live.id, opportunity_id: live.terac_opportunity_id } });
  return { stopped: true, panel: { ...live, status: "stopped" } };
}

// ---------------------------------------------------------------- decisions

/** grader_flags marker for submissions Terac already auto-rejected (our page redirected with result=rejected). */
export const TERAC_AUTO_REJECTED = "terac_auto_rejected";

type Counts = { approved: number; rejected: number; autoRejected: number };

export async function recountPanel(panelId: string): Promise<Counts> {
  const rows = (must(await db().from("responses").select("decision, grader_flags").eq("panel_id", panelId), "responses count") ?? []) as {
    decision: Decision | null;
    grader_flags: string[] | null;
  }[];
  const approved = rows.filter((r) => r.decision === "approved").length;
  const rejected = rows.filter((r) => r.decision === "rejected").length;
  const autoRejected = rows.filter((r) => r.decision === "rejected" && (r.grader_flags ?? []).includes(TERAC_AUTO_REJECTED)).length;
  await updatePanel(panelId, { approved_n: approved, rejected_n: rejected });
  return { approved, rejected, autoRejected };
}

/** True when our juror page already sent the juror back to Terac with result=rejected. */
export function isTeracAutoRejected(r: Pick<ResponseRow, "attention_passed" | "seconds_spent">): boolean {
  return !r.attention_passed || r.seconds_spent < JUROR_MIN_SECONDS;
}

/**
 * Closes a response Terac auto-rejected (attention failed or < JUROR_MIN_SECONDS): Terac sends no
 * awaiting_review webhook for these, so we record the rejection locally with a written reason —
 * no Terac call, no terac_cost, and not counted toward MAX_REJECT_RATE.
 */
export async function closeAutoRejected(r: ResponseRow): Promise<boolean> {
  if (r.decision !== null || !isTeracAutoRejected(r)) return false;
  const reasons: string[] = [];
  if (!r.attention_passed) reasons.push("The attention check answer was incorrect.");
  if (r.seconds_spent < JUROR_MIN_SECONDS) reasons.push(`Completed in ${r.seconds_spent}s; the minimum is ${JUROR_MIN_SECONDS}s.`);
  const flags = [TERAC_AUTO_REJECTED, ...(!r.attention_passed ? ["attention_fail"] : []), ...(r.seconds_spent < JUROR_MIN_SECONDS ? ["too_short"] : [])];
  const upd = await db()
    .from("responses")
    .update({ decision: "rejected", decided_at: nowIso(), quality_score: 0, quality_reason: reasons.join(" "), grader_flags: flags, understood_a: false })
    .eq("id", r.id)
    .is("decision", null)
    .select("id");
  if (upd.error) throw new Error(`responses auto-reject: ${upd.error.message}`);
  if (!upd.data || upd.data.length === 0) return false;
  const counts = await recountPanel(r.panel_id);
  const panel = await getPanel(r.panel_id);
  await logEventSafe({
    order_id: panel?.order_id ?? null,
    actor: "quality",
    action: "submission_auto_rejected",
    reasoning: reasons.join(" "),
    payload: { response_id: r.id, approved_n: counts.approved, rejected_n: counts.rejected },
  });
  return true;
}

/** Running reject rate if this response were rejected. Denominator is at least the requested panel size,
 *  so the first rejection on a small panel isn't read as a 100% reject rate. */
export function rejectRateIfRejected(i: { approved: number; rejected: number; requested: number }): number {
  return (i.rejected + 1) / Math.max(i.approved + i.rejected + 1, i.requested);
}

/** Quality rejections only: Terac's own auto-rejections are excluded from the rate. */
function qualityRejectRate(c: Counts, requested: number): number {
  return rejectRateIfRejected({ approved: c.approved, rejected: c.rejected - c.autoRejected, requested });
}

export type DecideResult = { decision: Decision; approved_n: number; rejected_n: number; moved_to_grading: boolean };

/**
 * Approve or reject one juror submission at Terac and record it. Rejections need a category and a
 * written reason. If rejecting would push the reject rate above MAX_REJECT_RATE we do NOT reject:
 * `onRejectRateExceeded: "hold"` marks it pending (webhook path), "refuse" refuses (Ops API); both open an incident.
 */
export async function decideResponse(i: {
  response: ResponseRow;
  decision: "approved" | "rejected";
  reason: string | null;
  category: RejectCategory | null;
  actor: string;
  grader?: (GraderResult & { approve: boolean }) | null;
  onRejectRateExceeded: "hold" | "refuse";
}): Promise<DecideResult> {
  const r = i.response;
  if (r.decision === "approved" || r.decision === "rejected") refuse("already_decided", `response already ${r.decision}`, 409);
  const panel = await getPanel(r.panel_id);
  if (!panel) refuse("not_found", "panel not found", 404);
  const order = await getOrder(panel.order_id);
  if (!order) refuse("not_found", "order not found", 404);

  const reason = (i.reason ?? "").trim();
  if (i.decision === "rejected") {
    if (reason.length < 10 || !i.category || !REJECT_CATEGORIES.includes(i.category)) {
      refuse("reason_required", "a rejection needs a category and a written reason (≥ 10 characters)", 400);
    }
    const counts = await recountPanel(panel.id);
    const rate = qualityRejectRate(counts, panel.requested_n);
    if (rate > MAX_REJECT_RATE) {
      const detail = `Rejecting response ${r.id} would make the reject rate ${(rate * 100).toFixed(0)}% (> ${MAX_REJECT_RATE * 100}%). Possible bug in the test page or grader; not rejecting.`;
      await incidentOnce("reject_rate_exceeded", detail, order.id);
      if (i.onRejectRateExceeded === "hold") {
        await db().from("responses").update({
          decision: "pending",
          quality_score: i.grader?.quality_score ?? null,
          quality_reason: reason,
          understood_a: i.grader?.understood_a ?? null,
          understood_b: i.grader?.understood_b ?? null,
          grader_flags: i.grader?.flags ?? null,
        }).eq("id", r.id).is("decision", null);
        await logEventSafe({ order_id: order.id, actor: i.actor, action: "submission_held", reasoning: detail, payload: { response_id: r.id, reason, category: i.category } });
        return { decision: "pending", approved_n: counts.approved, rejected_n: counts.rejected, moved_to_grading: false };
      }
      refuse("reject_rate_exceeded", detail, 422);
    }
  }

  // Claim the response so a concurrent webhook/reconciler/agent can't decide it twice.
  let claim = db().from("responses").update({ decision: i.decision, decided_at: nowIso() }).eq("id", r.id);
  claim = r.decision === "pending" ? claim.eq("decision", "pending") : claim.is("decision", null);
  const claimed = await claim.select("id");
  if (claimed.error) throw new Error(`responses claim: ${claimed.error.message}`);
  if (!claimed.data || claimed.data.length === 0) refuse("already_decided", "response was decided concurrently", 409);

  try {
    if (i.decision === "approved") await approveSubmission(r.terac_submission_id);
    else await rejectSubmission(r.terac_submission_id, i.category!, reason.slice(0, 1000));
  } catch (e) {
    await db().from("responses").update({ decision: r.decision, decided_at: null }).eq("id", r.id).eq("decision", i.decision);
    throw e;
  }

  await db().from("responses").update({
    quality_score: i.grader?.quality_score ?? r.quality_score ?? null,
    quality_reason: reason || i.grader?.reason || null,
    understood_a: i.grader?.understood_a ?? r.understood_a ?? null,
    understood_b: i.grader?.understood_b ?? r.understood_b ?? null,
    grader_flags: i.grader?.flags ?? r.grader_flags ?? null,
  }).eq("id", r.id);

  const counts = await recountPanel(panel.id);
  if (i.decision === "approved" && panel.cost_per_participant !== null) {
    await addLedger({
      order_id: order.id,
      mode: order.mode,
      kind: "terac_cost",
      amount_usd: -Number(panel.cost_per_participant),
      ref: r.terac_submission_id,
      note: `juror approved (response ${r.id})`,
    });
  }
  await logEventSafe({
    order_id: order.id,
    actor: i.actor,
    action: i.decision === "approved" ? "submission_approved" : "submission_rejected",
    reasoning: reason || null,
    payload: { response_id: r.id, category: i.category, score: i.grader?.quality_score ?? null, flags: i.grader?.flags ?? null, approved_n: counts.approved, requested_n: panel.requested_n },
  });

  let moved = false;
  if (counts.approved >= panel.requested_n && order.stage === "PANEL_LIVE") {
    moved = await finishPanel(order.id, `Panel full: ${counts.approved}/${panel.requested_n} approved`);
  }
  return { decision: i.decision, approved_n: counts.approved, rejected_n: counts.rejected, moved_to_grading: moved };
}

/** PANEL_LIVE → GRADING (stops the Terac opportunity first). Returns false if the order already moved. */
export async function finishPanel(orderId: string, reason: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const stop = await stopLivePanel(orderId, reason, { force: opts.force });
  if (!stop.stopped) return false; // Terac still has awaiting_review submissions; retry next minute
  try {
    await transition(orderId, "GRADING", reason, {}, { from: "PANEL_LIVE" });
    return true;
  } catch (e) {
    if (e instanceof StageConflictError) return false;
    throw e;
  }
}

export function categoryFromFlags(flags: readonly string[]): RejectCategory {
  if (flags.includes("attention_fail")) return "failed_instructions";
  if (flags.includes("too_short")) return "incomplete";
  if (flags.includes("ai_pasted")) return "suspicious_patterns";
  return "low_quality";
}

/** Grade with the LLM grader (code rules first) and decide. Juror text is data: it only ever feeds the grader. */
export async function gradeAndDecide(response: ResponseRow): Promise<DecideResult> {
  if (await closeAutoRejected(response)) {
    const p = await getPanel(response.panel_id);
    return { decision: "rejected", approved_n: p?.approved_n ?? 0, rejected_n: p?.rejected_n ?? 0, moved_to_grading: false };
  }
  const test = await getTestById(response.test_id);
  if (!test) throw new Error(`test ${response.test_id} missing for response ${response.id}`);
  const panel = await getPanel(response.panel_id);
  const g = await gradeJurorResponse({
    answers: response.answers,
    cardA: test.card_a,
    cardB: test.card_b,
    attentionPassed: response.attention_passed,
    secondsSpent: response.seconds_spent,
  });
  if (g.costUsd > 0 && panel) {
    await addLedger({ order_id: panel.order_id, mode: panel.mode, kind: "ai_cost", amount_usd: -g.costUsd, note: `grader ${response.id}` });
  }
  if (g.approve) {
    return decideResponse({ response, decision: "approved", reason: g.reason, category: null, actor: "quality", grader: g, onRejectRateExceeded: "hold" });
  }
  const reason = g.reason && g.reason.trim().length >= 10 ? g.reason : `Did not meet the quality bar (${g.flags.join(", ") || "low quality"}).`;
  return decideResponse({ response, decision: "rejected", reason, category: categoryFromFlags(g.flags), actor: "quality", grader: g, onRejectRateExceeded: "hold" });
}

export function tierFormat(order: Pick<OrderRow, "tier">) {
  return TIERS[order.tier].format;
}

/**
 * A Terac submission awaiting review with no stored answers (the juror never submitted our test page).
 * At the deadline these block stopOpportunity, so they are rejected with a written reason. No terac_cost.
 */
export async function rejectOrphanSubmission(orderId: string, submissionId: string): Promise<void> {
  const reason = "No answers were received on the test page before the deadline.";
  await rejectSubmission(submissionId, "incomplete", reason);
  await logEventSafe({ order_id: orderId, actor: "quality", action: "submission_rejected", reasoning: reason, payload: { terac_submission_id: submissionId, orphan: true } });
}
