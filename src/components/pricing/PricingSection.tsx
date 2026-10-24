// Pricing (docs/WEBSITE_SPEC.md §5.7; WEBSITE_CONTRACTS §2 B). Server component, no loading state:
// prices come from the cached shell read (constants fallback) and the launch offer is evaluated
// in the same cache. While an offer applies to a tier, its card shows the launch price with the
// normal price struck; a client guard swaps in the normal card once the offer's end time passes.
import { Suspense } from "react";
import { HideWhenRefused, SalesStatus } from "@/components/preview/PreviewProvider";
import { Badge, Banner, PriceCard, Section } from "@/components/ui";
import { TierCta } from "@/components/preview/TierCta";
import { ExpiryGuard } from "@/components/marketing/ExpiryGuard";
import { getPricingSnapshot, getSalesPaused } from "@/lib/marketing-data";
import type { TierName } from "@/lib/constants";
import {
  SOLD_ADDONS,
  UPGRADE_CREDIT_LINE,
  buildTierViews,
  offerEndsLabel,
  usd,
  type TierView,
} from "./pricing-data";
import p from "./pricing.module.css";

export type PricingSectionProps = {
  /** Tier to emphasize (segment pages); defaults to Proof. "Recommended" always stays on Proof. */
  highlight?: TierName;
  /** Cards + add-ons only, no section heading/lede (heading kept for screen readers). */
  compact?: boolean;
  headingLevel?: 2 | 3;
  /** Override the visible heading (defaults to "Pay per test. No subscription."). */
  title?: string;
  /** Anchor id; defaults to "pricing". Use another id when two sections share a page. */
  id?: string;
};

export async function PricingSection({
  highlight = "proof",
  compact = false,
  headingLevel = 2,
  title = "Pay per test. No subscription.",
  id = "pricing",
}: PricingSectionProps) {
  const { prices, offer, asOf } = await getPricingSnapshot();
  const tiers = buildTierViews(prices, offer);
  const cardLevel = headingLevel === 3 ? 4 : 3;
  // Hidden while the visitor's last preview was refused (WEBSITE_SPEC §7.4: no pricing for blocked products).
  return (
    <HideWhenRefused>
    <Section
      id={id}
      eyebrow={compact ? undefined : "Pricing"}
      title={compact ? undefined : title}
      lede={
        compact
          ? undefined
          : "Every package is judged by real people recruited through Terac. Prices in US dollars; checkout by Whop."
      }
      headingLevel={headingLevel}
      className={`${p.section} ${compact ? p.compact : ""}`}
    >
      {/* Legacy anchor: /r retest links and older emails point at #prices. */}
      {id === "pricing" ? <span id="prices" aria-hidden="true" /> : null}
      {compact ? (
        headingLevel === 3 ? (
          <h3 className="visually-hidden">Pricing</h3>
        ) : (
          <h2 className="visually-hidden">Pricing</h2>
        )
      ) : null}

      <Suspense fallback={null}>
        <SalesPausedNotice />
      </Suspense>

      <ul className={p.cards}>
        {tiers.map((t) => (
          <li key={t.tier}>
            {t.offer ? (
              <ExpiryGuard endsAt={t.offer.endsAt} after={<TierCard t={t} highlight={highlight} level={cardLevel} atNormalPrice />}>
                <TierCard t={t} highlight={highlight} level={cardLevel} offerLabel={offerEndsLabel(t.offer.endsAt, new Date(asOf))} />
              </ExpiryGuard>
            ) : (
              <TierCard t={t} highlight={highlight} level={cardLevel} />
            )}
          </li>
        ))}
      </ul>

      <div className={p.extras}>
        <ul className={p.addons} aria-label="Add-ons">
          <li className={p.addonsLabel}>Add-ons:</li>
          {SOLD_ADDONS.map((a) => (
            <li key={a.key}>
              {a.label} <span className={p.price}>{usd(a.price)}</span>
            </li>
          ))}
        </ul>
        <p className={p.credit}>{UPGRADE_CREDIT_LINE}</p>
      </div>
    </Section>
    </HideWhenRefused>
  );
}

function TierCard({
  t,
  highlight,
  level,
  atNormalPrice = false,
  offerLabel,
}: {
  t: TierView;
  highlight: TierName;
  level: 3 | 4;
  atNormalPrice?: boolean;
  offerLabel?: string;
}) {
  const showOffer = Boolean(t.offer) && !atNormalPrice;
  const emphasized = t.tier === highlight;
  return (
    <PriceCard
      headingLevel={level}
      name={t.name}
      price={showOffer ? t.price : t.normalPrice}
      priceNote={t.fromPrice ? "from" : undefined}
      compareAt={showOffer ? t.compareAt : null}
      jurors={t.jurors}
      summary={t.summary}
      bullets={t.bullets}
      badge={t.recommended ? <Badge tone="verdict">Recommended</Badge> : undefined}
      emphasized={emphasized}
      cta={
        <TierCta
          tier={t.tier}
          label={t.tier === "specialist" ? "Get a quote" : `Choose ${t.name}`}
          variant={emphasized ? "primary" : "secondary"}
        />
      }
      footnote={
        showOffer && t.offer ? (
          <>Launch price{offerLabel ? ` ${offerLabel}` : ""}. Applied automatically at checkout.</>
        ) : undefined
      }
    />
  );
}

async function SalesPausedNotice() {
  if (!(await getSalesPaused())) return null;
  return (
    <div className={p.notice}>
      {/* Flip every tier button to "Join the waitlist" before anyone clicks. */}
      <SalesStatus paused />
      <Banner tone="warn">
        We&rsquo;re at capacity right now, so new orders are paused. Pick a package below to join the waitlist and
        we&rsquo;ll email you when we&rsquo;re taking orders again. The free preview still works.
      </Banner>
    </div>
  );
}
