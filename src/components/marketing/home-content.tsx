// Home-page copy and data (docs/WEBSITE_SPEC.md §5). Everything illustrative lives in EXAMPLE_CASE
// and is rendered inside blocks labeled "Example". Competitor facts carry their source in COMPARE.
import Link from "next/link";
import type { ReactNode } from "react";

/** Partner logos need written permission (WEBSITE_SPEC §5.3). TODO: flip only with approval on file. */
export const PARTNER_LOGOS_APPROVED = false;

/** One made-up case reused by the hero artifact and the report excerpt. Not a customer result. */
export const EXAMPLE_CASE = {
  caseNo: "0142",
  tier: "Proof",
  jurors: 15,
  delivered: "3h 40m",
  headlineA: "The all-in-one workspace for modern teams.",
  headlineB: "Turn every client call into a signed proposal in 10 minutes.",
  preferB: 12,
  heroQuotes: [
    { juror: "06", text: "A could be any software. B told me what I'd get and how fast." },
    { juror: "11", text: "I'd click B. With A I couldn't tell who it was for." },
  ],
  scorecard: [
    { label: "Understood after 5 s", a: "4/15", b: "13/15", better: "b" as const },
    { label: "Clarity (1–7)", a: "3.1", b: "5.8", better: "b" as const },
    { label: "Would try (1–7)", a: "2.9", b: "4.9", better: "b" as const },
  ],
  topFix: {
    title: "Say who it's for and what they get, in the headline.",
    quotes: [
      { juror: "03", text: "All-in-one for what? I left before I found out." },
      { juror: "09", text: "Workspace sounds like a notes app. I didn't know it did proposals." },
    ],
  },
  winningCopy: {
    headline: "Turn every client call into a signed proposal in 10 minutes.",
    subheadline: "Paste your call notes and get a priced, ready-to-sign proposal while the client still remembers you.",
    cta: "Draft my first proposal",
  },
};

export const winningCopyText = () =>
  [EXAMPLE_CASE.winningCopy.headline, EXAMPLE_CASE.winningCopy.subheadline, EXAMPLE_CASE.winningCopy.cta].join("\n\n");

export const PROBLEM_POINTS = [
  { label: "YOUR FRIENDS", text: "Say it looks great. They're not your buyer." },
  { label: "YOUR ANALYTICS", text: "Show people leave. Not why." },
  { label: "YOUR AD SPEND", text: "Keeps buying traffic for a page strangers don't understand." },
];

export const STEPS = [
  {
    title: "Paste your page.",
    text: "Free AI preview shows what your page says in 5 seconds, your weakest line, and a rewrite.",
  },
  {
    title: "We hire your jury.",
    text: "An agent writes a challenger and recruits real people who match your buyer through Terac. Each sees both versions for 5 seconds, in random order, without knowing which is yours.",
  },
  {
    title: "You get the verdict.",
    text: "Which version won and by how much, what confused people in their own words, and the winning copy ready to paste. Same day.",
  },
];

export const AUDIENCES = [
  {
    href: "/for/whop-sellers",
    title: "Whop sellers",
    text: "Your sales page is your business. Find out why visitors don't buy.",
  },
  {
    href: "/for/lovable-builders",
    title: "Lovable, Bolt & Replit builders",
    text: "You built it in a weekend. Find out tonight if anyone gets it.",
  },
  {
    href: "/for/agencies",
    title: "Agencies",
    text: "Hand clients real-buyer evidence with every page you ship. Earn 30%.",
  },
];

// ---------------------------------------------------------------- compare (§5.10)

export const COMPARE_AS_OF = "Oct 2026";
export const USERTESTING_SOURCE = "https://www.usertesting.com/plans";

export const COMPARE_COLUMNS = ["JuryHour", "Wynter", "PickFu", "UserTesting", "Asking friends"];

/** "—" = the vendor doesn't publish it or we couldn't verify it. `jhPrice` is filled from live prices. */
export function compareRows(jhPrice: string): { label: string; cells: ReactNode[] }[] {
  return [
    {
      label: "Real people",
      cells: [
        "Yes, identity-verified through Terac",
        "Yes, verified B2B panel",
        "Yes, consumer polls",
        "Yes, opt-in participant panel",
        "Yes, but rarely your buyer",
      ],
    },
    { label: "Rewrites your copy", cells: ["Yes, an AI challenger", "—", "—", "—", "No"] },
    { label: "Tests old vs new", cells: ["Yes (Proof): blind, random order", "—", "—", "—", "Not blind"] },
    {
      label: "Price per test",
      cells: [jhPrice, "$20K/yr plan, or pay per test", "From $1 per response (min. 15)", "Quote only", "Free"],
    },
    {
      label: "Turnaround",
      cells: ["Same day", "12–48 h", "Within hours", "Most sessions in a few hours", "Whenever they reply"],
    },
    { label: "Setup", cells: ["Paste a URL. No login.", "—", "—", "Talk to sales for a plan", "A group chat"] },
  ];
}

export const COMPARE_FOOTNOTE: ReactNode = (
  <>
    As of {COMPARE_AS_OF}, from each vendor&rsquo;s own site (checked Oct 24, 2026): Wynter&rsquo;s verified B2B panel,
    12–48 h results, Pro plan $20,000/yr or pay-as-you-go per test (
    <a href="https://wynter.com/pricing" rel="noopener">
      wynter.com/pricing
    </a>
    ); PickFu&rsquo;s consumer panel, from $1 per response with a 15-respondent minimum, results within hours (
    <a href="https://www.pickfu.com/pricing" rel="noopener">
      pickfu.com/pricing
    </a>
    ); UserTesting&rsquo;s participant panel, quoted pricing, &ldquo;80% of sessions in just a few hours&rdquo; (
    <a href={USERTESTING_SOURCE} rel="noopener">
      usertesting.com/plans
    </a>
    ). &ldquo;—&rdquo; means the vendor doesn&rsquo;t publish it or we couldn&rsquo;t verify
    it. Wynter&rsquo;s B2B panel is deeper than ours for senior B2B audiences.
  </>
);

// ---------------------------------------------------------------- FAQ (§5.11)

export type FaqItem = { q: string; a: ReactNode; aText: string };

export const HOME_FAQ: FaqItem[] = [
  {
    q: "Who are the jurors?",
    aText:
      "Real people recruited through Terac who match the buyer you describe. Each is paid for their time and answers anonymously: you never see who they are, and they never see who you are.",
    a: (
      <p>
        Real people recruited through{" "}
        <a href="https://terac.com" rel="noopener">
          Terac
        </a>{" "}
        who match the buyer you describe. Each is paid for their time and answers anonymously: you never see who they
        are, and they never see who you are.
      </p>
    ),
  },
  {
    q: "How do you verify them?",
    aText:
      "Terac verifies each juror's identity before they can take part. We add our own checks: time on task, an attention check, a minimum answer length and AI grading of every answer. Work that fails isn't paid for and doesn't count toward your results.",
    a: (
      <p>
        Terac verifies each juror&rsquo;s identity before they can take part. We add our own checks: time on task, an
        attention check, a minimum answer length and AI grading of every answer. Work that fails isn&rsquo;t paid for
        and doesn&rsquo;t count toward your results.
      </p>
    ),
  },
  {
    q: "Will strangers see my unreleased product?",
    aText:
      "Jurors see the page you submit. Today we test public pages only, so don't submit anything confidential or unreleased.",
    a: (
      <p>
        Jurors see the page you submit. Today we test public pages only, so don&rsquo;t submit anything confidential or
        unreleased.
      </p>
    ),
  },
  {
    q: "Is 15 people enough?",
    aText:
      "For a directional signal, yes: 15 people who match your buyer, judging both versions blind, will show whether strangers get your page and which version they prefer. It's not a scientific study and it can't predict sales. If you sell to a narrow professional audience, use Specialist Jury, which recruits verified professionals by job, industry and seniority.",
    a: (
      <p>
        For a directional signal, yes: 15 people who match your buyer, judging both versions blind, will show whether
        strangers get your page and which version they prefer. It&rsquo;s not a scientific study and it can&rsquo;t
        predict sales. If you sell to a narrow professional audience, use Specialist Jury, which recruits verified
        professionals by job, industry and seniority.
      </p>
    ),
  },
  {
    q: "How fast is it?",
    aText:
      "The free AI preview takes about 10 seconds. Spark, Pulse, Proof and Launch Pack are delivered the same day. Specialist Jury takes 24 to 72 hours because the audience is harder to recruit.",
    a: (
      <p>
        The free AI preview takes about 10 seconds. Spark, Pulse, Proof and Launch Pack are delivered the same day.
        Specialist Jury takes 24 to 72 hours because the audience is harder to recruit.
      </p>
    ),
  },
  {
    q: "What if you can't recruit my audience?",
    aText:
      "You get your money back automatically. If we can't recruit the minimum panel, you get a full refund; if we deliver fewer jurors than you paid for, you get a pro-rata refund.",
    a: (
      <p>
        You get your money back automatically. If we can&rsquo;t recruit the minimum panel, you get a full refund; if
        we deliver fewer jurors than you paid for, you get a pro-rata refund.
      </p>
    ),
  },
  {
    q: "Do you edit my site?",
    aText: "No. We never touch your site. We deliver the copy; you paste it in if you like it.",
    a: <p>No. We never touch your site. We deliver the copy; you paste it in if you like it.</p>,
  },
  {
    q: "What's your refund policy?",
    aText:
      "Full refund if we can't recruit your audience or deliver the minimum panel, a pro-rata refund if we deliver short, and support refunds for late or failed delivery. The refund policy at /legal/refunds has the details.",
    a: (
      <p>
        Full refund if we can&rsquo;t recruit your audience or deliver the minimum panel, a pro-rata refund if we
        deliver short, and support refunds for late or failed delivery. Read the{" "}
        <Link href="/legal/refunds">refund policy</Link> for the details.
      </p>
    ),
  },
];
