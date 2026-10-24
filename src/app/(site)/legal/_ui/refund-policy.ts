// Refund-policy facts derived from the same constants and functions the code uses (SPEC §8,
// src/lib/guardrails.ts, src/lib/orders/reconcile.ts, agents/support.md). Never hand-type these numbers.
import { BUYABLE_TIERS, MAX_STAGE_ATTEMPTS, PANEL_GRACE_HOURS, TIERS, type TierName } from "@/lib/constants";
import { proRataRefund } from "@/lib/guardrails";

const TIER_LABEL: Record<TierName, string> = {
  spark: "Spark",
  pulse: "Pulse",
  proof: "Proof",
  launch_pack: "Launch Pack",
  specialist: "Specialist",
};

export type TierRefundRow = {
  tier: TierName;
  name: string;
  jurors: number;
  minJurors: number;
  deadlineHours: number;
  /** Support-refund lateness threshold: more than 2× the promised window after payment. */
  lateAfterHours: number;
};

/** Multiplier on the delivery window after which a late order qualifies for a support refund. */
export const LATE_MULTIPLIER = 2;
export const SUPPORT_REFUNDS_PER_ORDER = 1;
export { MAX_STAGE_ATTEMPTS, PANEL_GRACE_HOURS };

export function tierRefundRows(): TierRefundRow[] {
  const tiers: TierName[] = [...BUYABLE_TIERS, "specialist"];
  return tiers.map((tier) => {
    const t = TIERS[tier];
    return {
      tier,
      name: TIER_LABEL[tier],
      jurors: t.jurors,
      minJurors: t.minJurors,
      deadlineHours: t.deadlineHours,
      lateAfterHours: t.deadlineHours * LATE_MULTIPLIER,
    };
  });
}

/** Worked pro-rata example on the Proof tier, computed with the production formula. */
export function proRataExample() {
  const price = TIERS.proof.price;
  const requested = TIERS.proof.jurors;
  const approved = TIERS.proof.minJurors + 2;
  return { price, requested, approved, refund: proRataRefund(price, requested, approved) };
}

export function usd(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}
