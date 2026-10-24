// Shared facts for the legal pages (docs/WEBSITE_SPEC.md §8, docs/WEBSITE_CONTRACTS.md §0.4–0.5).

export const LAST_UPDATED_LABEL = "Oct 24, 2026";
export const LAST_UPDATED_ISO = "2026-10-24";

export const NOT_LEGAL_ADVICE =
  "This policy is provided for transparency and is not legal advice; JuryHour will update it as the service evolves.";
export const DRAFT_NOTE = "Draft — pending founder review.";

/** Governing law placeholder for the founder to fill (WEBSITE_SPEC §8). */
export const GOVERNING_LAW = "[STATE]";

export const LEGAL_PAGES = [
  { path: "/legal/privacy", name: "Privacy policy", summary: "What we collect from customers and jurors, who processes it, and how to delete it." },
  { path: "/legal/terms", name: "Terms of service", summary: "What JuryHour is, what it isn't, what you can't submit, and our limits of liability." },
  { path: "/legal/refunds", name: "Refund policy", summary: "Exactly when you get money back, automatically or on request." },
  { path: "/legal/accessibility", name: "Accessibility statement", summary: "Our WCAG 2.2 AA target and how to report a barrier." },
] as const;

/** Service providers that process data for JuryHour (lead decision, WEBSITE_CONTRACTS §0.4). */
export const PROCESSORS = [
  { name: "Whop", role: "Payments, refunds, disputes and affiliate payouts. Whop handles your card details; we never see them." },
  { name: "Terac", role: "Recruits, screens, identity-verifies and pays jurors. Holds jurors' identities." },
  { name: "Exa", role: "Reads the public page you submit and searches the web for market research." },
  { name: "OpenAI", role: "AI models for the free preview, the content-safety screen and grading juror answers." },
  { name: "Anthropic", role: "Claude agents that research your market, write the report and run operations." },
  { name: "Supabase", role: "Database that stores orders, previews, tests and juror answers." },
  { name: "Vercel", role: "Hosts the website and provides cookieless page analytics." },
  { name: "Resend", role: "Sends order and preview emails." },
  { name: "Cloudflare", role: "Turnstile bot check on the free-preview form." },
] as const;
