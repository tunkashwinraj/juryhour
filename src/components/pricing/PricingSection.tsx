// Pricing (docs/WEBSITE_SPEC.md §5.7; WEBSITE_CONTRACTS §2 B). Server component, no loading state:
// prices come from the cached shell read (constants fallback). Exactly two cards (Quick Read, Verdict
// [VERDICT_BADGE]); the Verdict card follows the visitor's HALF code client-side (CouponPriceCard).
// Under the cards: extra jurors and the upgrade credit.
import { Suspense } from "react";
import { HideWhenRefused, SalesStatus } from "@/components/preview/PreviewProvider";
import { Badge, Banner, Section } from "@/components/ui";
import { TierCta } from "@/components/preview/TierCta";
import { getPricingSnapshot, getSalesPaused } from "@/lib/marketing-data";
import { VERDICT_BADGE, type TierName } from "@/lib/constants";
import { CouponPriceCard } from "./CouponPriceCard";
import { EXTRA_JURORS_LINE, UPGRADE_CREDIT_LINE, buildTierViews, type TierView } from "./pricing-data";
import p from "./pricing.module.css";

export type PricingSectionProps = {
  /** Tier to emphasize (segment pages); defaults to Verdict. "Recommended" always stays on Verdict. */
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
  const { prices } = await getPricingSnapshot();
  const tiers = buildTierViews(prices);
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
            <TierCard t={t} highlight={highlight} level={cardLevel} />
          </li>
        ))}
      </ul>

      <div className={p.extras}>
        <p className={p.note}>{EXTRA_JURORS_LINE}</p>
        <p className={p.credit}>{UPGRADE_CREDIT_LINE}</p>
      </div>
    </Section>
    </HideWhenRefused>
  );
}

function TierCard({ t, highlight, level }: { t: TierView; highlight: TierName; level: 3 | 4 }) {
  const emphasized = t.tier === highlight;
  return (
    <CouponPriceCard
      tier={t.tier}
      headingLevel={level}
      name={t.name}
      price={t.price}
      jurors={t.jurors}
      summary={t.summary}
      bullets={t.bullets}
      badge={t.recommended ? <Badge tone="verdict">{VERDICT_BADGE}</Badge> : undefined}
      emphasized={emphasized}
      cta={
        <TierCta
          tier={t.tier}
          label={`Choose ${t.name}`}
          variant={emphasized ? "primary" : "secondary"}
        />
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
