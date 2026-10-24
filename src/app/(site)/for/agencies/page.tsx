import Link from "next/link";
import { Card, Section } from "@/components/ui";
import { AgencyOfferForm } from "@/components/preview/LeadForms";
import { pageMetadata } from "@/lib/seo";
import { faqByIds } from "../../../../../content/faq";
import { SegmentPage, type Segment } from "../_kit/SegmentPage";
import { kit } from "../_kit";

export const metadata = pageMetadata({
  title: "Real-buyer evidence for agency client pages",
  description:
    "Hand clients a verdict from real people with every page you ship. White-label reports on request, 30% affiliate commission through Whop.",
  path: "/for/agencies",
  ogTitle: "Real-buyer evidence for every client page",
});

function AgencyExtras() {
  return (
    <>
      <Section id="partner" title="How can an agency work with JuryHour?">
        <p className={kit.answer}>
          Three ways: run tests on client pages and pass the report on, refer clients and earn 30% through Whop, or
          ask us for a white-label report or a bundle. All three are available today; the last two are handled on
          request.
        </p>
        <div className={kit.grid3}>
          <Card>
            <span className={kit.label}>ON REQUEST</span>
            <h3>White-label report</h3>
            <p className={kit.muted}>
              Want the report presented without JuryHour branding for a client? Ask us with the client page and we&apos;ll
              tell you what we can do for that order.
            </p>
          </Card>
          <Card>
            <span className={kit.label}>30% VIA WHOP</span>
            <h3>Affiliate commission</h3>
            <p className={kit.muted}>
              Refer clients with your Whop affiliate link and earn 30% of each referred purchase. Whop pays after its
              30-day waiting period. <Link href="/affiliates">How the program works</Link>.
            </p>
          </Card>
          <Card>
            <span className={kit.label}>ASK US</span>
            <h3>Agency bundle (5 Verdicts)</h3>
            <p className={kit.muted}>
              Testing pages for several clients? We&apos;re setting up a bundle of 5 Verdicts. There&apos;s no published price
              yet; <Link href="/contact">ask us</Link> and we&apos;ll quote it.
            </p>
          </Card>
        </div>
      </Section>

      <Section id="free-proof" title="Can I try it on a live client page first?">
        <p className={kit.answer}>
          Yes, you can apply for a free Verdict on one live, public client page. Tell us the page and the client&apos;s
          buyer; we review requests and reply by email. Not every request is accepted, and you need the client&apos;s
          permission to submit their page.
        </p>
        <AgencyOfferForm />
      </Section>
    </>
  );
}

const seg: Segment = {
  slug: "agencies",
  name: "Agencies",
  eyebrow: "FOR AGENCIES & FREELANCERS",
  h1: "Hand clients real-buyer evidence with every page you ship.",
  lede: "Before launch, run the client's page past real, identity-verified people who match their buyer. You get a verdict, the reasons in jurors' own words, and tested copy, to present the same day.",
  problem: {
    title: "Why do agencies lose arguments about copy?",
    answer:
      "Because it's your opinion against the client's. A verdict from 20 real people in the client's market settles the headline debate with evidence instead of taste.",
    points: [
      { label: "THE CLIENT", title: "Loves their tagline.", body: "Strangers who match the buyer may not understand it. Now you can show them." },
      { label: "THE REVIEW", title: "Goes round in circles.", body: "Rounds of feedback from people who already know the product." },
      { label: "THE LAUNCH", title: "Is on you.", body: "If the page underperforms, the agency gets the blame. Test it first." },
    ],
  },
  example: {
    title: "What would a verdict look like for a client page?",
    answer:
      "Here's an illustrative Verdict for a client's accounting firm page. Card A is the client's copy; card B is the kind of challenger our agent writes, using only facts on the page.",
    a: {
      headline: "Your partner in financial excellence",
      subheadline: "Trusted solutions for businesses of every size, delivered with integrity and expertise.",
      bullets: ["Tailored solutions", "Decades of experience", "Client-first approach"],
      cta: "Contact us",
    },
    b: {
      headline: "Monthly bookkeeping and tax filing for restaurants, at a fixed fee",
      subheadline: "We close your books by the 10th of each month and file your sales and income tax returns.",
      bullets: ["Books closed by the 10th", "Sales and income tax filings included", "Restaurants and cafés only"],
      cta: "Get a fixed-fee quote",
    },
    quotes: [
      { juror: 3, text: "Financial excellence could be a bank, an advisor or software. I skipped it." },
      { juror: 7, text: "Restaurants only made me trust it more, they know my problems." },
    ],
  },
  highlight: "proof",
  pricingTitle: "What does a test on a client page cost?",
  pricingAnswer:
    "The same fixed prices as everyone else. Verdict is the one to put in front of a client: their page against our rewrite, judged by 20 real people.",
  faqTitle: "Questions from agencies",
  faq: faqByIds(["client-pages", "white-label", "affiliate", "bundle", "codes", "anonymous", "refunds"]),
  extra: <AgencyExtras />,
};

export default function AgenciesPage() {
  return <SegmentPage seg={seg} />;
}
