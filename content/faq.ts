// Every FAQ on the site, grouped for /faq. Segment pages pick items by id.
// Rules: answer in the first sentence, no invented numbers, no promised discounts. Prices come from the
// constants and the coupon config (the same values checkout uses); /pricing shows the live prices.
// `aText` is the plain-text answer used for FAQPage JSON-LD; here `a` is plain text too, so they are the
// same string.
import {
  EXTRA_JUROR_USD,
  MAX_EXTRA_JURORS,
  TIERS,
  UPGRADE_CREDIT_HOURS,
  VERDICT_REGULAR_FROM,
  VERDICT_REGULAR_USD,
} from "@/lib/constants";
import { LAUNCH20_DEFAULT, couponEndsLabel, couponPrice } from "@/lib/coupons";

export type FaqItem = { id: string; q: string; a: string; aText: string };
export type FaqGroup = { id: string; title: string; items: FaqItem[] };

const item = (id: string, q: string, a: string): FaqItem => ({ id, q, a, aText: a });

const P = TIERS.proof;
const S = TIERS.spark;
const C = LAUNCH20_DEFAULT;
const C_LINE = `${C.percentOff}% off your first Verdict with code ${C.code} until ${couponEndsLabel(C.endsAt)} → $${couponPrice(P.price, C.percentOff)}`;

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
        `Jurors see a short text card with your headline, subheadline, three key points and call to action, for 5 seconds. In a Verdict they see your card and our challenger, in random order, without knowing which is yours. They don't browse your site.`,
      ),
      item(
        "enough",
        `Is ${P.jurors} people enough?`,
        `${P.jurors} people is a directional signal, not a scientific study. It reliably catches the big problems (people can't say what you do, or who it's for) and shows which of two versions lands better. It won't measure a 2% conversion lift.`,
      ),
      item(
        "edit-site",
        "Do you edit my site?",
        "No. We never log in to or change your site. We deliver copy you can paste: a headline, subheadline, three bullets and a call to action.",
      ),
      item(
        "how-fast",
        "How fast do I get my verdict?",
        `Same day for Quick Read and Verdict. The jury deadline is ${S.deadlineHours} hours after payment for Quick Read and ${P.deadlineHours} hours for Verdict. You can watch progress on your order page.`,
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
        `Quick Read ($${S.price}, ${S.jurors} people) is a quick first impression of your headline. Verdict ($${P.price} launch offer · regular $${VERDICT_REGULAR_USD} from ${VERDICT_REGULAR_FROM}, ${P.jurors} people) tests your page against our rewrite and tells you which wins; it's the one we recommend. You can add up to ${MAX_EXTRA_JURORS} extra jurors at $${EXTRA_JUROR_USD} each to a Quick Read or Verdict. Current prices are on /pricing.`,
      ),
      item(
        "upgrade",
        "Does my Quick Read count toward a Verdict?",
        `Yes. If you upgrade to a Verdict within ${UPGRADE_CREDIT_HOURS} hours, what you paid for the Quick Read is credited ($${P.price} − $${S.price} = $${P.price - S.price}). Use the upgrade link in your Quick Read report. The credit doesn't combine with a discount code: checkout applies whichever saves you more.`,
      ),
      item(
        "codes",
        "Do promo codes give a discount?",
        `Partner codes like the ones in our links only tell us who sent you and don't change the price. The one discount code is ${C.code}: ${C_LINE}. It applies to the Verdict price only and doesn't combine with other discounts, including the Quick Read upgrade credit (checkout applies whichever saves you more).`,
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
        "We're setting up an agency bundle of 5 Verdicts. There's no published price yet; ask us and we'll quote it.",
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
