// Every FAQ on the site, grouped for /faq. Segment pages pick items by id.
// Rules: answer in the first sentence, no invented numbers, no promised discounts, prices live on
// /pricing (they can move, so FAQ text doesn't quote them). `aText` is the plain-text answer used
// for FAQPage JSON-LD; here `a` is plain text too, so they are the same string.
import { TIERS } from "@/lib/constants";

export type FaqItem = { id: string; q: string; a: string; aText: string };
export type FaqGroup = { id: string; title: string; items: FaqItem[] };

const item = (id: string, q: string, a: string): FaqItem => ({ id, q, a, aText: a });

const P = TIERS.proof;
const S = TIERS.spark;
const U = TIERS.pulse;
const X = TIERS.specialist;

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "product",
    title: "Product",
    items: [
      item(
        "what-is",
        "What is JuryHour?",
        "JuryHour tests your landing page on real people the same day. You paste a URL or your pitch, an AI agent writes a challenger version, and real, identity-verified people who match your buyer judge yours against ours. You get the verdict, their reasons in their own words, and the winning copy to paste.",
      ),
      item(
        "preview",
        "What does the free preview do?",
        "The free preview is an AI read of your page in about 10 seconds: what your page says, the line most likely to lose a stranger, a suggested rewrite and the jury we would recruit. It is AI guessing, not people. No card or login; you can run a few per day.",
      ),
      item(
        "what-tested",
        "What exactly do jurors see?",
        `Jurors see a short text card with your headline, subheadline, three key points and call to action, for 5 seconds. In Proof they see your card and our challenger, in random order, without knowing which is yours. They don't browse your site.`,
      ),
      item(
        "enough",
        `Is ${P.jurors} people enough?`,
        `${P.jurors} people is a directional signal, not a scientific study. It reliably catches the big problems (people can't say what you do, or who it's for) and shows which of two versions lands better. It won't measure a 2% conversion lift. For narrow professional buyers, use the Specialist Jury.`,
      ),
      item(
        "edit-site",
        "Do you edit my site?",
        "No. We never log in to or change your site. We deliver copy you can paste: a headline, subheadline, three bullets and a call to action.",
      ),
      item(
        "how-fast",
        "How fast do I get my verdict?",
        `Same day for Spark, Pulse and Proof. The jury deadline is ${S.deadlineHours} hours after payment for Spark and Pulse and ${P.deadlineHours} hours for Proof, halved with the Rush add-on. Specialist Jury takes 24 to 72 hours. You can watch progress on your order page.`,
      ),
      item(
        "guarantee",
        "Will this guarantee more sales?",
        "No. A verdict tells you what real people understood and preferred after a short look. It's research, not a sales guarantee. Use it to fix the obvious problems before you pay for traffic.",
      ),
    ],
  },
  {
    id: "jurors",
    title: "Jurors",
    items: [
      item(
        "who-jurors",
        "Who are the jurors?",
        "Jurors are real people recruited and paid through Terac, a research participant platform. For each order our agent writes a short description of your buyer and a screening question, and only people who pass the screener can take your test.",
      ),
      item(
        "verify",
        "How are jurors verified?",
        "Terac verifies each participant's identity before they can take paid studies. On our side, every answer has to pass code checks (at least 60 seconds on the task, an attention check, at least 15 words describing what the product does) and an AI quality grade before it counts.",
      ),
      item(
        "bad-answers",
        "What happens to low-effort answers?",
        "They are rejected with a written reason, aren't paid, and never reach your report. Only approved answers count toward your numbers and quotes.",
      ),
      item(
        "anonymous",
        "Can I contact a juror?",
        "No. Jurors are anonymous to you (\"Juror 6\"); we never show names, emails or profiles. Their identities stay with Terac.",
      ),
      item(
        "real-quotes",
        "Are the quotes in my report real?",
        "Yes. Before a report can be delivered, code checks that every quote matches a stored juror answer word for word and that every number matches what the database computed. A report that fails the check isn't delivered.",
      ),
      item(
        "cant-recruit",
        "What if you can't recruit my audience?",
        "You get an automatic refund. If too few matching people are available within the cost limits, our agent may first broaden the audience once (for example from a job title to people who buy software online); if that still fails, the order is refunded in full.",
      ),
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    items: [
      item(
        "unreleased",
        "Will strangers see my unreleased product?",
        "Jurors see the text card made from what you submit. Today we test public pages only, so please don't submit anything confidential. We don't ask jurors to sign an NDA, so treat what you submit as public.",
      ),
      item(
        "data-use",
        "What do you do with my page and email?",
        "We use them to run your preview and your order, and to send you order emails. We don't sell data. Details, processors and deletion requests are in the privacy policy at /legal/privacy.",
      ),
      item(
        "public-verdict",
        "Will my verdict be shown publicly?",
        "Only if you opt in. Each report has a \"Share my verdict\" checkbox; if you tick it, a share card with your headline verdict can appear on /verdicts. Untick it any time.",
      ),
    ],
  },
  {
    id: "pricing",
    title: "Pricing & refunds",
    items: [
      item(
        "tiers",
        "Which package should I buy?",
        `Spark (${S.jurors} people) is a quick first impression of your headline. Pulse (${U.jurors} people) is a full reaction to your current page. Proof (${P.jurors} people) tests your page against our rewrite and tells you which wins; it's the one we recommend. Launch Pack adds a free retest after you update. Specialist Jury (${X.jurors} verified professionals) is for narrow B2B buyers. Current prices are on /pricing.`,
      ),
      item(
        "upgrade",
        "Does my Spark count toward Proof?",
        "Yes. If you upgrade to Proof within 24 hours, what you paid for Spark is credited.",
      ),
      item(
        "codes",
        "Do promo codes give a discount?",
        "No. Partner codes like the ones in our links only tell us who sent you. The checkout has a code field so you can enter one; it doesn't change the price.",
      ),
      item(
        "refunds",
        "What's the refund policy?",
        "Refunds follow fixed rules in code. Full refund if we can't recruit your audience or reach the minimum panel by the deadline. A pro-rata refund if fewer jurors finish than you paid for. One support refund if delivery is very late or the report fails. Refunds go back through Whop to your original payment method. Full policy: /legal/refunds.",
      ),
      item(
        "payment",
        "How do I pay?",
        "Checkout runs on Whop, which handles the card payment and receipt. We never see your card details.",
      ),
    ],
  },
  {
    id: "agencies",
    title: "Agencies",
    items: [
      item(
        "white-label",
        "Can I give clients a report without your branding?",
        "A white-label report is available on request. Email us with the client page and how you want it presented, and we'll tell you what we can do for that order.",
      ),
      item(
        "affiliate",
        "Do you have an affiliate program?",
        "Yes. Affiliates earn 30% of each referred purchase through Whop's affiliate program. Whop pays commissions after its 30-day waiting period. See /affiliates.",
      ),
      item(
        "bundle",
        "Is there an agency bundle?",
        "We're setting up an agency bundle of 5 Proofs. There's no published price yet; ask us and we'll quote it.",
      ),
      item(
        "client-pages",
        "Can I test a client's page?",
        "Yes, as long as the page is public and you have the client's permission to submit it. The report is yours to share with them.",
      ),
    ],
  },
  {
    id: "agents",
    title: "Agents & developers",
    items: [
      item(
        "mcp",
        "Is there an MCP server?",
        "Not yet. A JuryHour MCP server with tools for previews, quotes, creating tests and reading verdicts is coming soon. Today you can call the public HTTP endpoints described on /agents.",
      ),
      item(
        "api-auth",
        "Do I need an API key?",
        "Not for the public endpoints. The preview endpoint requires a Cloudflare Turnstile token and is rate-limited per email and per IP, so it's built for browsers, not bulk use.",
      ),
      item(
        "who-runs",
        "Who runs JuryHour?",
        "AI agents run the day-to-day work as Claude scheduled tasks: research, writing the challenger, recruiting, grading, the report, support and refunds. Code enforces every money limit. The founder set it up; humans appear in the loop only as paid jurors.",
      ),
    ],
  },
];

export const ALL_FAQ: FaqItem[] = FAQ_GROUPS.flatMap((g) => g.items);

/** Pick FAQ items by id (throws at build time if an id is wrong). */
export function faqByIds(ids: string[]): FaqItem[] {
  return ids.map((id) => {
    const found = ALL_FAQ.find((i) => i.id === id);
    if (!found) throw new Error(`Unknown FAQ id: ${id}`);
    return found;
  });
}
