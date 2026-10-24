// /pricing (docs/WEBSITE_SPEC.md §6): the shared PricingSection (Quick Read, Verdict), a feature
// comparison, the HALF coupon, extra jurors, upgrade credit, pricing FAQ and a refund summary.
// Retest is not sold here (only from a Verdict report). Static shell; prices and the coupon come from
// the cached snapshot (constants fallback).
import type { Metadata } from "next";
import Link from "next/link";
import { CompareTable, FAQ } from "@/components/ui";
import { JsonLd, breadcrumbLd, faqLd, pageMetadata, productOffersLd } from "@/lib/seo";
import { getPricingSnapshot } from "@/lib/marketing-data";
import { PricingSection } from "@/components/pricing/PricingSection";
import {
  EXTRA_JURORS_LINE,
  TIER_LABEL,
  TIER_ORDER,
  UPGRADE_CREDIT_LINE,
  VERDICT_LAUNCH_NOTE,
  buildTierViews,
  couponEndsLabel,
  featureRows,
  tierPrice,
  usd,
  verdictCouponPrice,
} from "@/components/pricing/pricing-data";
import { PRICING_FAQ } from "@/components/pricing/pricing-faq";
import { EXTRA_JUROR_USD, MAX_EXTRA_JURORS, TIERS, UPGRADE_CREDIT_HOURS } from "@/lib/constants";
import p from "@/components/pricing/pricing.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const { prices } = await getPricingSnapshot();
  const v = buildTierViews(prices);
  const list = v.map((t) => `${t.name} ${usd(t.price)}${t.tier === "proof" ? ` (${VERDICT_LAUNCH_NOTE})` : ""}`);
  return pageMetadata({
    title: `Pricing: from ${usd(v[0].price)} per test, no subscription`,
    description: `${list.join(", ")}. Real people judge your landing page. Pay per test.`,
    path: "/pricing",
  });
}

export default async function PricingPage() {
  const { prices, coupon } = await getPricingSnapshot();
  const views = buildTierViews(prices);
  const verdictPrice = tierPrice("proof", prices);
  const quickReadPrice = tierPrice("spark", prices);

  return (
    <main id="main">
      <JsonLd
        data={[
          productOffersLd(prices),
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
            footnote="“—” means it isn’t part of that package. The HALF code, while it runs, is shown on the Verdict card above."
          />
        </div>
      </section>

      {coupon ? (
        <section className={p.block} aria-labelledby="coupon-h">
          <h2 id="coupon-h" className={p.blockTitle}>
            Your first Verdict for {usd(verdictCouponPrice(prices, coupon))} with code {coupon.code}
          </h2>
          <p className={p.blockLede}>
            Through {couponEndsLabel(coupon.endsAt)}, code {coupon.code} takes your first Verdict from {usd(verdictPrice)}{" "}
            to {usd(verdictCouponPrice(prices, coupon))}. It&rsquo;s one per customer (the first Verdict for your email),
            it applies to the Verdict price only (extra jurors stay {usd(EXTRA_JUROR_USD)} each), and it works together
            with the Quick Read upgrade credit: {usd(verdictCouponPrice(prices, coupon))} − {usd(quickReadPrice)} ={" "}
            {usd(Math.max(0, verdictCouponPrice(prices, coupon) - quickReadPrice))}. Arrive with a link that carries the
            code, or type it in &ldquo;Have a code?&rdquo;.
          </p>
        </section>
      ) : null}

      <section className={p.block} aria-labelledby="extra-h">
        <h2 id="extra-h" className={p.blockTitle}>
          Extra jurors: {usd(EXTRA_JUROR_USD)} each
        </h2>
        <p className={p.blockLede}>
          {EXTRA_JURORS_LINE} A Verdict with {MAX_EXTRA_JURORS} extra jurors is judged by{" "}
          {TIERS.proof.jurors + MAX_EXTRA_JURORS} people. You choose them in the checkout step, after your free preview.
          Codes and credits never change the price of extra jurors.
        </p>
      </section>

      <section className={p.block} aria-labelledby="credit-h">
        <h2 id="credit-h" className={p.blockTitle}>
          Upgrade credit
        </h2>
        <p className={p.blockLede}>
          {UPGRADE_CREDIT_LINE} Upgrade from the link in your Quick Read report within {UPGRADE_CREDIT_HOURS} hours of
          paying, and the {usd(quickReadPrice)} you paid comes off the Verdict automatically: you pay{" "}
          {usd(Math.max(0, verdictPrice - quickReadPrice))} instead of {usd(verdictPrice)}.
        </p>
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
