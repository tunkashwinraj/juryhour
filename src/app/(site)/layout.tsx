// Marketing chrome for every public page (docs/WEBSITE_CONTRACTS.md §1). /o, /r, /ops and /t live
// outside this group and get no marketing chrome.
import { PreviewProvider } from "@/components/preview/PreviewProvider";
import { getPricingSnapshot } from "@/lib/marketing-data";
import { SiteFooter, SiteHeader, SkipLink } from "@/components/ui";

export default async function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Cached snapshot: the coupon reaches every TierCta and price card through the provider.
  const { coupon } = await getPricingSnapshot();
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <PreviewProvider coupon={coupon}>{children}</PreviewProvider>
      <SiteFooter />
    </>
  );
}
