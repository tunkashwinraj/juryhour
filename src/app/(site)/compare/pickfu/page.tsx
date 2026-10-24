import { TIERS } from "@/lib/constants";
import { pageMetadata } from "@/lib/seo";
import { COMPARE_AS_OF, PICKFU } from "../../../../../content/compare";
import { HeadToHead } from "../_components/HeadToHead";

export const metadata = pageMetadata({
  title: "JuryHour vs PickFu: landing page testing compared",
  description: `PickFu vs JuryHour for testing a landing page: audience, price per test, speed and what you get back. Sourced and dated, as of ${COMPARE_AS_OF}.`,
  path: "/compare/pickfu",
  ogTitle: "JuryHour vs PickFu",
});

export default function ComparePickFuPage() {
  const P = TIERS.proof;
  return (
    <HeadToHead
      slug="pickfu"
      name="PickFu"
      h1="Is JuryHour a PickFu alternative?"
      lede="For testing a landing page message, it can be. PickFu runs fast consumer polls on almost anything; JuryHour runs one focused test on your page and writes the challenger for you."
      answer="PickFu is better for large consumer polls and visual variants; JuryHour is built for one job, finding out whether strangers get your page, and hands you tested copy."
      sources={["pickfu-pricing", "pickfu-home"]}
      rows={[
        { label: "Audience", us: "Real people screened to match your buyer, via Terac", them: PICKFU.audience },
        { label: "Price", us: `Fixed per test: Quick Read $${TIERS.spark.price} (${TIERS.spark.jurors} people) to Verdict $${P.price} (${P.jurors} people)`, them: PICKFU.price },
        { label: "Turnaround", us: `Same day (Verdict jury deadline ${P.deadlineHours} h)`, them: PICKFU.speed },
        { label: "What's tested", us: "Your page's message as a 5-second card; in Verdict, against a rewrite", them: PICKFU.tests },
        { label: "Writes copy for you", us: "Yes: a challenger from facts on your page, and the winning copy", them: PICKFU.rewrite },
        { label: "Setup", us: "Paste a URL or pitch; the agent writes the test", them: "You write the poll question and upload the options" },
      ]}
      theyAreBetter={{
        title: "Where is PickFu better than JuryHour?",
        answer: "On scale, flexibility and price per response for consumer polls.",
        points: [
          "A much larger consumer panel, targetable by 100+ traits across 15+ countries.",
          "Bigger samples: polls start at 15 respondents and can go far higher.",
          "Tests images, packaging, ads and many variants at once, not just page copy.",
          "Results start arriving within minutes.",
        ],
      }}
      weAreBetter={{
        title: "Where is JuryHour better than PickFu?",
        answer: "When you don't want to design the test yourself and you want copy back, not just votes.",
        points: [
          "You paste a page; the agent writes both cards, the screening question and the attention check.",
          "Jurors see each card for 5 seconds, blind and in random order, which measures first impressions.",
          "Every answer is checked (time, attention, effort, AI grade) before it counts.",
          "You get a verdict, top fixes with jurors' own words, and the winning copy to paste.",
        ],
      }}
      whichTitle="Should I use PickFu or JuryHour?"
      which={
        <p>
          Use PickFu to poll a large consumer audience on visuals, names or many options. Use JuryHour when the question is
          &quot;do strangers understand my landing page, and would a rewrite do better?&quot; and you want the answer and
          the copy the same day.
        </p>
      }
    />
  );
}
