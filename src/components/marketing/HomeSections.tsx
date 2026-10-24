// Home-page sections (docs/WEBSITE_SPEC.md §5.2–§5.12), in page order. Server components; the only
// per-request data (live counters) is cached and behind <Suspense>.
import Link from "next/link";
import { Suspense } from "react";
import {
  Card,
  CaseHeader,
  CompareTable,
  Container,
  Eyebrow,
  FAQ,
  JurorQuote,
  Badge,
  Scorecard,
  Section,
  TimerBar,
} from "@/components/ui";
import { HeroPreview } from "@/components/preview/HeroPreview";
import { HeroArtifact } from "./HeroArtifact";
import { CopyButton } from "./CopyButton";
import { LiveCounters } from "./LiveCounters";
import {
  AUDIENCES,
  COMPARE_COLUMNS,
  COMPARE_FOOTNOTE,
  EXAMPLE_CASE as X,
  HOME_FAQ,
  PROBLEM_POINTS,
  STEPS,
  compareRows,
  winningCopyText,
} from "./home-content";
import type { TierName } from "@/lib/constants";
import s from "./marketing.module.css";

type PreviewData = { prices: Partial<Record<TierName, number | null>> };

export function Hero({ prices }: PreviewData) {
  return (
    <section aria-labelledby="hero-h">
      <Container className={s.hero}>
        <div>
          <Eyebrow>Real people · Real verdict · Same day</Eyebrow>
          <h1 id="hero-h" className={s.h1}>
            Find out if strangers get your page before you pay to send them there.
          </h1>
          <p className={s.sub}>
            Paste your landing page. Our agent writes a challenger, hires real, identity-verified people who match your
            buyer, and has them judge yours against ours. You get the winner and the copy to paste.
          </p>
          {/* HeroPreview renders the "Free AI preview in about 10 seconds. No card, no login." microcopy. */}
          <HeroPreview id="preview" prices={prices} />
        </div>
        <HeroArtifact />
      </Container>
    </section>
  );
}

export function TrustStrip() {
  // Text only. TODO(PARTNER_LOGOS_APPROVED=false in ./home-content): logos only with written permission.
  return (
    <section className={s.trust} aria-label="How JuryHour works with partners">
      <Container as="ul" className={s.trustList}>
        <li>
          Jurors recruited and identity-verified through{" "}
          <a href="https://terac.com" rel="noopener">
            Terac
          </a>
        </li>
        <li>Payments by Whop</li>
        <li>Every quote traceable to a real juror</li>
        <li>Directional research, not a sales guarantee</li>
      </Container>
    </section>
  );
}

export function Problem() {
  return (
    <Section id="problem" title="Most landing pages fail the 5-second test. Nobody tells the founder.">
      <ul className={s.grid3}>
        {PROBLEM_POINTS.map((p) => (
          <li key={p.label} className={s.point}>
            <p className={s.pointLabel}>{p.label}</p>
            <p className={s.pointText}>{p.text}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function HowItWorks() {
  return (
    <Section id="how-it-works" eyebrow="How it works" title="From your URL to a verdict, the same day.">
      <div className={s.timer}>
        <TimerBar seconds={5} label="Each juror sees each version for 5 seconds" />
      </div>
      <ol className={s.steps}>
        {STEPS.map((step) => (
          <li key={step.title} className={s.step}>
            <h3 className={s.stepTitle}>{step.title}</h3>
            <p className={s.stepText}>{step.text}</p>
          </li>
        ))}
      </ol>
      <Link href="/how-it-works" className={s.more}>
        Read the full method →
      </Link>
    </Section>
  );
}

export function WhatYouGet() {
  return (
    <Section
      id="what-you-get"
      eyebrow="What you get"
      title="A verdict you can act on tonight."
      lede="An excerpt from a Verdict report. The case below is an example with illustrative numbers."
    >
      <article className={s.excerpt} aria-label="Example report excerpt">
        <div className={s.excerptTop}>
          <CaseHeader caseNo={X.caseNo} tier={X.tier} jurors={X.jurors} delivered={X.delivered} />
          <Badge tone="neutral">Example</Badge>
        </div>
        <p className={s.verdictLine}>
          Verdict: the challenger wins, {X.preferB} of {X.jurors} jurors preferred B.
        </p>
        <div className={s.excerptCols}>
          <div>
            <h3 className={s.subhead}>Scorecard</h3>
            <Scorecard rows={X.scorecard} labels={{ a: "Your page (A)", b: "Challenger (B)" }} />
          </div>
          <div>
            <h3 className={s.subhead}>Top fix</h3>
            <p className={s.fixTitle}>{X.topFix.title}</p>
            <div className={s.quotes}>
              {X.topFix.quotes.map((q) => (
                <JurorQuote key={q.juror} juror={q.juror}>
                  {q.text}
                </JurorQuote>
              ))}
            </div>
          </div>
        </div>
        <div>
          <h3 className={s.subhead}>Winning copy, ready to paste</h3>
          <div className={s.copyBlock}>
            <p className={s.copyHeadline}>{X.winningCopy.headline}</p>
            <p className={s.copySub}>{X.winningCopy.subheadline}</p>
            <p className={`${s.copyCta} ${s.mono}`}>[ {X.winningCopy.cta} ]</p>
            <div className={s.copyActions}>
              <CopyButton text={winningCopyText()} label="Copy winning copy" />
            </div>
          </div>
        </div>
      </article>
      <Link href="/sample-report" className={s.more}>
        See the full sample report →
      </Link>
    </Section>
  );
}

export function ZeroEmployees() {
  return (
    <Section id="run-by-agents" eyebrow="Run by agents" title="A company with zero employees.">
      <p className={s.prose}>
        Agents research your page, write the challenger, recruit and grade jurors, write the report and handle refunds.
        Code enforces every money limit: prices, juror budgets and refunds. The only people in the loop are the jurors,
        and they&rsquo;re paid for their time.
      </p>
      <Suspense fallback={null}>
        <LiveCounters />
      </Suspense>
      <Link href="/about" className={s.more}>
        How the company runs →
      </Link>
    </Section>
  );
}

export function WhoFor() {
  return (
    <Section id="who-its-for" eyebrow="Who it's for" title="Built for people who ship pages fast.">
      <ul className={s.grid3}>
        {AUDIENCES.map((a) => (
          <li key={a.href} className={s.whoCardWrap}>
            <Card tone="plain">
              <div className={s.whoCard}>
                <h3 className={s.whoTitle}>
                  <Link href={a.href}>{a.title}</Link>
                </h3>
                <p className={s.whoText}>{a.text}</p>
                <span className={s.whoMore} aria-hidden="true">
                  Learn more →
                </span>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function CompareSnippet({ jhPrice }: { jhPrice: string }) {
  return (
    <Section id="compare" eyebrow="Compare" title="How JuryHour compares.">
      <CompareTable
        caption="JuryHour compared with other ways to test a landing page (as of Oct 2026)"
        columns={COMPARE_COLUMNS}
        rows={compareRows(jhPrice)}
        highlightColumn={0}
        footnote={COMPARE_FOOTNOTE}
      />
      <Link href="/compare" className={s.more}>
        See the full comparison →
      </Link>
    </Section>
  );
}

export function HomeFaq() {
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions founders ask first.">
      <FAQ items={HOME_FAQ} headingLevel={3} />
      <Link href="/faq" className={s.more}>
        All questions →
      </Link>
    </Section>
  );
}

export function FinalCta({ prices }: PreviewData) {
  return (
    <section className={s.band} aria-labelledby="final-cta-h">
      <Container className={s.bandInner}>
        <h2 id="final-cta-h" className={s.bandTitle}>
          Your page has 5 seconds. Find out what happens in them.
        </h2>
        <HeroPreview id="preview-band" variant="band" prices={prices} />
      </Container>
    </section>
  );
}
