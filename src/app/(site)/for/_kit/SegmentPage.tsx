// Template for /for/* segment landing pages. Each page passes its own copy; layout stays the same:
// hero → problem → labeled example → free preview → pricing (tier highlighted) → codes → FAQ.
import type { ReactNode } from "react";
import { Badge, Button, JurorQuote, Section } from "@/components/ui";
import { PricingSection } from "@/components/pricing/PricingSection";
import { HeroPreview } from "@/components/preview/HeroPreview";
import { getPricingSnapshot } from "@/lib/marketing-data";
import type { TierName } from "@/lib/constants";
import type { Card } from "@/lib/types";
import type { FaqItem } from "../../../../../content/faq";
import { CopyCard, FaqBlock, PageHero, kit } from "./index";

export type Segment = {
  slug: string;
  name: string;
  eyebrow: string;
  h1: string;
  lede: string;
  problem: { title: string; answer: string; points: { label: string; title: string; body: string }[] };
  example: {
    title: string;
    answer: string;
    a: Card;
    b: Card;
    quotes: { juror: number; text: string }[];
  };
  highlight: TierName;
  pricingTitle: string;
  pricingAnswer: string;
  faqTitle: string;
  faq: FaqItem[];
  /** Extra sections between the example and pricing (agencies). */
  extra?: ReactNode;
};

export async function SegmentPage({ seg }: { seg: Segment }) {
  // Cached snapshot (same one PricingSection reads): the page stays in the static shell.
  const { prices, offer } = await getPricingSnapshot();
  return (
    <main id="main">
      <PageHero
        crumbs={[{ name: seg.name, path: `/for/${seg.slug}` }]}
        eyebrow={seg.eyebrow}
        title={seg.h1}
        lede={seg.lede}
      >
        <Button href="#preview" variant="primary" size="lg">
          Get a free preview
        </Button>
        <Button href="/sample-report" variant="link">
          See a sample report
        </Button>
      </PageHero>

      <Section id="problem" title={seg.problem.title}>
        <p className={kit.answer}>{seg.problem.answer}</p>
        <div className={kit.grid3}>
          {seg.problem.points.map((p) => (
            <div key={p.label} className={kit.point}>
              <span className={kit.label}>{p.label}</span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="example" title={seg.example.title}>
        <p className={kit.answer}>
          <Badge tone="neutral">Example</Badge> {seg.example.answer}
        </p>
        <div className={kit.grid2}>
          <CopyCard card={seg.example.a} label="A · The current page" />
          <CopyCard card={seg.example.b} label="B · Our challenger" />
        </div>
        <div className={kit.grid2} style={{ marginTop: 20 }}>
          {seg.example.quotes.map((q) => (
            <JurorQuote key={q.juror} juror={q.juror} cite="Example">
              {q.text}
            </JurorQuote>
          ))}
        </div>
        <p className={`${kit.notes}`} style={{ marginTop: 12 }}>
          Illustrative example, not a real customer or real jurors. A real report includes every approved answer.
        </p>
      </Section>

      {seg.extra}

      <HeroPreview id="preview" variant="hero" prices={prices} offer={offer} />

      <Section id="pricing-intro" title={seg.pricingTitle}>
        <p className={kit.answer}>{seg.pricingAnswer}</p>
      </Section>
      <PricingSection highlight={seg.highlight} headingLevel={3} />

      <Section id="codes" title="Have a partner code?">
        <p className={kit.answer}>
          Enter it in the code field before checkout; if you arrived from a link with <code>?code=</code>, it&apos;s
          filled in for you. Codes tell us who sent you. They don&apos;t change the price.
        </p>
      </Section>

      <FaqBlock title={seg.faqTitle} items={seg.faq} />
    </main>
  );
}
