// Chrome for the app pages outside the marketing group (/o, /r, /ops). The marketing header and
// footer are SiteHeader/SiteFooter from "@/components/ui" (rendered by src/app/(site)/layout.tsx).
import { AppFooter, AppHeader, Badge } from "@/components/ui";

/** Compact header: wordmark + optional slot (e.g. "Company dashboard" on /ops). */
export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return <AppHeader>{children}</AppHeader>;
}

/** Compact footer for every JuryHour app page (the juror page /t/* stays unbranded and has none). */
export function SiteFooter() {
  return <AppFooter />;
}

export function SandboxBadge({ mode }: { mode: "live" | "sandbox" }) {
  if (mode !== "sandbox") return null;
  return (
    <Badge tone="sandbox" title="No real money moved and no real verdict is implied">
      TEST MODE (sandbox)
    </Badge>
  );
}
