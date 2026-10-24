import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND_SLASH, LOGO_HORIZONTAL } from "./brand";
import { MobileMenu, type NavItem } from "./MobileMenu";

const NAV: NavItem[] = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/sample-report", label: "Sample report" },
  { href: "/for/agencies", label: "For agencies" },
  { href: "/compare", label: "Compare" },
];

const PREVIEW_HREF = "/#preview";

const FOOTER_COLUMNS: { title: string; links: NavItem[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/sample-report", label: "Sample report" },
      { href: "/compare", label: "Compare" },
      { href: "/verdicts", label: "Verdicts" },
    ],
  },
  {
    title: "For",
    links: [
      { href: "/for/whop-sellers", label: "Whop sellers" },
      { href: "/for/lovable-builders", label: "Lovable builders" },
      { href: "/for/agencies", label: "Agencies" },
      { href: "/agents", label: "AI agents" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/changelog", label: "Changelog" },
      { href: "/blog", label: "Blog" },
      { href: "/affiliates", label: "Affiliates" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/refunds", label: "Refunds" },
    ],
  },
];

/** Support inbox (inlined at build; WEBSITE_CONTRACTS §0.5). */
export function supportEmailAddress(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@juryhour.com";
}

/**
 * The JuryHour logo (horizontal lockup) from the founder's outlined kit. The ink shapes use
 * currentColor (Ink on light, Paper on dark, following [data-theme] subtrees); the slash is always
 * Verdict red. Minimum 96px wide (public/brand/README.md); default 24px tall ≈ 139px wide.
 */
export function Logo({ height = 24, className }: { height?: number; className?: string }) {
  const width = Math.round((LOGO_HORIZONTAL.width / LOGO_HORIZONTAL.height) * height * 100) / 100;
  return (
    <svg
      className={["ui-logo", className].filter(Boolean).join(" ")}
      viewBox={LOGO_HORIZONTAL.viewBox}
      width={width}
      height={height}
      role="img"
      aria-label="JuryHour"
      focusable="false"
    >
      <path fill="currentColor" d={LOGO_HORIZONTAL.ink} />
      <path fill={BRAND_SLASH} d={LOGO_HORIZONTAL.slash} />
    </svg>
  );
}

/** The logo as the link home (header, footer, app chrome). */
export function Wordmark({ className, height }: { className?: string; height?: number }) {
  return (
    <Link href="/" className={["ui-wordmark", className].filter(Boolean).join(" ")}>
      <Logo height={height} />
    </Link>
  );
}

/**
 * "Skip to content": render it as the very first element of the page (before the launch-offer bar) so
 * it is the first tab stop. Visually hidden until focused (ui.css .ui-skip).
 */
export function SkipLink() {
  return (
    <a className="ui-skip" href="#main">
      Skip to content
    </a>
  );
}

/** Marketing header (WEBSITE_SPEC §4): sticky, translucent backdrop, safe-area aware. */
export function SiteHeader() {
  return (
    <header className="ui-header">
      <div className="ui-container ui-header__bar">
        <Wordmark />
        <nav className="ui-header__nav" aria-label="Main">
          <ul>
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href}>{n.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ui-header__actions">
          {/* Visible text is "Free preview" on phones; the name contains it (WCAG 2.5.3). */}
          <Link href={PREVIEW_HREF} className="ui-btn ui-btn--primary ui-btn--sm ui-header__cta" aria-label="Get a free preview">
            <span className="ui-header__cta-long">Get a free preview</span>
            <span className="ui-header__cta-short">Free preview</span>
          </Link>
          <MobileMenu items={NAV} cta={{ href: PREVIEW_HREF, label: "Get a free preview" }} />
        </div>
      </div>
    </header>
  );
}

/** Marketing footer (WEBSITE_SPEC §5.12) with the accessibility statement. */
export function SiteFooter() {
  const email = supportEmailAddress();
  return (
    <footer className="ui-footer">
      <div className="ui-container">
        <div className="ui-footer__top">
          <div className="ui-footer__brand">
            <Wordmark />
            <p className="ui-footer__tag">Real people judge your landing page against an AI rewrite. Verdict the same day.</p>
          </div>
          <nav className="ui-footer__cols" aria-label="Footer">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title} className="ui-footer__col">
                <h2 className="ui-footer__title">{col.title}</h2>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href}>{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <p className="ui-footer__a11y" id="accessibility">
          Accessibility: we aim for WCAG 2.2 AA. If something doesn&rsquo;t work for you, tell us at{" "}
          <a href={`mailto:${email}`}>{email}</a>.
        </p>
        <p className="ui-footer__legal">
          © 2026 JuryHour · Research, not a sales guarantee · Jurors recruited through{" "}
          <a href="https://terac.com" rel="noopener">
            Terac
          </a>
        </p>
      </div>
    </footer>
  );
}

/** Compact header for app pages outside the marketing group (/o, /r, /ops): wordmark + optional slot. */
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="ui-header ui-header--app">
      <div className="ui-container ui-header__bar">
        <Wordmark />
        {children ? <div className="ui-header__slot">{children}</div> : null}
      </div>
    </header>
  );
}

/** Compact footer for /o, /r, /ops. */
export function AppFooter() {
  const email = supportEmailAddress();
  return (
    <footer className="ui-footer ui-footer--app">
      <div className="ui-container">
        <nav aria-label="Footer" className="ui-footer__inline">
          <Link href="/pricing">Pricing</Link>
          <Link href="/legal/refunds">Refunds</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/terms">Terms</Link>
          <a href={`mailto:${email}`}>{email}</a>
        </nav>
        <p className="ui-footer__legal">
          © 2026 JuryHour · Research, not a sales guarantee · Jurors recruited through{" "}
          <a href="https://terac.com" rel="noopener">
            Terac
          </a>{" "}
          · Payments by Whop
        </p>
      </div>
    </footer>
  );
}
