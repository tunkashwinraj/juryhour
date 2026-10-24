// Home (docs/WEBSITE_SPEC.md §5). Static shell: prices come from a cached read (constants fallback,
// never a loading state); live counters are cached and behind <Suspense>. Header/footer come from
// the (site) layout. The Verdict coupon is shown on the Verdict card (CouponPriceCard).
import type { Metadata } from "next";
import { JsonLd, faqLd, organizationLd, pageMetadata, productOffersLd, websiteLd } from "@/lib/seo";
import { getPricingSnapshot } from "@/lib/marketing-data";
import { PricingSection } from "@/components/pricing/PricingSection";
import { tierPrice, usd } from "@/components/pricing/pricing-data";
import {
  CompareSnippet,
  FinalCta,
  Hero,
  HomeFaq,
  HowItWorks,
  Problem,
  TrustStrip,
  WhatYouGet,
  WhoFor,
  ZeroEmployees,
} from "@/components/marketing/HomeSections";
import { HOME_FAQ } from "@/components/marketing/home-content";

export const metadata: Metadata = pageMetadata({
  title: "Real people judge your landing page, same day",
  description:
    "Real, identity-verified people who match your buyer judge your landing page against an AI challenger. Get the verdict and winning copy the same day.",
  path: "/",
  ogTitle: "Find out if strangers get your page before you pay to send them there.",
});

export default async function Home() {
  const { prices } = await getPricingSnapshot();
  const jhPrice = `${usd(tierPrice("spark", prices))} or ${usd(tierPrice("proof", prices))} per test`;

  return (
    <main id="main">
      <JsonLd
        data={[
          organizationLd(),
          websiteLd(),
          productOffersLd(prices),
          faqLd(HOME_FAQ.map(({ q, aText }) => ({ q, aText }))),
        ]}
      />
      <Hero prices={prices} />
      <TrustStrip />
      <Problem />
      <HowItWorks />
      <WhatYouGet />
      <PricingSection headingLevel={2} />
      <ZeroEmployees />
      <WhoFor />
      <CompareSnippet jhPrice={jhPrice} />
      <HomeFaq />
      <FinalCta prices={prices} />
    </main>
  );
}
