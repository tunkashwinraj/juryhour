// Example report for /sample-report. Everything here is illustrative: the product ("Brieflane"),
// the jurors and their answers are invented to show the real report layout. The page labels it
// "Example report. Names and numbers are illustrative."
//
// The fixture follows the same rules as a real report (tests/website/d/sample-report.test.ts):
// - it parses with the Report Zod schema,
// - every scorecard number equals what the juror answers below produce (as SQL would compute it),
// - every quote is a verbatim substring of the named juror's answer.
//
// When a real dogfood report exists (with permission), set SAMPLE_REPORT_SOURCE to "dogfood" and
// point the page at it.
import type { Answers, Card, Report } from "@/lib/types";
import type { JurorRow, ReportData } from "@/lib/queries";

export const SAMPLE_REPORT_SOURCE: "example" | "dogfood" = "example";

/** Case header shown above the example (illustrative). */
export const SAMPLE_CASE = {
  caseNo: "0142",
  tier: "Proof",
  jurors: 15,
  delivered: "3h 40m",
  product: "Brieflane (a fictional product)",
} as const;

const ORDER_ID = "6f0c2a4e-3b1d-4c5e-8a7f-0000000000aa";
const rid = (n: number) => `5a1c0d2e-7b3f-4e21-9c4d-${String(n).padStart(12, "0")}`;

export const SAMPLE_CARD_A: Card = {
  headline: "The future of client communication",
  subheadline: "An AI-powered workspace that streamlines collaboration and unlocks productivity for modern teams.",
  bullets: ["Smart workflows", "Seamless integrations", "Insights that matter"],
  cta: "Get started",
};

export const SAMPLE_CARD_B: Card = {
  headline: "Turn a week of Slack threads into a client update in 2 minutes",
  subheadline:
    "Brieflane reads the project channels you pick and drafts a plain-English weekly update for each client. You edit and send.",
  bullets: [
    "Drafts one update per client from the threads you choose",
    "Lists what shipped, what's blocked and what you need from the client",
    "For freelancers and small agencies who bill by the project",
  ],
  cta: "Draft my first update",
};

type CardTuple = [what: string, clarity: number, wouldTry: number, confusing: string];
type JurorSeed = {
  n: number;
  first: "A" | "B";
  A: CardTuple;
  B: CardTuple;
  preferred: "A" | "B";
  why: string;
  ua: boolean;
  ub: boolean;
};

const ATTENTION = "Drafts one update per client";

const SEEDS: JurorSeed[] = [
  {
    n: 1, first: "A",
    A: ["Some kind of AI tool for teams to work together better, maybe a chat app or a project management thing, not sure which one.", 2, 2, "I honestly couldn't tell what it does. Every line could describe any software company."],
    B: ["It reads your Slack project channels and writes a weekly update you can send to each client, for freelancers who bill by project.", 6, 5, ""],
    preferred: "B", why: "The second one told me exactly what I get and how long it takes.", ua: false, ub: true,
  },
  {
    n: 2, first: "B",
    A: ["A workspace app with AI that helps a team collaborate and be more productive, with integrations and some insights dashboard.", 3, 3, "Smart workflows and insights that matter are buzzwords. What is the actual output?"],
    B: ["A tool that turns Slack threads into client status updates so freelancers don't have to write them by hand every week.", 6, 5, "Does it only work with Slack?"],
    preferred: "B", why: "I could picture using it on Friday afternoon instead of writing updates myself.", ua: false, ub: true,
  },
  {
    n: 3, first: "A",
    A: ["Software that helps companies communicate with their clients, using AI to organize the work and connect with other tools they use.", 4, 3, "It says client communication but not how, email or chat or reports."],
    B: ["Brieflane drafts weekly client updates from your Slack channels, listing what shipped and what is blocked, and you edit then send.", 5, 4, "Not sure what it costs."],
    preferred: "B", why: "More specific. The first one sounded like every other startup homepage.", ua: true, ub: true,
  },
  {
    n: 4, first: "B",
    A: ["I think it is an AI platform for productivity but I could not say what it does day to day or who would buy it.", 2, 2, "No idea who it is for. Modern teams is everyone."],
    B: ["It writes the weekly update email for each client by reading your project Slack threads, aimed at freelancers and small agencies.", 7, 6, ""],
    preferred: "B", why: "It names who it is for and that is me, I run a two person studio.", ua: false, ub: true,
  },
  {
    n: 5, first: "A",
    A: ["A collaboration tool with AI and workflows, probably something like Notion or Asana but with a focus on clients somehow.", 3, 3, "I couldn't tell what it does that Notion doesn't."],
    B: ["Reads Slack conversations for each project and turns them into a client update with shipped items, blockers and questions for the client.", 6, 5, "Does it only work with Slack? We use Teams."],
    preferred: "B", why: "Clear outcome and a time I can check: two minutes.", ua: false, ub: true,
  },
  {
    n: 6, first: "B",
    A: ["An AI workspace for client communication that streamlines how agencies work with their clients and connects their tools together.", 5, 4, "Fine but generic."],
    B: ["It drafts client updates out of Slack threads so a freelancer can send a weekly summary to every client without writing it.", 6, 5, "Not sure what it costs or if there is a free trial."],
    preferred: "A", why: "The first one feels bigger, like a full platform, not just one feature.", ua: true, ub: true,
  },
  {
    n: 7, first: "A",
    A: ["Some AI software that helps teams be productive and gives them insights, maybe analytics for how the team is working.", 3, 3, "What insights? About what?"],
    B: ["A Slack bot that summarizes channels, maybe for managers who want a digest of what their team talked about during the week.", 5, 4, "Is it for clients or for my own team? I read it as a team digest."],
    preferred: "B", why: "At least I know it connects to Slack.", ua: false, ub: false,
  },
  {
    n: 8, first: "B",
    A: ["An AI tool for teams that makes work smoother with workflows and integrations, but I really could not say more than that honestly.", 2, 2, "I honestly couldn't tell what it does from this."],
    B: ["Brieflane turns the Slack threads for a project into a weekly client update, saying what was done, what is stuck and what is needed.", 6, 5, ""],
    preferred: "B", why: "I understood it in one read.", ua: false, ub: true,
  },
  {
    n: 9, first: "A",
    A: ["A client communication workspace that uses AI to automate workflows between an agency and its clients and integrates with existing tools.", 4, 4, "Would like to see what the screen looks like."],
    B: ["Writes weekly updates for clients from your Slack, for freelancers. You check the draft and send it to the client yourself.", 6, 5, "Two minutes sounds too good. How accurate is the draft?"],
    preferred: "A", why: "The second one sounds narrow; I want something that handles all my client comms.", ua: true, ub: true,
  },
  {
    n: 10, first: "B",
    A: ["Productivity software with artificial intelligence. Something about collaboration and integrations, but the description never says what the main feature is.", 3, 3, "Insights that matter is meaningless."],
    B: ["It saves freelancers time by drafting a client update from Slack threads every week, with blockers and the questions for the client.", 7, 6, ""],
    preferred: "B", why: "Writing client updates is the worst part of my week. This one says it does exactly that.", ua: false, ub: true,
  },
  {
    n: 11, first: "A",
    A: ["Maybe a CRM or a messaging tool for businesses that uses AI. It is hard to say because the text is very vague.", 3, 3, "Is it a CRM? A chat app? A dashboard?"],
    B: ["A tool for small agencies that reads project Slack channels and drafts a status update for each client that you can edit.", 5, 4, "What happens with private channels? Does it read everything?"],
    preferred: "B", why: "Specific about what it reads and what it writes.", ua: false, ub: true,
  },
  {
    n: 12, first: "B",
    A: ["Something for teams with AI. I cannot really describe it, the words are all general and could fit any product out there.", 2, 2, "No idea who it is for or what it costs."],
    B: ["Drafts the weekly client email from Slack threads so freelancers who bill per project spend less time on status updates.", 6, 5, "Not sure what it costs."],
    preferred: "B", why: "The second one solves a problem I actually have.", ua: false, ub: true,
  },
  {
    n: 13, first: "A",
    A: ["A platform that improves how agencies talk to clients, with AI that organizes work and plugs into the tools a team already uses.", 4, 4, "Okay but I want an example of what it produces."],
    B: ["It reads the Slack channels you choose and writes a client update for each client, covering shipped work, blockers and requests.", 6, 5, "What happens with private channels I don't want it to read?"],
    preferred: "B", why: "Shows the output, the first one only promises productivity.", ua: true, ub: true,
  },
  {
    n: 14, first: "B",
    A: ["An AI collaboration product for companies, with workflows and integrations. It might help teams share information with their customers more easily.", 3, 3, "Generic but I get the general idea."],
    B: ["Some kind of Slack summary tool, it seems to write reports from chats, I am not sure who reads them, the team or the boss.", 4, 4, "Client update could mean a lot of things."],
    preferred: "A", why: "The second one was too specific to Slack and I don't use Slack.", ua: false, ub: false,
  },
  {
    n: 15, first: "A",
    A: ["An AI tool that is supposed to make a team more productive. I could not tell what it does or why I would pay for it.", 3, 3, "I couldn't tell what it does or why I'd switch to it."],
    B: ["Brieflane takes Slack project threads and drafts a weekly update for each client, aimed at freelancers and small studios.", 6, 5, "Does it work with Slack only, or also email threads?"],
    preferred: "B", why: "It is obvious what I would get on the first day.", ua: false, ub: true,
  },
];

const toCard = ([what_it_does, clarity, would_try, confusing]: CardTuple) => ({
  what_it_does,
  clarity,
  would_try,
  confusing,
});

/** Juror answers as stored (each with the response id a quote cites). */
export const SAMPLE_RESPONSES: { response_id: string; juror: JurorRow }[] = SEEDS.map((s) => {
  const answers: Answers = {
    cards: { A: toCard(s.A), B: toCard(s.B) },
    preferred: s.preferred,
    why: s.why,
    attention_choice: ATTENTION,
  };
  return {
    response_id: rid(s.n),
    juror: { juror_number: s.n, first_card: s.first, answers, understood_a: s.ua, understood_b: s.ub },
  };
});

const q = (n: number, text: string) => ({ response_id: rid(n), text, juror_label: `Juror ${n}` });

export const SAMPLE_REPORT: Report = {
  headline_verdict: "Your challenger wins 12 of 15",
  winner: "B",
  scorecard: {
    n_approved: 15,
    prefer_a: 3,
    prefer_b: 12,
    clarity_a: 3.07,
    clarity_b: 5.8,
    intent_a: 2.93,
    intent_b: 4.87,
    understanding_rate_a: 0.27,
    understanding_rate_b: 0.87,
  },
  top_fixes: [
    {
      title: "Say what it does in the headline",
      detail:
        "After 5 seconds, 11 of 15 jurors could not describe the current page. They read it as generic AI software. The challenger names the input (Slack threads), the output (a client update) and the time (2 minutes).",
      evidence_quotes: [
        q(1, "I honestly couldn't tell what it does. Every line could describe any software company."),
        q(8, "I honestly couldn't tell what it does from this."),
        q(15, "I couldn't tell what it does or why I'd switch to it."),
      ],
    },
    {
      title: "Name who it is for",
      detail:
        "\"Modern teams\" told jurors nothing. Jurors who run small studios recognized themselves only in the challenger's line about freelancers and small agencies.",
      evidence_quotes: [
        q(4, "No idea who it is for. Modern teams is everyone."),
        q(4, "It names who it is for and that is me, I run a two person studio."),
        q(12, "No idea who it is for or what it costs."),
      ],
    },
    {
      title: "Replace buzzwords with the output",
      detail:
        "\"Smart workflows\" and \"Insights that matter\" were the most criticized lines. Jurors wanted to see what the product produces; the challenger's bullet listing shipped work, blockers and requests did that.",
      evidence_quotes: [
        q(2, "Smart workflows and insights that matter are buzzwords. What is the actual output?"),
        q(10, "Insights that matter is meaningless."),
        q(13, "Shows the output, the first one only promises productivity."),
      ],
    },
  ],
  winning_copy: SAMPLE_CARD_B,
  rewritten_headline: null,
  still_unsolved: [
    "Price: 3 jurors asked what it costs. Neither version says.",
    "Tools: 4 jurors asked whether it works beyond Slack (Teams, email). Neither version says.",
  ],
  method_caveats:
    "15 real people, directional signal, not a sales guarantee. Jurors were US adults who work with clients on a project basis, recruited through Terac. Each saw both versions for 5 seconds in random order.",
};

export const SAMPLE_REPORT_DATA: ReportData & { report: Report } = {
  orderId: ORDER_ID,
  token: "example-report",
  mode: "live",
  tier: "proof",
  stage: "DELIVERED",
  pricePaid: null,
  paidAt: null,
  refundUsd: 0,
  reportPublic: false,
  report: SAMPLE_REPORT,
  cardA: SAMPLE_CARD_A,
  cardB: SAMPLE_CARD_B,
  jurors: SAMPLE_RESPONSES.map((r) => r.juror),
  stats: { ...SAMPLE_REPORT.scorecard, prefer_a: 3, prefer_b: 12 },
};
