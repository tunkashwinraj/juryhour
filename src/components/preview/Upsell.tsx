"use client";
// The step after a preview (WEBSITE_SPEC §7.3): compact tier cards — Quick Read and Verdict
// [VERDICT_BADGE], or Retest + Verdict when arriving from the link in a Verdict report
// (?tier=retest&parent=<order id>) — an extra-jurors stepper ($16 each, 0–20) with live totals, the code
// field (LAUNCH20 or a referral code), and the capacity state. On a Quick Read upgrade link
// (?tier=proof&parent=<order id>) the Verdict card says which single discount checkout will apply: the
// code and the upgrade credit never combine (bestVerdictDiscount, same rule as /api/checkout).
// Prices come from the server via props (HeroPreview `prices`); /api/checkout re-checks everything.
import { useId } from "react";
import { Badge, Banner, Card } from "@/components/ui";
import { EXTRA_JUROR_USD, MAX_EXTRA_JURORS, TIERS, UPGRADE_CREDIT_HOURS, VERDICT_BADGE } from "@/lib/constants";
import { VERDICT_LAUNCH_NOTE, couponEndsLabel } from "@/components/pricing/pricing-data";
import { bestVerdictDiscount, couponPrice } from "@/lib/coupons";
import { usd } from "@/components/rules";
import { CouponCodeField } from "./CouponCodeField";
import { TIER_LABELS, allowsExtraJurors, clampExtraJurors, displayPrice, type CtaTier, type PriceMap } from "./logic";
import { TierCta } from "./TierCta";
import { TrackOnView, usePreview } from "./PreviewProvider";
import { WaitlistForm } from "./LeadForms";
import styles from "./preview.module.css";

const SUMMARY: Record<CtaTier, string> = {
  spark: "first impression of your headline",
  proof: "your page vs our rewrite, judged blind",
  retest: "your updated page vs a fresh rewrite",
  specialist: "custom panel",
};

export function CapacityBanner() {
  const { salesPaused } = usePreview();
  if (!salesPaused) return null;
  return (
    <Banner tone="warn">
      <p>
        <strong>We&apos;re at capacity, so buying is paused.</strong> Real-people juries reopen as soon as we have room.
        Your free preview still works.
      </p>
      <WaitlistForm intro={null} />
    </Banner>
  );
}

export function Upsell({
  prices,
  title = "This is AI guessing. Want real people to judge it?",
}: {
  prices?: PriceMap;
  title?: string;
}) {
  const ctx = usePreview();
  const stepperId = useId();

  if (ctx.refused) return null;

  // A Retest only makes sense with the parent Verdict from the report link; without it, don't offer it.
  const wantsRetest = ctx.selectedTier === "retest" && Boolean(ctx.parentOrderId);
  const tiers: CtaTier[] = wantsRetest ? ["retest", "proof"] : ["spark", "proof"];
  const emphasized: CtaTier = wantsRetest ? "retest" : ctx.selectedTier && tiers.includes(ctx.selectedTier) ? ctx.selectedTier : "proof";
  const quickReadPrice = displayPrice("spark", prices) ?? TIERS.spark.price;
  // Upgrade link from a Quick Read report: the credit may apply (the server checks the 24h window).
  const upgrading = !wantsRetest && Boolean(ctx.parentOrderId);
  const extra = ctx.extraJurors;
  const extraUsd = extra * EXTRA_JUROR_USD;

  return (
    <div className={styles.upsell}>
      <TrackOnView event="pricing_viewed" props={{ where: "preview_upsell" }} />
      <h3 className={styles.upsellTitle}>{title}</h3>
      <p className={styles.small}>
        Real, identity-verified people who match your buyer, recruited through Terac. A directional signal, not a sales
        guarantee. Your preview is attached, so there&apos;s nothing to fill in again.
      </p>
      <CapacityBanner />

      <ul className={styles.tierList}>
        {tiers.map((t) => {
          const list = displayPrice(t, prices);
          const applied = ctx.appliedCoupon(t);
          // Code + upgrade link: show which single discount checkout will apply.
          const best =
            t === "proof" && upgrading && list !== null && applied
              ? bestVerdictDiscount({ listUsd: list, coupon: applied, creditUsd: quickReadPrice })
              : null;
          const base = best ? best.baseUsd : list !== null && applied ? couponPrice(list, applied.percentOff) : list;
          const extras = allowsExtraJurors(t);
          const isEm = t === emphasized;
          const advertised = !applied && ctx.coupon && ctx.coupon.tier === t && list !== null ? ctx.coupon : null;
          return (
            <li key={t}>
              <Card tone={isEm ? "raised" : "plain"}>
                <div className={styles.tierHead}>
                  <span className={styles.tierName}>{TIER_LABELS[t]}</span>
                  {t === "proof" ? <Badge tone="signal">{VERDICT_BADGE}</Badge> : null}
                </div>
                <p className={styles.tierPrice}>
                  {usd(base)}
                  {best?.kind === "credit" ? (
                    <span className={styles.compareAt}> with your Quick Read credit</span>
                  ) : applied ? (
                    <span className={styles.compareAt}> with {applied.code} · first Verdict</span>
                  ) : t === "proof" ? (
                    <span className={styles.compareAt}> {VERDICT_LAUNCH_NOTE}</span>
                  ) : null}
                  {extras && extra > 0 && base !== null ? (
                    <span className={styles.withAddons}>
                      {" "}
                      · {usd(base + extraUsd)} with {extra} extra {extra === 1 ? "juror" : "jurors"}
                    </span>
                  ) : null}
                </p>
                <p className={styles.small}>
                  {extras ? `${TIERS[t as "spark" | "proof" | "retest"].jurors + extra} real people · ` : null}
                  {SUMMARY[t]}
                </p>
                {best && applied ? (
                  <p className={styles.small}>
                    {best.kind === "coupon"
                      ? `${applied.code} (${usd(best.couponUsd)} off) saves more than your Quick Read credit (${usd(quickReadPrice)}). They don't combine, so checkout applies ${applied.code}.`
                      : `Your Quick Read credit (${usd(best.creditUsd)} off) saves more than ${applied.code}. They don't combine, so checkout applies the credit.`}
                  </p>
                ) : t === "proof" && upgrading ? (
                  <p className={styles.small}>
                    Your {usd(quickReadPrice)} Quick Read comes off this Verdict at checkout if you paid for it in the last{" "}
                    {UPGRADE_CREDIT_HOURS} hours.
                  </p>
                ) : null}
                {advertised && list !== null ? (
                  <p className={styles.small}>
                    {advertised.percentOff}% off your first Verdict with code {advertised.code} until{" "}
                    {couponEndsLabel(advertised.endsAt)} → {usd(couponPrice(list, advertised.percentOff))}
                    {upgrading ? ". It doesn't combine with your Quick Read credit; checkout applies the bigger saving." : "."}
                  </p>
                ) : null}
                <TierCta tier={t} variant={isEm ? "primary" : "secondary"} />
              </Card>
            </li>
          );
        })}
      </ul>

      {!ctx.salesPaused ? (
        <fieldset className={styles.addons}>
          <legend>Extra jurors (optional)</legend>
          <div className={styles.stepper}>
            <button
              type="button"
              className={styles.stepBtn}
              aria-label="One fewer extra juror"
              aria-controls={stepperId}
              disabled={extra <= 0}
              onClick={() => ctx.setExtraJurors(extra - 1)}
            >
              −
            </button>
            <input
              id={stepperId}
              className={styles.stepInput}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_EXTRA_JURORS}
              step={1}
              value={extra}
              aria-label={`Extra jurors, 0 to ${MAX_EXTRA_JURORS}, ${usd(EXTRA_JUROR_USD)} each`}
              onChange={(e) => ctx.setExtraJurors(clampExtraJurors(e.target.value))}
            />
            <button
              type="button"
              className={styles.stepBtn}
              aria-label="One more extra juror"
              aria-controls={stepperId}
              disabled={extra >= MAX_EXTRA_JURORS}
              onClick={() => ctx.setExtraJurors(extra + 1)}
            >
              +
            </button>
            <span className={styles.small} aria-live="polite">
              {usd(EXTRA_JUROR_USD)} each, up to {MAX_EXTRA_JURORS}
              {extra > 0 ? ` · +${usd(extraUsd)}` : ""}. Codes and credits never change this part.
            </span>
          </div>
        </fieldset>
      ) : null}

      <p className={styles.small}>
        {wantsRetest
          ? "Your updated page goes to a new jury, against a fresh rewrite. Use the same email as your Verdict."
          : `Start with a Quick Read? Your ${usd(quickReadPrice)} counts toward a Verdict for ${UPGRADE_CREDIT_HOURS} hours. One discount per order: the credit and a code don't combine, and checkout applies the bigger saving.`}
      </p>

      <div className={styles.codeRow}>
        <CouponCodeField />
      </div>
    </div>
  );
}
