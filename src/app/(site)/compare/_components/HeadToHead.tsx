// Shared layout for /compare/[competitor] pages: sourced table, where they're better, where we're
// better, when to use which, sources.
import type { ReactNode } from "react";
import Link from "next/link";
import { Button, CompareTable, Section } from "@/components/ui";
import { COMPARE_AS_OF, footnotes, type Fact, type SourceId } from "../../../../../content/compare";
import { Fn, Footnotes, PageHero, kit } from "../../for/_kit";

export type HeadToHeadProps = {
  slug: string;
  name: string;
  h1: string;
  lede: string;
  answer: string;
  sources: SourceId[];
  rows: { label: string; us: ReactNode; them: Fact | string }[];
  theyAreBetter: { title: string; answer: string; points: ReactNode[] };
  weAreBetter: { title: string; answer: string; points: ReactNode[] };
  whichTitle: string;
  which: ReactNode;
};

export function HeadToHead(p: HeadToHeadProps) {
  const notes = footnotes(p.sources);
  const num = (id: SourceId) => notes.find((n) => n.id === id)?.n ?? 0;
  const cell = (f: Fact | string) =>
    typeof f === "string" ? (
      f
    ) : (
      <>
        {f.text}
        <Fn n={f.src.map(num)} />
      </>
    );
  return (
    <main id="main">
      <PageHero
        crumbs={[
          { name: "Compare", path: "/compare" },
          { name: `JuryHour vs ${p.name}`, path: `/compare/${p.slug}` },
        ]}
        eyebrow={`HEAD TO HEAD · AS OF ${COMPARE_AS_OF.toUpperCase()}`}
        title={p.h1}
        lede={p.lede}
      />

      <Section id="table" title={`How do JuryHour and ${p.name} compare?`}>
        <p className={kit.answer}>{p.answer}</p>
        <CompareTable
          caption={`JuryHour vs ${p.name}, as of ${COMPARE_AS_OF}`}
          columns={["JuryHour", p.name]}
          highlightColumn={0}
          rows={p.rows.map((r) => ({ label: r.label, cells: [r.us, cell(r.them)] }))}
          footnote={
            <Footnotes
              items={notes}
              intro={`${p.name} facts from ${p.name}'s own website, checked ${COMPARE_AS_OF}. Tell us if something has changed.`}
            />
          }
        />
      </Section>

      <Section id="they-are-better" title={p.theyAreBetter.title}>
        <p className={kit.answer}>{p.theyAreBetter.answer}</p>
        <ul className={kit.prose}>
          {p.theyAreBetter.points.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </Section>

      <Section id="we-are-better" title={p.weAreBetter.title}>
        <p className={kit.answer}>{p.weAreBetter.answer}</p>
        <ul className={kit.prose}>
          {p.weAreBetter.points.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </Section>

      <Section id="which" title={p.whichTitle}>
        <div className={kit.prose}>{p.which}</div>
        <div className={kit.actions}>
          <Button href="/#preview" variant="primary">
            Get a free preview
          </Button>
          <Button href="/sample-report" variant="secondary">
            See a sample report
          </Button>
          <Link href="/compare">All comparisons</Link>
        </div>
      </Section>
    </main>
  );
}
