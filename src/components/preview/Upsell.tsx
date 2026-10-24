"use client";
// The step after a preview (WEBSITE_SPEC §7.3): three compact tier cards (Spark, Proof
// [recommended], Pulse — plus Launch Pack / Specialist when that tier was preselected), the two
// add-ons we sell (+5 jurors, Rush), an optional partner/referral code, and the capacity state.
// Prices come from the server via props (HeroPreview `prices` + `offer`); the launch price is
// dropped client-side the moment its end time passes.
import { useEffect, useId, useState } from "react";
import { Badge, Banner, Card, Input } from "@/components/ui";
import { ADDONS, ADDON_EXTRA_JURORS, SPECIALIST_PRICE, TIERS, type AddonName } from "@/lib/constants";
import { getAttribution, normalizeCode } from "@/lib/attribution";
import { usd } from "@/components/rules";
import { TIER_LABELS, displayPrice, type CtaTier, type OfferLike, type PriceMap } from "./logic";
import { TierCta } from "./TierCta";
import { TrackOnView, usePreview } from "./PreviewProvider";
import { WaitlistForm } from "./LeadForms";
import styles from "./preview.module.css";

const ADDON_OPTIONS: { key: AddonName; label: string }[] = [
  { key: "extra5", label: `+${ADDON_EXTRA_JURORS} more jurors` },
  { key: "rush", label: "Rush: your panel goes first" },
];

const SUMMARY: Record<CtaTier, string> = {
  spark: `${TIERS.spark.jurors} real people · first impression of your headline`,
  pulse: `${TIERS.pulse.jurors} real people · reaction to your current page`,
  proof: `${TIERS.proof.jurors} real people · your page vs our rewrite`,
  launch_pack: "Proof now + a free retest after you update your page",
  specialist: `${TIERS.specialist.jurors} verified professionals · quoted, 24–72 h`,
};

/** False once the offer's end time has passed (checked in the browser only, no hydration drift). */
function useOfferStillLive(offer: OfferLike): boolean {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!offer) return;
    const ms = Date.parse(offer.endsAt) - Date.now();
    const t = setTimeout(() => setExpired(true), Math.max(0, Math.min(ms, 2_147_000_000)));
    return () => clearTimeout(t);
  }, [offer]);
  return !expired;
}

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
  offer,
  title = "This is AI guessing. Want real people to judge it?",
}: {
  prices?: PriceMap;
  offer?: OfferLike;
  title?: string;
}) {
  const ctx = usePreview();
  const codeId = useId();
  const live = useOfferStillLive(offer);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  if (ctx.refused) return null;

  const tiers: CtaTier[] = ["spark", "proof", "pulse"];
  if (ctx.selectedTier && !tiers.includes(ctx.selectedTier)) tiers.push(ctx.selectedTier);
  const emphasized: CtaTier = ctx.selectedTier ?? "proof";
  const addonTotal = ctx.addons.reduce((s, a) => s + ADDONS[a], 0);
  const effectiveOffer = live ? offer : null;

  function toggleAddon(a: AddonName) {
    ctx.setAddons(ctx.addons.includes(a) ? ctx.addons.filter((x) => x !== a) : [...ctx.addons, a]);
  }

  function openCode() {
    setCodeOpen(true);
    setCodeDraft(ctx.code ?? getAttribution().code ?? "");
  }

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
          // Expiry is enforced by useOfferStillLive (browser clock), so pass 0 here.
          const { price, compareAt } = displayPrice(t, prices, effectiveOffer, 0);
          const isEm = t === emphasized;
          return (
            <li key={t}>
              <Card tone={isEm ? "raised" : "plain"}>
                <div className={styles.tierHead}>
                  <span className={styles.tierName}>{TIER_LABELS[t]}</span>
                  {t === "proof" ? <Badge tone="signal">Recommended</Badge> : null}
                </div>
                <p className={styles.tierPrice}>
                  {t === "specialist" ? (
                    <>from {usd(SPECIALIST_PRICE(0))}</>
                  ) : (
                    <>
                      {usd(price)}
                      {compareAt ? <span className={styles.compareAt}> normally {usd(compareAt)}</span> : null}
                      {addonTotal > 0 && price !== null ? (
                        <span className={styles.withAddons}> · {usd(price + addonTotal)} with add-ons</span>
                      ) : null}
                    </>
                  )}
                </p>
                <p className={styles.small}>{SUMMARY[t]}</p>
                <TierCta tier={t} variant={isEm ? "primary" : "secondary"} />
              </Card>
            </li>
          );
        })}
      </ul>

      {!ctx.salesPaused ? (
        <fieldset className={styles.addons}>
          <legend>Add-ons (optional)</legend>
          {ADDON_OPTIONS.map((a) => (
            <label key={a.key} className={styles.check}>
              <input type="checkbox" checked={ctx.addons.includes(a.key)} onChange={() => toggleAddon(a.key)} />
              <span>
                {a.label} <span className={styles.num}>+{usd(ADDONS[a.key])}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className={styles.codeRow}>
        {codeOpen ? (
          <div className={styles.codeField}>
            <label htmlFor={codeId}>Partner or referral code</label>
            <Input
              id={codeId}
              value={codeDraft}
              maxLength={40}
              autoComplete="off"
              aria-invalid={codeError ? true : undefined}
              aria-describedby={`${codeId}-note`}
              onChange={(e) => {
                const v = e.target.value;
                setCodeDraft(v);
                if (!v.trim()) {
                  setCodeError(null);
                  ctx.setCode(null);
                  return;
                }
                const c = normalizeCode(v);
                setCodeError(c ? null : "Codes use letters, numbers, - and _ only.");
                ctx.setCode(c);
              }}
            />
            <p id={`${codeId}-note`} className={styles.small} aria-live="polite">
              {codeError ?? "Tells us who sent you. It doesn't change the price."}
            </p>
          </div>
        ) : (
          <button type="button" className={styles.linkButton} onClick={openCode}>
            Have a code?
          </button>
        )}
      </div>
    </div>
  );
}
