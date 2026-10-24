import { Banner, Button, CaseHeader, Section } from "@/components/ui";
import { ReportView } from "@/components/report/ReportView";
import { TIERS } from "@/lib/constants";
import { pageMetadata } from "@/lib/seo";
import {
  SAMPLE_CARD_A,
  SAMPLE_CARD_B,
  SAMPLE_CASE,
  SAMPLE_REPORT_DATA,
  SAMPLE_REPORT_SOURCE,
} from "../../../../content/sample-report";
import { CopyCard, PageHero, kit } from "../for/_kit";

export const metadata = pageMetadata({
  title: "Sample report: what a JuryHour verdict looks like",
  description:
    "A complete example Verdict report: verdict, scorecard, top fixes with juror quotes, winning copy and every anonymous response. Illustrative data.",
  path: "/sample-report",
  ogTitle: "Sample verdict: B wins 12 of 15",
});

export default function SampleReportPage() {
  const isExample = SAMPLE_REPORT_SOURCE === "example";
  return (
    <main id="main">
      <PageHero
        crumbs={[{ name: "Sample report", path: "/sample-report" }]}
        eyebrow="SAMPLE REPORT"
        title="What does a JuryHour report look like?"
        lede={`This is a complete Verdict report: ${TIERS.proof.jurors} people judged a page against our rewrite. It uses the same sections and layout as a real report; only the share and next-step buttons are left out.`}
      >
        <Button href="/#preview" variant="primary">
          Get a free preview of your page
        </Button>
      </PageHero>

      <Section>
        {isExample ? (
          <Banner tone="info">
            <strong>Example report.</strong> Names and numbers are illustrative. {SAMPLE_CASE.product} and its jurors
            are invented to show the format; real reports are built only from real juror answers.
          </Banner>
        ) : null}
      </Section>

      <Section id="cards" title="What did the jurors see?">
        <p className={kit.answer}>
          Two short cards, each for 5 seconds, in random order. A is the page as written; B is the challenger our agent
          wrote using only facts from the page. Jurors weren&apos;t told which was the original.
        </p>
        <div className={kit.grid2}>
          <CopyCard card={SAMPLE_CARD_A} label="A · The current page" />
          <CopyCard card={SAMPLE_CARD_B} label="B · Our challenger" />
        </div>
      </Section>

      <Section id="report">
        <CaseHeader
          caseNo={SAMPLE_CASE.caseNo}
          tier={SAMPLE_CASE.tier}
          jurors={SAMPLE_CASE.jurors}
          delivered={SAMPLE_CASE.delivered}
        />
        <ReportView
          data={SAMPLE_REPORT_DATA}
          appUrl=""
          nowMs={0}
          prices={{ proof: TIERS.proof.price, retest: TIERS.retest.price }}
          sample
        />
      </Section>

      <Section id="next" title="How do I get a report like this for my page?">
        <p className={kit.answer}>
          Start with the free preview: paste your page and see what an AI reads in about 10 seconds. If you want real
          people to judge it, pick a package from the preview result.
        </p>
        <div className={kit.actions}>
          <Button href="/#preview" variant="primary">
            Get a free preview
          </Button>
          <Button href="/how-it-works" variant="secondary">
            Read the full method
          </Button>
        </div>
      </Section>
    </main>
  );
}
