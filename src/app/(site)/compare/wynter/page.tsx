import { TIERS } from "@/lib/constants";
import { pageMetadata } from "@/lib/seo";
import { COMPARE_AS_OF, WYNTER } from "../../../../../content/compare";
import { HeadToHead } from "../_components/HeadToHead";

export const metadata = pageMetadata({
  title: "JuryHour vs Wynter: message testing compared",
  description: `Wynter vs JuryHour for testing landing page copy: audience, price, speed and what you get back. Sourced and dated, as of ${COMPARE_AS_OF}.`,
  path: "/compare/wynter",
  ogTitle: "JuryHour vs Wynter",
});

export default function CompareWynterPage() {
  const P = TIERS.proof;
  const X = TIERS.specialist;
  return (
    <HeadToHead
      slug="wynter"
      name="Wynter"
      h1="Is JuryHour a Wynter alternative?"
      lede="For founders and small teams, often yes. Wynter is a B2B message-testing platform with a large verified panel and annual plans; JuryHour is a fixed-price, same-day test that also writes the challenger copy."
      answer="Wynter is stronger for B2B audiences and research depth; JuryHour is cheaper per test, has no plan or contract, and hands you a rewrite tested against your page."
      sources={["wynter-pricing", "wynter-home"]}
      rows={[
        {
          label: "Audience",
          us: "Real people screened by one question to match your buyer, via Terac; Specialist Jury for job, industry and seniority",
          them: WYNTER.audience,
        },
        { label: "Price", us: `Fixed per test, Proof $${P.price} list; Specialist from $499 (quoted)`, them: WYNTER.price },
        { label: "Turnaround", us: `Same day (Proof jury deadline ${P.deadlineHours} h); Specialist 24–72 h`, them: WYNTER.speed },
        { label: "Test types", us: "First-impression test and A/B message test of your page vs a rewrite", them: WYNTER.tests },
        { label: "Writes copy for you", us: "Yes: a challenger from facts on your page, and the winning copy", them: WYNTER.rewrite },
        { label: "Respondents", us: "Real people only; answers graded by code and AI before they count", them: WYNTER.noAi },
        { label: "Commitment", us: "None; pay per test", them: "1-year prepaid contract on Pro; pay-as-you-go also available" },
      ]}
      theyAreBetter={{
        title: "Where is Wynter better than JuryHour?",
        answer: "On B2B depth and breadth. If your buyer is a specific professional, Wynter's panel and formats go further than ours.",
        points: [
          "A large panel of B2B professionals verified with real titles and companies at signup.",
          "More research formats: preference tests, surveys, brand tracking, interviews, pricing-page tests.",
          "Research advisors and managed projects on higher plans.",
          `Larger samples per test than our ${P.jurors}-person Proof or ${X.jurors}-person Specialist Jury.`,
        ],
      }}
      weAreBetter={{
        title: "Where is JuryHour better than Wynter?",
        answer: "On price, speed of getting started, and getting copy back, not just a score.",
        points: [
          "No annual plan or contract: one test from a fixed price, paid by card through Whop.",
          "We write the challenger and test it against your page, so you get the winning copy, not only the diagnosis.",
          "Consumer and prosumer buyers as well as B2B.",
          "A free AI preview before you pay anything.",
        ],
      }}
      whichTitle="Should I use Wynter or JuryHour?"
      which={
        <>
          <p>
            Use Wynter if you&apos;re a B2B company with a research budget and need verified titles at scale or recurring
            studies. Use JuryHour if you want a same-day answer on one page for a fixed price, with a tested rewrite, or if
            your buyer isn&apos;t a narrow B2B role.
          </p>
          <p>For a narrow professional buyer on JuryHour, choose the Specialist Jury.</p>
        </>
      }
    />
  );
}
