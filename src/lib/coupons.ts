// Verdict coupons (founder decision 2026-10, pricing v3). Server-side truth: /api/checkout validates and
// applies them; the site only displays what this module says. Pure helpers take `now` explicitly.
//
// HALF: 50% off the Verdict (proof) base price ($299 → $149, rounded DOWN to whole dollars), first
// Verdict per customer (no earlier PAID proof order for that email in the same mode), until
// COUPON_HALF_ENDS_AT (default 2026-12-01T05:00:00Z = end of Nov 30 ET). Never discounts extra jurors.
// It MAY combine with the $11 Quick Read upgrade credit ($149 − $11 = $138); the 30% margin check in
// computePrice still runs on the result.
//
// Env (optional, read tolerantly so a typo can never take the app down):
//   COUPON_HALF_ENDS_AT  ISO end time; a past time switches HALF off.
import type { TierName } from "./constants";

export type Coupon = {
  code: string;
  tier: TierName;
  percentOff: number;
  endsAt: string;
  /** Only for a customer's first paid order of `tier` (same email + mode). */
  firstOrderOnly: boolean;
};

/** What the browser may know about the coupon (it is public: it is advertised on the Verdict card). */
export type PublicCoupon = Coupon;

export const HALF_DEFAULT: Coupon = {
  code: "HALF",
  tier: "proof",
  percentOff: 50,
  endsAt: "2026-12-01T05:00:00.000Z",
  firstOrderOnly: true,
};
/** Back-compat alias: the default (and only) coupon. */
export const DEFAULT_COUPON = HALF_DEFAULT;

/** The configured coupon (env override for the end time; invalid values fall back to the default). */
export function configuredCoupon(e: Record<string, string | undefined> = process.env): Coupon {
  const ends = (e.COUPON_HALF_ENDS_AT ?? "").trim();
  const endsMs = ends ? Date.parse(ends) : NaN;
  return { ...HALF_DEFAULT, endsAt: Number.isFinite(endsMs) ? new Date(endsMs).toISOString() : HALF_DEFAULT.endsAt };
}

export function isCouponLive(c: Coupon, now: Date): boolean {
  const ends = Date.parse(c.endsAt);
  return Number.isFinite(ends) && now.getTime() < ends;
}

/** The coupon while it is running, else null (for display). */
export function activeCoupon(now: Date = new Date(), c: Coupon = configuredCoupon()): PublicCoupon | null {
  return isCouponLive(c, now) ? c : null;
}

const ET_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

/** Last ET day the coupon is valid: 2026-12-01T05:00Z (midnight ET starting Dec 1) → "Nov 30". */
export function couponEndsLabel(endsAt: string): string {
  return ET_DATE.format(new Date(Date.parse(endsAt) - 1));
}

export function sameCode(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b) && String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
}

/** Discounted base price: whole dollars, rounded down (never below $1). */
export function couponPrice(base: number, percentOff: number): number {
  return Math.max(1, Math.floor(base * (1 - percentOff / 100) + 1e-9));
}

export type CouponRefusalCode = "coupon_unknown" | "coupon_expired" | "coupon_not_applicable" | "coupon_already_used";

export type CouponCheck =
  | { ok: true; coupon: Coupon }
  | { ok: false; code: CouponRefusalCode; message: string };

/**
 * Strict check for a code the buyer asked to apply as a discount. `priorPaidOrders` = paid orders of
 * the coupon's tier for this email + mode (pass it when the coupon is first-order-only).
 */
export function checkCoupon(i: { code: string; tier: TierName; now: Date; priorPaidOrders?: number; coupon?: Coupon }): CouponCheck {
  const c = i.coupon ?? configuredCoupon();
  if (!sameCode(i.code, c.code)) {
    return { ok: false, code: "coupon_unknown", message: `"${i.code.slice(0, 40)}" isn't a discount code we recognise.` };
  }
  if (!isCouponLive(c, i.now)) {
    return { ok: false, code: "coupon_expired", message: `${c.code} has ended. The Verdict is back to its launch price without it.` };
  }
  if (i.tier !== c.tier) {
    return { ok: false, code: "coupon_not_applicable", message: `${c.code} only applies to the Verdict.` };
  }
  if (c.firstOrderOnly && (i.priorPaidOrders ?? 0) > 0) {
    return {
      ok: false,
      code: "coupon_already_used",
      message: `${c.code} is for your first Verdict, and this email already has one. Remove the code to continue.`,
    };
  }
  return { ok: true, coupon: c };
}
