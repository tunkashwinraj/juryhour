import Link from "next/link";

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="wordmark" aria-label="JuryHour home">
          JuryHour
        </Link>
        {children}
      </div>
    </header>
  );
}

/** Footer for every JuryHour page (the juror page /t/* stays unbranded, so it's not in the root layout). */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <p>Research, not a sales guarantee.</p>
      </div>
    </footer>
  );
}

export function SandboxBadge({ mode }: { mode: "live" | "sandbox" }) {
  if (mode !== "sandbox") return null;
  return (
    <span className="badge badge-sandbox" title="No real money moved and no real verdict is implied">
      TEST MODE (sandbox)
    </span>
  );
}
