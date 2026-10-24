// /pricing (docs/WEBSITE_SPEC.md §6): the shared PricingSection, a full feature comparison, add-ons,
// upgrade credit, Specialist quote CTA, pricing FAQ and a refund summary. Static shell; prices and
// the launch offer come from the cached snapshot (constants fallback).
import type { Metadata } from "next";
import Link from "next/link";
import { CompareTable, FAQ } from "@/components/ui";
import { TierCta } from "@/components/preview/TierCta";
import { JsonLd, breadcrumbLd, faqLd, pageMetadata, productOffersLd } from "@/lib/seo";
import { getPricingSnapshot } from "@/lib/marketing-data";
import { PricingSection } from "@/components/pricing/PricingSection";
import {
  SOLD_ADDONS,
  SPECIALIST_FROM_USD,
  TIER_LABEL,
  TIER_ORDER,
  UPGRADE_CREDIT_LINE,
  buildTierViews,
  featureRows,
  usd,
} from "@/components/pricing/pricing-data";
import { PRICING_FAQ } from "@/components/pricing/pricing-faq";
import { TIERS, UPGRADE_CREDIT_HOURS } from "@/lib/constants";
import p from "@/components/pricing/pricing.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const { prices } = await getPricingSnapshot();
  const v = buildTierViews(prices, null);
  const list = v.map((t) => `${t.name} ${t.fromPrice ? "from " : ""}${t.normalPrice === null ? "on quote" : usd(t.normalPrice)}`);
  return pageMetadata({
    title: `Pricing: from ${usd(v[0].normalPrice ?? TIERS.spark.price)} per test, no subscription`,
    description: `${list.join(", ")}. Real people judge your landing page. Pay per test.`,
    path: "/pricing",
  });
}

export default async function PricingPage() {
  const { prices, offer } = await getPricingSnapshot();
  const views = buildTierViews(prices, offer);

  return (
    <main id="main">
      <JsonLd
        data={[
          productOffersLd(prices, offer),
          faqLd(PRICING_FAQ.map(({ q, aText }) => ({ q, aText }))),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Pricing", path: "/pricing" },
          ]),
        ]}
      />

      <header className={p.page}>
        <h1 className={p.pageTitle}>Pricing</h1>
        <p className={p.pageLede}>
          Pay per test. Every package is judged by real people recruited through Terac, and every package starts with
          a free AI preview of your page.
        </p>
      </header>

      <PricingSection headingLevel={2} title="Pick how many people judge your page." />

      <section className={p.block} aria-labelledby="features-h">
        <h2 id="features-h" className={p.blockTitle}>
          What each package includes
        </h2>
        <div className={p.tableWrap}>
          <CompareTable
            caption="Feature comparison across JuryHour packages"
            columns={TIER_ORDER.map((t) => TIER_LABEL[t])}
            rows={featureRows(views)}
            highlightColumn={TIER_ORDER.indexOf("proof")}
            footnote="“—” means it isn’t part of that package. Prices are the normal list prices; a launch price, when one is running, is shown on the cards above."
          />
        </div>
      </section>

      <section className={p.block} aria-labelledby="addons-h">
        <h2 id="addons-h" className={p.blockTitle}>
          Add-ons
        </h2>
        <p className={p.blockLede}>Pick them at checkout. Nothing else is added to your bill.</p>
        <ul className={p.addonTable}>
          {SOLD_ADDONS.map((a) => (
            <li key={a.key} className={p.addonItem}>
              <h3 className={p.addonName}>
                <span>{a.label}</span>
                <span className={p.price}>{usd(a.price)}</span>
              </h3>
              <p className={p.addonText}>{a.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={p.block} aria-labelledby="credit-h">
        <h2 id="credit-h" className={p.blockTitle}>
          Upgrade credit
        </h2>
        <p className={p.blockLede}>
          {UPGRADE_CREDIT_LINE} Upgrade from the link in your Spark report within {UPGRADE_CREDIT_HOURS} hours of paying,
          and the {usd(prices.spark ?? TIERS.spark.price)} you paid comes off the higher package automatically. It
          counts toward Pulse and Launch Pack too, and a Pulse counts toward Proof or Launch Pack the same way.
        </p>
      </section>

      <section className={p.block} aria-labelledby="specialist-h">
        <h2 id="specialist-h" className={p.blockTitle}>
          Need a specific professional audience?
        </h2>
        <p className={p.blockLede}>
          Specialist Jury recruits {TIERS.specialist.jurors} verified professionals who match your buyer by job,
          industry and seniority, and asks about objections and price. Prices start at {usd(SPECIALIST_FROM_USD)} and
          depend on how hard your audience is to reach; you get a quote before you pay. Delivery takes 24–72 hours.
        </p>
        <div className={p.ctaRow}>
          <TierCta tier="specialist" label="Get a quote" variant="primary" />
        </div>
      </section>

      <section className={p.block} aria-labelledby="pricing-faq-h">
        <h2 id="pricing-faq-h" className={p.blockTitle}>
          Pricing questions
        </h2>
        <FAQ items={PRICING_FAQ} headingLevel={3} />
      </section>

      <section className={p.block} aria-labelledby="refunds-h">
        <h2 id="refunds-h" className={p.blockTitle}>
          Refunds, in short
        </h2>
        <ul className={p.list}>
          <li>Full refund if we can&rsquo;t recruit your audience or deliver the minimum panel.</li>
          <li>Pro-rata refund if we deliver fewer jurors than you paid for.</li>
          <li>Support refunds for late or failed delivery.</li>
        </ul>
        <p>
          <Link href="/legal/refunds">Read the full refund policy</Link>
        </p>
      </section>
    </main>
  );
}
