import { pageMetadata } from "@/lib/seo";
import { faqByIds } from "../../../../../content/faq";
import { SegmentPage, type Segment } from "../_kit/SegmentPage";

export const metadata = pageMetadata({
  title: "Test your Lovable, Bolt or Replit app page",
  description:
    "Built it in a weekend? Find out tonight if strangers get it. Real people judge your landing page against a rewrite. Verdict and copy the same day.",
  path: "/for/lovable-builders",
  ogTitle: "You built it in a weekend. Does anyone get it?",
});

const seg: Segment = {
  slug: "lovable-builders",
  name: "Lovable builders",
  eyebrow: "FOR LOVABLE, BOLT, REPLIT, CURSOR & V0 BUILDERS",
  h1: "You built it in a weekend. Find out tonight if anyone gets it.",
  lede: "Paste the landing page you shipped with Lovable, Bolt, Replit, Cursor or v0. Real people who match your buyer tell you what they think it does, and judge it against a rewrite our agent writes.",
  problem: {
    title: "Why do AI-built landing pages fail with strangers?",
    answer:
      "Because the generated copy describes the category, not your product. \"AI-powered platform that streamlines your workflow\" reads fine to you and means nothing to a stranger who has 5 seconds.",
    points: [
      { label: "THE TEMPLATE", title: "Sounds like everyone.", body: "Generated hero copy tends toward the same safe phrases. Strangers can't tell you apart." },
      { label: "YOUR FRIENDS", title: "Say it looks great.", body: "They're being kind, and they're not your buyer." },
      { label: "YOUR LAUNCH", title: "Gets one shot.", body: "Product Hunt, a Reddit post, your first ads: people decide in seconds whether to read on." },
    ],
  },
  example: {
    title: "What would a verdict look like for a weekend SaaS?",
    answer:
      "Here's an illustrative Verdict for a habit-tracking app built in a weekend. Card A is the generated page; card B is the kind of challenger our agent writes, using only facts on the page.",
    a: {
      headline: "Transform your life with AI",
      subheadline: "The all-in-one AI-powered platform to streamline your goals and unlock your potential.",
      bullets: ["AI-driven insights", "Seamless experience", "Built for everyone"],
      cta: "Get started free",
    },
    b: {
      headline: "Text one habit check-in a day. Get a weekly chart of what you kept.",
      subheadline: "Reply yes or no to one daily text message. Every Sunday you get a chart of your streaks.",
      bullets: ["Works over SMS, no app to install", "One question a day, under 10 seconds", "Weekly streak chart by email"],
      cta: "Start with one habit",
    },
    quotes: [
      { juror: 2, text: "Unlock your potential tells me nothing. Is it a journal, a coach, a calendar?" },
      { juror: 9, text: "No app to install is the thing that would make me try it." },
    ],
  },
  highlight: "proof",
  pricingTitle: "Which package should a weekend project start with?",
  pricingAnswer:
    "Quick Read is the cheapest way to hear from real people tonight: 3 people react to your headline and you get a rewritten headline. When you're about to spend on ads or a launch, Verdict tests your whole hero against our rewrite on 15 people.",
  faqTitle: "Questions from indie builders",
  faq: faqByIds(["preview", "what-tested", "edit-site", "how-fast", "upgrade", "codes", "unreleased"]),
};

export default function LovableBuildersPage() {
  return <SegmentPage seg={seg} />;
}
