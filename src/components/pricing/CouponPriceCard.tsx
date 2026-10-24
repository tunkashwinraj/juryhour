"use client";
// A PriceCard that follows the visitor's code. Verdict without HALF: "$299 launch offer · regular $499
// from Dec 1" and an ad for HALF with its end date; with HALF (?code=HALF or typed): "$149 with HALF".
// Never a strike-through: the regular price hasn't been charged yet. Other tiers render a plain card.
// The server re-validates everything at checkout (first Verdict per email, end date, tier).
import { PriceCard, type PriceCardProps } from "@/components/ui";
import { CouponCodeField } from "@/components/preview/CouponCodeField";
import { usePreview } from "@/components/preview/PreviewProvider";
import type { CtaTier } from "@/components/preview/logic";
import { couponPrice } from "@/lib/coupons";
import { VERDICT_LAUNCH_NOTE, couponEndsLabel, usd } from "./pricing-data";

export function CouponPriceCard({
  tier,
  price,
  ...card
}: Omit<PriceCardProps, "compareAt" | "priceSuffix" | "footnote"> & { tier: CtaTier }) {
  const ctx = usePreview();
  if (tier !== "proof" || price === null) return <PriceCard {...card} price={price} />;

  const coupon = ctx.coupon && ctx.coupon.tier === tier ? ctx.coupon : null;
  const applied = ctx.appliedCoupon(tier);
  if (coupon && applied) {
    return (
      <PriceCard
        {...card}
        price={couponPrice(price, applied.percentOff)}
        priceSuffix={`with ${applied.code} · first Verdict`}
        footnote={
          <>
            {applied.code} applies through {couponEndsLabel(applied.endsAt)}. Without it: {usd(price)} {VERDICT_LAUNCH_NOTE}.{" "}
            <CouponCodeField />
          </>
        }
      />
    );
  }
  return (
    <PriceCard
      {...card}
      price={price}
      priceSuffix={VERDICT_LAUNCH_NOTE}
      footnote={
        coupon ? (
          <>
            First Verdict? Code {coupon.code} makes it {usd(couponPrice(price, coupon.percentOff))} through{" "}
            {couponEndsLabel(coupon.endsAt)}. <CouponCodeField />
          </>
        ) : undefined
      }
    />
  );
}
