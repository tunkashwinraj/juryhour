// /changelog entries, newest first. Written from the real git history (git log --oneline).
// Add a dated entry when something customers or jurors can notice ships.
export type ChangelogEntry = { date: string; title: string; items: string[] };

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-10-24",
    title: "Simpler pricing",
    items: [
      "Two plans: Quick Read ($49, 3 real people) and Verdict ($299 launch offer, 15 real people; regular $499 from Dec 1).",
      "20% off your first Verdict with code LAUNCH20 until Nov 30 → $239.",
      "Extra jurors: add up to 20 to a Quick Read or Verdict at $16 each.",
      "Older packages and add-ons are no longer sold. Orders already placed are delivered as bought.",
      "A Quick Read still counts toward a Verdict if you upgrade within 24 hours. One discount per order: the credit and LAUNCH20 don't combine, and checkout applies the bigger saving.",
    ],
  },
  {
    date: "2026-10-24",
    title: "Website: partner codes, new pages",
    items: [
      "A one-day launch offer on the recommended package (ended).",
      "Partner codes in links (like ?code=WHOP) are recorded for attribution. They don't change the price.",
      "New pages: how it works, sample report, pages for Whop sellers, Lovable builders and agencies, comparisons, FAQ, about, agents, affiliates, contact, verdicts and this changelog.",
    ],
  },
  {
    date: "2026-10-24",
    title: "Website hotfix",
    items: [
      "Prices render with the page instead of loading afterwards.",
      "Clear URL / pitch tabs on the preview form.",
      "Added a site footer.",
    ],
  },
  {
    date: "2026-10-24",
    title: "Going live",
    items: [
      "Deployment wiring: signed payment and recruiting webhooks, and the reconciler that moves orders forward.",
      "Failure drills (chaos tests) and end-to-end tests run against the sandbox.",
    ],
  },
  {
    date: "2026-10-24",
    title: "The product",
    items: [
      "Free AI preview with a content-safety screen.",
      "Checkout through Whop, with automatic refunds by fixed rules.",
      "Juror recruiting through Terac and the juror test page: 5-second cards, random order, attention check.",
      "AI answer grading, SQL statistics and the verdict report with verbatim-checked quotes.",
      "Agent instructions for research, reporting, recruiting fallbacks, support and disputes; order emails.",
    ],
  },
  {
    date: "2026-10-24",
    title: "Foundations",
    items: [
      "Database schema, order state machine and the guardrailed Ops API that every agent acts through.",
      "Built at the Zero-Human Company Hackathon by Terac at Whop HQ.",
    ],
  },
];
