// Marketing-site data (docs/WEBSITE_CONTRACTS.md §2 B). Server-only, cached reads so the home and
// pricing shells stay static: every function here is "use cache" with cacheLife("minutes").
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { activeCoupon, type PublicCoupon } from "@/lib/coupons";
import { getShellPrices } from "@/lib/queries";
import { BUYABLE_TIERS, type TierName } from "@/lib/constants";

export type LiveCounters = {
  verdictsDelivered: number;
  peopleHeard: number;
  avgDeliveryMinutes: number | null;
};

export const ZERO_COUNTERS: LiveCounters = { verdictsDelivered: 0, peopleHeard: 0, avgDeliveryMinutes: null };

/** Uncached read (exported for tests). Live mode only; throws on any DB error. */
export async function readLiveCounters(): Promise<LiveCounters> {
  const sb = db();
  const [delivered, heard, times] = await Promise.all([
    sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("mode", "live")
      .in("stage", ["DELIVERED", "PARTIAL"]),
    // Approved responses whose panel ran in live mode (sandbox jurors never count).
    sb
      .from("responses")
      .select("id, panels!inner(mode)", { count: "exact", head: true })
      .eq("decision", "approved")
      .eq("panels.mode", "live"),
    sb
      .from("orders")
      .select("paid_at, delivered_at")
      .eq("mode", "live")
      .in("stage", ["DELIVERED", "PARTIAL"])
      .not("paid_at", "is", null)
      .not("delivered_at", "is", null)
      .limit(10000),
  ]);
  for (const r of [delivered, heard, times]) {
    if (r.error) throw new Error(`live counters: ${r.error.message}`);
  }
  return {
    verdictsDelivered: delivered.count ?? 0,
    peopleHeard: heard.count ?? 0,
    avgDeliveryMinutes: averageMinutes((times.data ?? []) as { paid_at: string | null; delivered_at: string | null }[]),
  };
}

/** Mean of (delivered_at − paid_at) in whole minutes; null when there is nothing to average. */
export function averageMinutes(rows: { paid_at: string | null; delivered_at: string | null }[]): number | null {
  const mins: number[] = [];
  for (const r of rows) {
    if (!r.paid_at || !r.delivered_at) continue;
    const d = (new Date(r.delivered_at).getTime() - new Date(r.paid_at).getTime()) / 60000;
    if (Number.isFinite(d) && d >= 0) mins.push(d);
  }
  if (mins.length === 0) return null;
  return Math.round(mins.reduce((s, m) => s + m, 0) / mins.length);
}

/** Honest public counters: verdicts delivered, real people heard, average delivery time. Zeros on error. */
export async function getLiveCounters(): Promise<LiveCounters> {
  "use cache";
  cacheLife("minutes");
  cacheTag("counters");
  try {
    return await readLiveCounters();
  } catch (e) {
    console.error("[marketing] live counters failed", (e as Error).message);
    return ZERO_COUNTERS;
  }
}

export type PricingSnapshot = {
  /** Prices of the tiers sold at checkout only (retired tiers never reach the page). */
  prices: Partial<Record<TierName, number | null>>;
  /** The Verdict coupon while it runs (evaluated inside the cache; the UI also hides it at endsAt). */
  coupon: PublicCoupon | null;
  /** When the snapshot was taken (ISO). Use it instead of the clock in server components. */
  asOf: string;
};

/**
 * Prices + the Verdict coupon as of the (cached) render: the prices table, constants as fallback.
 * /api/checkout reads the same table and validates the coupon by the real time.
 */
export async function getPricingSnapshot(): Promise<PricingSnapshot> {
  "use cache";
  cacheLife("minutes");
  cacheTag("prices");
  const all = await getShellPrices();
  const prices = Object.fromEntries(BUYABLE_TIERS.map((t) => [t, all[t]])) as Partial<Record<TierName, number | null>>;
  const now = new Date();
  let coupon: PublicCoupon | null = null;
  try {
    coupon = activeCoupon(now);
  } catch (e) {
    console.error("[marketing] coupon unavailable", (e as Error).message);
  }
  return { prices, coupon, asOf: now.toISOString() };
}

/** Sales-paused flag for the capacity notice. Cached; false on error (checkout still enforces it). */
export async function getSalesPaused(): Promise<boolean> {
  "use cache";
  cacheLife("minutes");
  cacheTag("company_state");
  try {
    const res = await db().from("company_state").select("sales_paused").eq("id", 1).maybeSingle();
    if (res.error) return false;
    return Boolean(res.data?.sales_paused);
  } catch {
    return false;
  }
}
