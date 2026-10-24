import Link from "next/link";
import { CompareTable, Section } from "@/components/ui";
import { TIERS } from "@/lib/constants";
import { pageMetadata } from "@/lib/seo";
import {
  COMPARE_AS_OF,
  PICKFU,
  USERTESTING,
  WYNTER,
  footnotes,
  type Fact,
  type SourceId,
} from "../../../../content/compare";
import { Fn, Footnotes, PageHero, kit } from "../for/_kit";

export const metadata = pageMetadata({
  title: "JuryHour vs Wynter, PickFu and UserTesting",
  description: `An honest, sourced comparison of ways to test a landing page with real people: price, speed, audience and what you get back. As of ${COMPARE_AS_OF}.`,
  path: "/compare",
  ogTitle: "How JuryHour compares",
});

const ORDER: SourceId[] = ["wynter-pricing", "wynter-home", "pickfu-pricing", "pickfu-home", "usertesting-plans"];
const NOTES = footnotes(ORDER);
const num = (id: SourceId) => NOTES.find((n) => n.id === id)!.n;
const cite = (f: Fact) => (
  <>
    {f.text}
    <Fn n={f.src.map(num)} />
  </>
);

export default function ComparePage() {
  const P = TIERS.proof;
  return (
    <main id="main">
      <PageHero
        crumbs={[{ name: "Compare", path: "/compare" }]}
        eyebrow={`COMPARISON · AS OF ${COMPARE_AS_OF.toUpperCase()}`}
        title="What's the best way to test a landing page with real people?"
        lede="It depends on who your buyer is and how much you want to spend. Here's how JuryHour compares with Wynter, PickFu, UserTesting and asking friends, with every competitor fact linked to its source."
      />

      <Section id="table" title="How do the options compare?">
        <p className={kit.answer}>
          JuryHour is the only one here that rewrites your copy and tests it against yours in one fixed-price order.
          Wynter goes deeper on B2B audiences, PickFu has a much larger consumer panel, and UserTesting shows you video of
          people using your site.
        </p>
        <CompareTable
          caption={`Landing page testing options, as of ${COMPARE_AS_OF}`}
          columns={["JuryHour", "Wynter", "PickFu", "UserTesting", "Asking friends"]}
          highlightColumn={0}
          rows={[
            {
              label: "Who answers",
              cells: [
                "Real people screened to match your buyer, recruited and identity-verified through Terac",
                cite(WYNTER.audience),
                cite(PICKFU.audience),
                cite(USERTESTING.audience),
                "People who know you",
              ],
            },
            {
              label: "Rewrites your copy",
              cells: ["Yes: an agent writes a challenger from facts on your page", cite(WYNTER.rewrite), cite(PICKFU.rewrite), "Not stated", "Sometimes, as opinions"],
            },
            {
              label: "Tests old vs new",
              cells: [
                "Yes, in Verdict: your page vs our rewrite, random order, blind",
                cite(WYNTER.tests),
                cite(PICKFU.tests),
                cite(USERTESTING.tests),
                "No",
              ],
            },
            {
              label: "Price",
              cells: [
                <>
                  Fixed per test: Quick Read ${TIERS.spark.price}, Verdict ${P.price} (<Link href="/pricing">today&apos;s prices</Link>)
                </>,
                cite(WYNTER.price),
                cite(PICKFU.price),
                cite(USERTESTING.price),
                "Free",
              ],
            },
            {
              label: "Turnaround",
              cells: [
                `Same day (jury deadline ${P.deadlineHours} h for Verdict)`,
                cite(WYNTER.speed),
                cite(PICKFU.speed),
                cite(USERTESTING.speed),
                "Whenever they reply",
              ],
            },
            {
              label: "Setup",
              cells: ["Paste a URL or pitch; no account", "Account; tests set up in the app", "Account; build a poll", "Sales call for pricing", "A group chat"],
            },
          ]}
          footnote={<Footnotes items={NOTES} intro={`Competitor facts from their own websites, checked ${COMPARE_AS_OF}. Tell us if something has changed.`} />}
        />
      </Section>

      <Section id="when" title="When should I use something other than JuryHour?">
        <p className={kit.answer}>
          When you need a large sample, a narrow B2B audience at scale, or to watch people use your product. We&apos;d rather
          you pick the right tool.
        </p>
        <ul className={kit.prose}>
          <li>
            <strong>Wynter</strong> if you sell to B2B teams, have the budget, and want verified job titles at scale plus
            more research formats. <Link href="/compare/wynter">JuryHour vs Wynter</Link>.
          </li>
          <li>
            <strong>PickFu</strong> if you want hundreds of consumer votes on images, packaging or many variants at once.{" "}
            <Link href="/compare/pickfu">JuryHour vs PickFu</Link>.
          </li>
          <li>
            <strong>UserTesting</strong> if you need video of people navigating your site or app, or moderated interviews.
          </li>
          <li>
            <strong>Asking friends</strong> for typos and broken links. Not for whether strangers get it.
          </li>
        </ul>
        <p className={kit.prose}>
          Use JuryHour when you want a fast, fixed-price answer to &quot;do strangers understand my page, and is a rewrite
          better?&quot;, plus the copy to paste.
        </p>
      </Section>
    </main>
  );
}
