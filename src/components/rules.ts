// Pure, framework-free logic shared by the frontend pages and API routes (Workstream A).
// No DB, no React, no Next imports: everything here is unit-tested in tests/frontend.
import { TIERS, type TierName } from "@/lib/constants";
import type { Stage } from "@/lib/types";

// ---------------------------------------------------------------- tokens & src

/** Order tokens are 32 random bytes base64url (43 chars). The RPC also requires length >= 32. */
export function isValidToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// `?src=` attribution helpers are owned by Workstream F; re-exported so pages share one rule.
export { SRC_COOKIE, normalizeSrc } from "@/lib/analytics";

// ---------------------------------------------------------------- money & time

export function usd(n: number | null | undefined, opts: { cents?: boolean } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const cents = opts.cents ?? !Number.isInteger(n);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

/** "3h 20m", "45m", "2d 4h", "<1m". */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(Math.abs(ms) / 60_000);
  if (totalMin < 1) return "<1m";
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** ETA line for the order status page, from orders.deadline_at. */
export function etaText(deadlineIso: string | null, nowMs: number): string | null {
  if (!deadlineIso) return null;
  const t = Date.parse(deadlineIso);
  if (Number.isNaN(t)) return null;
  const diff = t - nowMs;
  if (diff <= 0) return "Past the deadline: we're wrapping up with the jurors we have.";
  return `Verdict due within ${formatDuration(diff)}.`;
}

/** Age of something (e.g. time in stage) for the ops table. */
export function ageText(sinceIso: string | null, nowMs: number): string {
  if (!sinceIso) return "–";
  const t = Date.parse(sinceIso);
  if (Number.isNaN(t)) return "–";
  return formatDuration(nowMs - t);
}

// ---------------------------------------------------------------- order progress

export const TERMINAL_STAGES: readonly Stage[] = ["DELIVERED", "PARTIAL", "REFUNDED", "FAILED", "BLOCKED"];

export function isTerminal(stage: Stage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

export type StepState = "done" | "active" | "todo";
export type ProgressStep = { key: string; label: string; state: StepState };

/**
 * Progress steps (SPEC §9): Paid → Researching → Writing challenger → Jury X of N → Verdict ready.
 * Spark/Pulse have no challenger card, so step 3 reads "Writing your test".
 */
export function progressSteps(i: {
  stage: Stage;
  tier: string;
  approvedN: number;
  requestedN: number | null;
}): ProgressStep[] {
  const hasChallenger = i.tier === "proof" || i.tier === "launch_pack" || i.tier === "specialist";
  const n = i.requestedN ?? jurorsForTier(i.tier);
  const labels = [
    { key: "paid", label: "Paid ✅" },
    { key: "research", label: "Researching your market 🔍" },
    { key: "write", label: hasChallenger ? "Writing your challenger ✍️" : "Writing your test ✍️" },
    { key: "jury", label: `Jury: ${Math.min(i.approvedN, n)} of ${n} done 🧑‍⚖️` },
    { key: "verdict", label: "Verdict ready 📄" },
  ];
  // index of the step currently in progress (steps before it are done)
  const activeIndex: Record<Stage, number> = {
    CREATED: 0,
    PAID: 1,
    RESEARCHING: 1,
    QUOTING: 3,
    PANEL_LIVE: 3,
    GRADING: 3,
    SYNTHESIZING: 4,
    DELIVERED: 5,
    PARTIAL: 5,
    REFUNDED: -1,
    FAILED: -1,
    BLOCKED: -1,
  };
  const at = activeIndex[i.stage];
  return labels.map((s, idx) => ({
    ...s,
    state: at === -1 ? "todo" : idx < at ? "done" : idx === at ? "active" : "todo",
  }));
}

export function jurorsForTier(tier: string): number {
  return tier in TIERS ? TIERS[tier as TierName].jurors : 0;
}

/** Human-readable notice for refunds / failures on the status page. */
export function refundNotice(i: { stage: Stage; refundUsd: number }): string | null {
  const amt = usd(i.refundUsd);
  switch (i.stage) {
    case "REFUNDED":
      return i.refundUsd > 0
        ? `We refunded ${amt} to your original payment method. We couldn't deliver a verdict we'd stand behind.`
        : "This order was refunded.";
    case "FAILED":
      return "Something failed on our side. A full refund is being issued automatically.";
    case "PARTIAL":
      return i.refundUsd > 0
        ? `Fewer jurors finished than you paid for, so we refunded ${amt} for the missing ones.`
        : "Fewer jurors finished than planned. Your report shows exactly how many.";
    case "BLOCKED":
      return "We can't test this product.";
    default:
      return i.refundUsd > 0 ? `${amt} has been refunded on this order.` : null;
  }
}

export function stageHeadline(stage: Stage, paidParam: boolean): string {
  switch (stage) {
    case "CREATED":
      return paidParam ? "Confirming your payment…" : "Waiting for payment";
    case "PAID":
    case "RESEARCHING":
      return "Our researcher is reading your page";
    case "QUOTING":
      return "Recruiting your jury";
    case "PANEL_LIVE":
      return "Your jury is at work";
    case "GRADING":
      return "Checking every answer";
    case "SYNTHESIZING":
      return "Writing your verdict";
    case "DELIVERED":
      return "Your verdict is ready";
    case "PARTIAL":
      return "Your verdict is ready (short jury)";
    case "REFUNDED":
      return "Refunded";
    case "FAILED":
      return "This order failed";
    case "BLOCKED":
      return "We can't test this product";
  }
}

// ---------------------------------------------------------------- OG access rule

/**
 * Who may see a verdict share card at /api/og/verdict/[ref]:
 *  - `ref` is the order token → the holder is the customer → allowed.
 *  - `ref` is the order id (used on the public landing page so tokens never leak) → allowed only
 *    when the customer opted in (`report_public`) or `?t=` carries the order's token.
 * A report must exist either way.
 */
export function canViewOg(i: {
  ref: string;
  t: string | null;
  order: { id: string; token: string; report_public: boolean; has_report: boolean } | null;
}): boolean {
  if (!i.order || !i.order.has_report) return false;
  if (i.ref === i.order.token) return true;
  if (i.ref !== i.order.id) return false;
  return i.order.report_public || (i.t !== null && i.t === i.order.token);
}

// ---------------------------------------------------------------- ops metrics

export type LedgerRow = { mode: "live" | "sandbox"; kind: string; amount_usd: number | string };

export type LedgerSummary = {
  revenue: number;
  refunds: number; // positive dollars refunded
  teracCost: number;
  aiCost: number;
  exaCost: number;
  whopFees: number;
  otherCost: number; // affiliate + ads
  net: number; // revenue - refunds - all costs
  grossMargin: number | null; // net / (revenue - refunds), null when no net revenue
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Sums ledger rows for one mode. Costs and refunds are reported as positive dollars. */
export function summarizeLedger(rows: LedgerRow[], mode: "live" | "sandbox"): LedgerSummary {
  const sum: Record<string, number> = {};
  for (const r of rows) {
    if (r.mode !== mode) continue;
    sum[r.kind] = (sum[r.kind] ?? 0) + Number(r.amount_usd);
  }
  const abs = (k: string) => Math.abs(sum[k] ?? 0);
  const revenue = sum.revenue ?? 0;
  const refunds = abs("refund");
  const teracCost = abs("terac_cost");
  const aiCost = abs("ai_cost");
  const exaCost = abs("exa_cost");
  const whopFees = abs("whop_fee");
  const otherCost = abs("affiliate") + abs("ads");
  const netRevenue = revenue - refunds;
  const net = netRevenue - teracCost - aiCost - exaCost - whopFees - otherCost;
  return {
    revenue: r2(revenue),
    refunds: r2(refunds),
    teracCost: r2(teracCost),
    aiCost: r2(aiCost),
    exaCost: r2(exaCost),
    whopFees: r2(whopFees),
    otherCost: r2(otherCost),
    net: r2(net),
    grossMargin: netRevenue > 0 ? Math.round((net / netRevenue) * 1000) / 1000 : null,
  };
}

export type FunnelRow = { src: string; previews: number; checkouts: number; paidLive: number; paidSandbox: number };

/** Funnel by marketing channel: previews → orders created (checkouts) → paid. Null src = "direct". */
export function funnelBySrc(
  previews: { src: string | null }[],
  orders: { src: string | null; paid_at: string | null; mode: "live" | "sandbox" }[],
): FunnelRow[] {
  const map = new Map<string, FunnelRow>();
  const row = (src: string | null) => {
    const k = src || "direct";
    let r = map.get(k);
    if (!r) {
      r = { src: k, previews: 0, checkouts: 0, paidLive: 0, paidSandbox: 0 };
      map.set(k, r);
    }
    return r;
  };
  for (const p of previews) row(p.src).previews++;
  for (const o of orders) {
    const r = row(o.src);
    r.checkouts++;
    if (o.paid_at) {
      if (o.mode === "live") r.paidLive++;
      else r.paidSandbox++;
    }
  }
  return [...map.values()].sort((a, b) => b.previews + b.checkouts - (a.previews + a.checkouts) || a.src.localeCompare(b.src));
}

export function pct(n: number, d: number): string {
  if (d <= 0) return "–";
  return `${Math.round((n / d) * 100)}%`;
}

// ---------------------------------------------------------------- report helpers

/** "12 of 15" style tally for the share card and report headline. */
export function tallyMarks(preferA: number | null, preferB: number | null, n: number): ("A" | "B" | "none")[] {
  const a = Math.max(0, preferA ?? 0);
  const b = Math.max(0, preferB ?? 0);
  const rest = Math.max(0, n - a - b);
  return [...Array(b).fill("B"), ...Array(a).fill("A"), ...Array(rest).fill("none")];
}

/** Spark → Proof upgrade credit shown on the Spark report (pricing truth lives in B's computePrice). */
export function upgradeCredit(i: {
  paidAtIso: string | null;
  sparkPaid: number | null;
  proofPrice: number;
  nowMs: number;
  windowHours: number;
}): { eligible: boolean; credit: number; due: number; hoursLeft: number } {
  const paid = i.paidAtIso ? Date.parse(i.paidAtIso) : NaN;
  const credit = i.sparkPaid ?? 0;
  if (Number.isNaN(paid) || credit <= 0) return { eligible: false, credit: 0, due: i.proofPrice, hoursLeft: 0 };
  const left = paid + i.windowHours * 3_600_000 - i.nowMs;
  if (left <= 0) return { eligible: false, credit: 0, due: i.proofPrice, hoursLeft: 0 };
  return { eligible: true, credit, due: r2(Math.max(0, i.proofPrice - credit)), hoursLeft: Math.ceil(left / 3_600_000) };
}

/** Plain-text version of a Card for the "Copy" button. */
export function cardToText(c: { headline: string; subheadline: string; bullets: string[]; cta: string }): string {
  return [c.headline, "", c.subheadline, "", ...c.bullets.map((b) => `• ${b}`), "", c.cta].join("\n");
}

/** Prefilled "Share on X" intent link. Never includes the private report token. */
export function shareOnXUrl(i: { verdict: string; n: number; appUrl: string }): string {
  const text = `I had ${i.n} real people judge my landing page before launch. Verdict: ${i.verdict}`;
  const url = `${i.appUrl.replace(/\/$/, "")}/?src=x_share`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

/** Mask an email for the ops dashboard (shown on a projector). */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "–";
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  return `${user.slice(0, 1)}•••@${domain}`;
}

/** Request-time clock for Server Components (call only after `await connection()`). */
export function nowMs(): number {
  return Date.now();
}
