// POST /api/quote — retired (pricing v3, 2026-10). Specialist Jury is no longer sold, so new quote
// requests are refused with 400 tier_not_offered. Historical specialist orders (already CREATED with a
// quote, or paid) keep working through the reconciler and the Whop webhook; nothing here touches them.
// out { ok:false, code: "tier_not_offered", error }
import { randomUUID } from "node:crypto";
import { BUYABLE_TIERS_TEXT } from "@/lib/pricing";
import { fail } from "../checkout/_shared";

export async function POST() {
  return fail(
    400,
    "tier_not_offered",
    `Custom quotes are no longer offered. We sell ${BUYABLE_TIERS_TEXT}.`,
    randomUUID(),
  );
}
