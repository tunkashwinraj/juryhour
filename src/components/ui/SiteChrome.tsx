import Link from "next/link";
import type { ReactNode } from "react";
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

/** Tally-of-five glyph (four strokes, one red slash) + the name. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={["ui-wordmark", className].filter(Boolean).join(" ")} aria-label="JuryHour home">
      <svg className="ui-wordmark__glyph" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M5 4v16M9.5 4v16M14 4v16M18.5 4v16" />
        </g>
        <path d="M2.5 17.5 21.5 6.5" stroke="var(--verdict)" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="ui-wordmark__text">JuryHour</span>
    </Link>
  );
}

/** Marketing header (WEBSITE_SPEC §4): sticky, translucent backdrop, safe-area aware. */
export function SiteHeader() {
  return (
    <header className="ui-header">
      <a className="ui-skip" href="#main">
        Skip to content
      </a>
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
