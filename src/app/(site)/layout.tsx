// Marketing chrome for every public page (docs/WEBSITE_CONTRACTS.md §1). /o, /r, /ops and /t live
// outside this group and get no marketing chrome.
import { LaunchOfferBar } from "@/components/marketing/LaunchOfferBar";
import { PreviewProvider } from "@/components/preview/PreviewProvider";
import { SiteFooter, SiteHeader } from "@/components/ui";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <LaunchOfferBar />
      <SiteHeader />
      <PreviewProvider>{children}</PreviewProvider>
      <SiteFooter />
    </>
  );
}
