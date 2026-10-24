// Competitor facts for /compare, /compare/wynter and /compare/pickfu.
// Every fact here was read on the competitor's own website on COMPARE_AS_OF. Each fact carries its
// source id; pages render the sources as footnotes. Update the date when you re-check.
export const COMPARE_AS_OF = "Oct 2026";
export const COMPARE_CHECKED_ON = "2026-10-24";

export type SourceId = "wynter-pricing" | "wynter-home" | "pickfu-pricing" | "pickfu-home" | "usertesting-plans";

export const SOURCES: Record<SourceId, { label: string; url: string }> = {
  "wynter-pricing": { label: "Wynter pricing", url: "https://wynter.com/pricing" },
  "wynter-home": { label: "Wynter home page", url: "https://wynter.com/" },
  "pickfu-pricing": { label: "PickFu pricing", url: "https://www.pickfu.com/pricing" },
  "pickfu-home": { label: "PickFu home page", url: "https://www.pickfu.com/" },
  "usertesting-plans": { label: "UserTesting plans", url: "https://www.usertesting.com/plans" },
};

export type Fact = { text: string; src: SourceId[] };

export const WYNTER: Record<string, Fact> = {
  audience: { text: "Verified B2B professionals (86K+, \"real titles, real companies, verified at signup\")", src: ["wynter-pricing", "wynter-home"] },
  speed: { text: "Results in 12–48 hours", src: ["wynter-pricing", "wynter-home"] },
  price: {
    text: "Pro plan $20,000/yr (1-year prepaid); Elite $40,000/yr; pay-as-you-go per test, about 1.5× the plan rate",
    src: ["wynter-pricing"],
  },
  tests: {
    text: "Message tests, preference tests, B2B surveys, landing and pricing page tests, interviews",
    src: ["wynter-home"],
  },
  rewrite: { text: "Scores your messaging and explains why; the site doesn't say it writes copy for you", src: ["wynter-home"] },
  noAi: { text: "\"No synthetic data. No AI respondents, ever.\"", src: ["wynter-home"] },
};

export const PICKFU: Record<string, Fact> = {
  audience: { text: "Consumer panel, targeting by 100+ traits in 15+ countries; respondents sign an NDA", src: ["pickfu-home", "pickfu-pricing"] },
  speed: { text: "\"Get results within hours\"; votes and written feedback start arriving within minutes", src: ["pickfu-home"] },
  price: {
    text: "Pay as you go \"starting at $1 a response\", minimum 15 respondents per poll; PickFu+ from $999/yr or $99/month",
    src: ["pickfu-pricing"],
  },
  tests: { text: "Split tests and surveys on creative, packaging, pricing, ads, landing pages and messaging", src: ["pickfu-home"] },
  rewrite: { text: "AI analysis summarizes themes in the answers; the site doesn't say it writes copy for you", src: ["pickfu-home"] },
};

export const USERTESTING: Record<string, Fact> = {
  audience: { text: "Global participant panel in 60+ countries with demographic filters and screeners", src: ["usertesting-plans"] },
  speed: { text: "\"80% of sessions in just a few hours\"", src: ["usertesting-plans"] },
  price: { text: "Prices not published; plans are quoted (\"Request pricing\")", src: ["usertesting-plans"] },
  tests: { text: "Moderated and unmoderated video sessions, card sorting, tree testing", src: ["usertesting-plans"] },
};

/** Numbered footnotes in a stable order for a page. */
export function footnotes(ids: SourceId[]): { n: number; id: SourceId; label: string; url: string }[] {
  return [...new Set(ids)].map((id, i) => ({ n: i + 1, id, ...SOURCES[id] }));
}
