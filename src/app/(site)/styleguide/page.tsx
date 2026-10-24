// /styleguide — internal reference for the design system (noindex). Static.
import type { Metadata } from "next";
import {
  Badge,
  Banner,
  Button,
  CaseHeader,
  Card,
  CompareTable,
  Container,
  Eyebrow,
  FAQ,
  Field,
  Input,
  JurorQuote,
  Logo,
  PriceCard,
  Scorecard,
  Tally,
  Textarea,
  TimerBar,
  VerdictStamp,
} from "@/components/ui";
import { SegDemo } from "./SegDemo";
import s from "./styleguide.module.css";

export const metadata: Metadata = {
  title: "Styleguide",
  robots: { index: false, follow: false },
};

const COLORS: { token: string; use: string }[] = [
  { token: "paper", use: "page" },
  { token: "surface", use: "cards, inputs" },
  { token: "wash", use: "quiet fills" },
  { token: "rule", use: "hairlines" },
  { token: "rule-strong", use: "input borders, open marks" },
  { token: "ink", use: "text, primary" },
  { token: "ink-2", use: "secondary text" },
  { token: "muted", use: "captions, labels" },
  { token: "verdict", use: "stamp frame, winner marks" },
  { token: "verdict-ink", use: "red text (errors, labels)" },
  { token: "verdict-wash", use: "verdict banner" },
  { token: "signal", use: "positive deltas" },
  { token: "signal-wash", use: "signal badge" },
  { token: "focus", use: "focus ring" },
];

const BRAND_COLORS = [
  { name: "Ink", hex: "#14213D", rgb: "20, 33, 61" },
  { name: "Verdict red", hex: "#D8342C", rgb: "216, 52, 44" },
  { name: "Paper", hex: "#EEF2F8", rgb: "238, 242, 248" },
];

/** Kit files (public/brand/svg) at their documented minimum widths, plus a comfortable size. */
const LOGO_VERSIONS: { name: string; file: string; min: number; ratio: number; show: number }[] = [
  { name: "Horizontal", file: "horizontal", min: 96, ratio: 833.09 / 144, show: 200 },
  { name: "Stacked", file: "stacked", min: 56, ratio: 587.62 / 397.88, show: 120 },
  { name: "Wordmark", file: "wordmark", min: 72, ratio: 587.62 / 114.38, show: 160 },
  { name: "Symbol (4 strokes)", file: "symbol", min: 24, ratio: 56.25 / 44, show: 48 },
  { name: "Small symbol (3 strokes)", file: "symbol-small", min: 16, ratio: 1, show: 24 },
];

function LogoPanel({ theme }: { theme: "light" | "dark" }) {
  const variant = theme === "dark" ? "ondark" : "fullcolor";
  return (
    <div data-theme={theme} className={s.theme}>
      <Eyebrow>{theme === "dark" ? "On Ink (ondark)" : "On Paper (fullcolor)"}</Eyebrow>
      <div className={s.logoHero}>
        <Logo height={40} />
      </div>
      <ul className={s.logos}>
        {LOGO_VERSIONS.map((v) => (
          <li key={v.file} className={s.logoItem}>
            <div className={s.logoRow}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static kit SVGs */}
              <img src={`/brand/svg/juryhour-${v.file}-${variant}.svg`} alt="" width={v.show} height={Math.round(v.show / v.ratio)} />
              {/* eslint-disable-next-line @next/next/no-img-element -- static kit SVGs */}
              <img src={`/brand/svg/juryhour-${v.file}-${variant}.svg`} alt="" width={v.min} height={Math.round((v.min / v.ratio) * 10) / 10} />
            </div>
            <span className={s.caption}>
              {v.name} · min {v.min}px wide
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SCALE = [64, 48, 36, 28, 22, 18, 16, 14, 12];

function ThemePanel({ theme }: { theme: "light" | "dark" }) {
  return (
    <div data-theme={theme} className={s.theme}>
      <Eyebrow>{theme} theme</Eyebrow>
      <p style={{ margin: 0 }}>
        Ink on paper. <span style={{ color: "var(--ink-2)" }}>Secondary ink.</span>{" "}
        <span style={{ color: "var(--muted)" }}>Muted caption.</span>
      </p>
      <ul className={s.swatches}>
        {COLORS.map((c) => (
          <li key={c.token} className={s.swatch}>
            <span className={s.chip} style={{ background: `var(--${c.token})` }} />
            <span>--{c.token}</span>
            <span>{c.use}</span>
          </li>
        ))}
      </ul>
      <div className={s.sample}>
        <Button size="sm">Primary</Button>
        <Button size="sm" variant="secondary">
          Secondary
        </Button>
        <Badge tone="verdict">Verdict</Badge>
        <Badge tone="signal">+9 understood</Badge>
        <Tally total={15} filled={12} label="12 of 15 jurors chose B" size="sm" />
      </div>
    </div>
  );
}

export default function StyleguidePage() {
  return (
    <main id="main">
      <Container>
        <div style={{ paddingBlock: "var(--section-y)" }} className={s.stack}>
          <header style={{ maxWidth: "var(--measure)" }}>
            <Eyebrow>Internal · not indexed</Eyebrow>
            <h1>JuryHour design system</h1>
            <p style={{ fontSize: "var(--text-18)", color: "var(--ink-2)" }}>
              Tokens live in <code>src/styles/tokens.css</code>; components in <code>@/components/ui</code>. Everything on
              this page is the real component.
            </p>
          </header>

          <section className={s.block} aria-labelledby="sg-brand">
            <h2 id="sg-brand">Logo and brand colors</h2>
            <p className="muted" style={{ maxWidth: "var(--measure)" }}>
              Always the outlined files in <code>public/brand/</code> (never retype the name). Red is only ever the slash.
              Clear space on every side = the cap height of &ldquo;JuryHour&rdquo;. The site header uses{" "}
              <code>&lt;Logo /&gt;</code> (inline kit paths; ink follows the theme).
            </p>
            <ul className={s.brandColors}>
              {BRAND_COLORS.map((c) => (
                <li key={c.hex} className={s.brandColor}>
                  <span className={s.brandChip} style={{ background: c.hex }} />
                  <strong>{c.name}</strong>
                  <span className={s.caption}>
                    {c.hex} · rgb {c.rgb}
                  </span>
                </li>
              ))}
            </ul>
            <div className={s.themes}>
              <LogoPanel theme="light" />
              <LogoPanel theme="dark" />
            </div>
          </section>

          <section className={s.block} aria-labelledby="sg-colors">
            <h2 id="sg-colors">Color</h2>
            <div className={s.themes}>
              <ThemePanel theme="light" />
              <ThemePanel theme="dark" />
            </div>
          </section>

          <section className={s.block} aria-labelledby="sg-type">
            <h2 id="sg-type">Type</h2>
            <p className="muted">
              Newsreader for H1/H2 only · IBM Plex Sans for body and UI · IBM Plex Mono for juror labels, case numbers,
              prices and counters.
            </p>
            <dl className={s.scale}>
              {SCALE.map((px) => (
                <div key={px} className={s.scaleRow}>
                  <dt>{px}px</dt>
                  <dd
                    style={{
                      fontSize: `var(--text-${px})`,
                      fontFamily: px >= 28 ? "var(--font-display)" : "var(--font-sans)",
                      lineHeight: px >= 28 ? 1.1 : 1.5,
                      letterSpacing: px >= 28 ? "var(--tracking-display)" : undefined,
                    }}
                  >
                    {px >= 28 ? "Strangers get your page" : "Real people who match your buyer judge it against an AI rewrite."}
                  </dd>
                </div>
              ))}
              <div className={s.scaleRow}>
                <dt>mono</dt>
                <dd style={{ fontFamily: "var(--font-mono)" }}>Juror 06 · Case 0142 · $299 · 12/15</dd>
              </div>
            </dl>
          </section>

          <section className={s.block} aria-labelledby="sg-buttons">
            <h2 id="sg-buttons">Buttons</h2>
            <div className={s.stack} style={{ gap: "var(--space-4)" }}>
              <div className={s.row}>
                <Button size="lg">Get free preview</Button>
                <Button>Buy Verdict</Button>
                <Button size="sm">Small</Button>
                <Button disabled>Disabled</Button>
              </div>
              <div className={s.row}>
                <Button variant="secondary">See pricing</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link" href="/sample-report">
                  See the full sample report
                </Button>
                <Button variant="secondary" href="/pricing">
                  Link as button
                </Button>
              </div>
            </div>
          </section>

          <section className={s.block} aria-labelledby="sg-inputs">
            <h2 id="sg-inputs">Inputs</h2>
            <div style={{ maxWidth: 520 }}>
              <Field id="sg-url" label="Your landing page" hint="Free AI preview in about 10 seconds. No card, no login.">
                <Input type="url" placeholder="yourproduct.com" />
              </Field>
              <Field id="sg-email" label="Email" error="Enter an email like you@company.com.">
                <Input type="email" defaultValue="founder@" />
              </Field>
              <Field id="sg-buyer" label="Who's your buyer?">
                <Textarea rows={3} placeholder="Solo founders selling a $29/mo SaaS" />
              </Field>
            </div>
          </section>

          <section className={s.block} aria-labelledby="sg-seg">
            <h2 id="sg-seg">Segmented control</h2>
            <SegDemo />
          </section>

          <section className={s.block} aria-labelledby="sg-cards">
            <h2 id="sg-cards">Cards and badges</h2>
            <div className={s.prices}>
              <Card>
                <h3>Plain card</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Hairline on surface. For report excerpts.
                </p>
              </Card>
              <Card tone="raised">
                <h3>Raised card</h3>
                <p className="muted" style={{ margin: 0 }}>
                  The one object that matters on a screen.
                </p>
              </Card>
              <Card>
                <div className={s.row}>
                  <Badge>Neutral</Badge>
                  <Badge tone="verdict">Recommended</Badge>
                  <Badge tone="signal">Winner</Badge>
                  <Badge tone="sandbox">TEST MODE (sandbox)</Badge>
                </div>
              </Card>
            </div>
          </section>

          <section className={s.block} aria-labelledby="sg-tally">
            <h2 id="sg-tally">Tally</h2>
            <div className={s.tallies}>
              {[
                { filled: 12, total: 15, size: "lg" as const, animate: true },
                { filled: 8, total: 15, size: "md" as const, tone: "signal" as const },
                { filled: 3, total: 3, size: "md" as const },
                { filled: 6, total: 10, size: "md" as const, tone: "ink" as const },
                { filled: 13, total: 15, size: "sm" as const },
              ].map((t, i) => (
                <div key={i} className={s.tallyRow}>
                  <Tally
                    total={t.total}
                    filled={t.filled}
                    size={t.size}
                    tone={t.tone}
                    animate={t.animate}
                    label={`${t.filled} of ${t.total} jurors chose B`}
                  />
                  <p className={s.caption}>
                    {t.filled} of {t.total} · {t.size}
                    {t.tone ? ` · ${t.tone}` : ""}
                    {t.animate ? " · animate" : ""}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className={s.block} aria-labelledby="sg-verdict">
            <h2 id="sg-verdict">Case header, stamp, quotes, scorecard</h2>
            <Card tone="raised" style={{ maxWidth: 640 }}>
              <CaseHeader caseNo="0142" tier="Verdict" jurors={15} delivered="3h 40m" />
              <Eyebrow>Example verdict</Eyebrow>
              <div className={s.row} style={{ justifyContent: "space-between", marginBottom: "var(--space-5)" }}>
                <Tally total={15} filled={12} label="12 of 15 jurors chose B" />
                <VerdictStamp>Verdict: B wins 12–3</VerdictStamp>
              </div>
              <div className={s.stack} style={{ gap: "var(--space-4)" }}>
                <JurorQuote juror={6} cite="chose B">
                  I read the first one twice and still didn&rsquo;t know what it does.
                </JurorQuote>
                <JurorQuote juror={11} cite="chose B">
                  B told me who it&rsquo;s for in one line.
                </JurorQuote>
              </div>
              <div style={{ marginTop: "var(--space-5)" }}>
                <Scorecard
                  labels={{ a: "Yours (A)", b: "Ours (B)" }}
                  rows={[
                    { label: "Understood after 5 s", a: "4/15", b: "13/15", better: "b" },
                    { label: "Clarity (1–7)", a: "3.1", b: "5.8", better: "b" },
                    { label: "Would try (1–7)", a: "2.9", b: "4.9", better: "b" },
                  ]}
                />
              </div>
            </Card>
          </section>

          <section className={s.block} aria-labelledby="sg-price">
            <h2 id="sg-price">Price cards</h2>
            <div className={s.prices}>
              <PriceCard
                name="Quick Read"
                price={49}
                jurors={3}
                summary="A 2-minute first impression of your headline."
                bullets={["AI critique", "1 rewritten headline (untested)", "Same day"]}
                cta={
                  <Button variant="secondary" full>
                    Start with Quick Read
                  </Button>
                }
              />
              <PriceCard
                name="Verdict"
                price={299}
                priceSuffix="launch offer · regular $499 from Dec 1"
                jurors={15}
                emphasized
                badge={<Badge tone="verdict">Recommended</Badge>}
                summary="Your page vs our rewrite, in random order."
                bullets={["Verdict and scorecard", "Top fixes in jurors' words", "Winning copy to paste", "Same day"]}
                cta={<Button full>Get Verdict</Button>}
                footnote="Your $49 Quick Read counts toward it for 24 hours."
              />
            </div>
          </section>

          <section className={s.block} aria-labelledby="sg-compare">
            <h2 id="sg-compare">Compare table</h2>
            <CompareTable
              caption="Example comparison (illustrative values)"
              columns={["JuryHour", "Option B", "Option C", "Asking friends"]}
              highlightColumn={0}
              rows={[
                { label: "Real people", cells: ["Yes", "Yes", "Yes", "Yes"] },
                { label: "Rewrites your copy", cells: ["Yes", "No", "No", "No"] },
                { label: "Tests old vs new", cells: ["Yes", "No", "Yes", "No"] },
                { label: "Turnaround", cells: ["Same day", "12–48 h", "Hours", "Whenever"] },
              ]}
              footnote="Illustrative only. Real comparisons cite sources and a date."
            />
          </section>

          <section className={s.block} aria-labelledby="sg-faq">
            <h2 id="sg-faq">FAQ</h2>
            <FAQ
              items={[
                {
                  q: "Who are the jurors?",
                  a: <p>Real people recruited and identity-verified through Terac who match the buyer you describe.</p>,
                  aText: "Real people recruited and identity-verified through Terac who match the buyer you describe.",
                },
                {
                  q: "Is 15 people enough?",
                  a: <p>It&rsquo;s a directional signal, not a scientific study.</p>,
                  aText: "It's a directional signal, not a scientific study.",
                },
              ]}
            />
          </section>

          <section className={s.block} aria-labelledby="sg-banner">
            <h2 id="sg-banner">Banners</h2>
            <div className={s.stack} style={{ gap: "var(--space-3)" }}>
              <Banner>Example report. Names and numbers are illustrative.</Banner>
              <Banner tone="warn">We&rsquo;re at capacity today. Join the waitlist and we&rsquo;ll email you.</Banner>
              <Banner tone="verdict">Verdict delivered: the challenger wins 12 of 15.</Banner>
            </div>
          </section>

          <section className={s.block} aria-labelledby="sg-timer">
            <h2 id="sg-timer">Timer bar</h2>
            <TimerBar seconds={5} label="Each version is shown for 5 seconds" />
          </section>
        </div>
      </Container>
    </main>
  );
}
