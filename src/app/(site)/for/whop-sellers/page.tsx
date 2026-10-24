import { pageMetadata } from "@/lib/seo";
import { faqByIds } from "../../../../../content/faq";
import { SegmentPage, type Segment } from "../_kit/SegmentPage";

export const metadata = pageMetadata({
  title: "Test your Whop sales page on real buyers",
  description:
    "Find out why visitors don't buy. Real, identity-verified people judge your Whop sales page against a rewrite. Verdict and winning copy the same day.",
  path: "/for/whop-sellers",
  ogTitle: "Find out why your Whop page doesn't sell",
});

const seg: Segment = {
  slug: "whop-sellers",
  name: "Whop sellers",
  eyebrow: "FOR WHOP SELLERS",
  h1: "Your sales page is your business. Find out why visitors don't buy.",
  lede: "Paste your Whop page. Our agent writes a challenger, real people who match your buyer judge both in random order, and you get the winner and the copy to paste, the same day.",
  problem: {
    title: "Why do visitors leave a Whop page without buying?",
    answer:
      "Usually because they can't tell in a few seconds what they get, who it's for, or why it's worth the price. You can't see that from your dashboard, and people already in your community are the wrong people to ask.",
    points: [
      { label: "YOUR MEMBERS", title: "Already bought.", body: "They know what's inside. A stranger on your sales page doesn't." },
      { label: "YOUR STATS", title: "Show the drop-off.", body: "Views and checkouts tell you that people leave, not what they didn't understand." },
      { label: "YOUR ADS", title: "Keep paying for clicks.", body: "Every visitor who doesn't get the offer in 5 seconds is ad spend gone." },
    ],
  },
  example: {
    title: "What would a verdict look like for a course or community?",
    answer:
      "Here's an illustrative Verdict for a course that teaches freelance designers to find clients. Card A is the page as written; card B is the kind of challenger our agent writes, using only facts on the page.",
    a: {
      headline: "Level up your freelance game",
      subheadline: "Join the community that's changing the game. Exclusive content, live calls and more.",
      bullets: ["Exclusive Discord access", "Weekly live calls", "Lifetime updates"],
      cta: "Join now",
    },
    b: {
      headline: "A 30-day cold email course for freelance designers who need clients",
      subheadline: "Daily 10-minute lessons, email templates you can copy, and a weekly live call that reviews your outreach.",
      bullets: [
        "30 short lessons, one a day",
        "Cold email templates written for designers",
        "Weekly live call where your emails get reviewed",
      ],
      cta: "Start the 30 days",
    },
    quotes: [
      { juror: 4, text: "The first one could be any Discord. The second one tells me what I do every day." },
      { juror: 11, text: "Live calls and more, more of what? I'd want to know what the course is." },
    ],
  },
  highlight: "proof",
  pricingTitle: "Which package fits a Whop product?",
  pricingAnswer:
    "Verdict is the one we recommend for a sales page: 20 real people compare your page with our rewrite and you get the winner. Quick Read is a fast first impression of your headline.",
  faqTitle: "Questions from Whop sellers",
  faq: faqByIds(["what-tested", "enough", "who-jurors", "codes", "refunds", "guarantee", "unreleased"]),
};

export default function WhopSellersPage() {
  return <SegmentPage seg={seg} />;
}
