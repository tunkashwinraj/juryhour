// Home (docs/WEBSITE_SPEC.md §5). Static shell: prices and the launch offer come from a cached read
// (constants fallback, never a loading state); live counters are cached and behind <Suspense>.
// The launch-offer bar (§5.1) and header/footer come from the (site) layout.
import type { Metadata } from "next";
import { JsonLd, faqLd, organizationLd, pageMetadata, productOffersLd, websiteLd } from "@/lib/seo";
import { getPricingSnapshot } from "@/lib/marketing-data";
import { PricingSection } from "@/components/pricing/PricingSection";
import { SPECIALIST_FROM_USD, usd } from "@/components/pricing/pricing-data";
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
import { BUYABLE_TIERS, TIERS } from "@/lib/constants";

export const metadata: Metadata = pageMetadata({
  title: "Real people judge your landing page, same day",
  description:
    "Real, identity-verified people who match your buyer judge your landing page against an AI challenger. Get the verdict and winning copy the same day.",
  path: "/",
  ogTitle: "Find out if strangers get your page before you pay to send them there.",
});

export default async function Home() {
  const { prices, offer } = await getPricingSnapshot();
  const fixed = BUYABLE_TIERS.map((t) => prices[t] ?? TIERS[t].price).filter((n): n is number => n !== null);
  const jhPrice = `${usd(Math.min(...fixed))}–${usd(Math.max(...fixed))}; Specialist from ${usd(SPECIALIST_FROM_USD)}`;

  return (
    <main id="main">
      <JsonLd
        data={[
          organizationLd(),
          websiteLd(),
          productOffersLd(prices, offer),
          faqLd(HOME_FAQ.map(({ q, aText }) => ({ q, aText }))),
        ]}
      />
      <Hero prices={prices} offer={offer} />
      <TrustStrip />
      <Problem />
      <HowItWorks />
      <WhatYouGet />
      <PricingSection headingLevel={2} />
      <ZeroEmployees />
      <WhoFor />
      <CompareSnippet jhPrice={jhPrice} />
      <HomeFaq />
      <FinalCta prices={prices} offer={offer} />
    </main>
  );
}
