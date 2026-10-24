import type { Metadata } from "next";
import { BANNED_CATEGORIES } from "@/lib/constants";
import { pageMetadata, supportEmail } from "@/lib/seo";
import { LegalPage, type LegalSection } from "../_ui/LegalPage";
import { GOVERNING_LAW } from "../_ui/legal";
import s from "../_ui/prose.module.css";

const PATH = "/legal/terms";

export const metadata: Metadata = pageMetadata({
  title: "Terms of service",
  description:
    "The terms for using JuryHour: what the service is, what results mean, what you may not submit, juror anonymity, and our limits of liability.",
  path: PATH,
});

/** Plain-English labels for BANNED_CATEGORIES (src/lib/constants.ts), in the same order. */
const BANNED_LABELS: Record<(typeof BANNED_CATEGORIES)[number], string> = {
  "gambling/sports picks/trading signals": "Gambling, sports picks or trading signals",
  adult: "Adult content",
  "guaranteed income or get-rich-quick": "Guaranteed-income or get-rich-quick schemes",
  "scam/phishing": "Scams or phishing",
  hate: "Hate content",
  weapons: "Weapons",
  "illegal goods": "Illegal goods or services",
  MLM: "Multi-level marketing (MLM)",
};

function sections(): LegalSection[] {
  const email = supportEmail();
  return [
    {
      id: "agreement",
      title: "Agreeing to these terms",
      body: (
        <p>
          By using JuryHour (the website, the free preview, or a paid test) you agree to these terms and to our{" "}
          <a href="/legal/privacy">privacy policy</a> and <a href="/legal/refunds">refund policy</a>. You must be at least 18
          and able to enter a contract. If you use JuryHour for a business, you accept these terms for that business.
        </p>
      ),
    },
    {
      id: "service",
      title: "What JuryHour does",
      body: (
        <>
          <p>
            You submit a public landing page or a pitch and describe your buyer. AI agents read it, research the market and
            write a challenger version. Real people who match your buyer, recruited through Terac, react to your version and
            (on packages that include it) the challenger, in random order. You get a written report with their anonymous
            quotes and the numbers behind the verdict.
          </p>
          <p>
            JuryHour is operated by AI agents within limits enforced by code. Packages, prices and add-ons are as shown at
            checkout and can change; the price you see at checkout is the price you pay.
          </p>
        </>
      ),
    },
    {
      id: "results",
      title: "Results are directional research, not a guarantee",
      body: (
        <>
          <p>
            A verdict reflects what a small panel of real people said at one moment. It is directional signal, not a
            prediction or guarantee of sales, conversions, revenue or any other outcome. Panels are small, audience matching
            is approximate, and people&apos;s answers can differ from what they would actually do.
          </p>
          <p>
            You decide what to do with a report. AI-written suggestions (the preview, the challenger version and the winning
            copy) can contain mistakes; check facts and claims before you publish them.
          </p>
        </>
      ),
    },
    {
      id: "your-content",
      title: "What you submit",
      body: (
        <>
          <p>When you submit a page or pitch, you confirm that:</p>
          <ul>
            <li>you own it or have the right to submit it for testing;</li>
            <li>
              the page is publicly accessible (no logins, private drafts or confidential material), and you&apos;re
              comfortable with people outside your company seeing it;
            </li>
            <li>it is truthful and doesn&apos;t break any law or anyone else&apos;s rights.</li>
          </ul>
          <p>
            You keep ownership of your content. You give JuryHour permission to copy, process and show it to jurors and our
            service providers as needed to run your test, and to rewrite it for the challenger version. You own the report
            and the winning copy we deliver to you. If you choose to make a verdict public, you allow us to show its share
            card and excerpts on our site.
          </p>
        </>
      ),
    },
    {
      id: "prohibited",
      title: "What we don't test",
      body: (
        <>
          <p>We refuse pages and pitches in these categories, usually at the free preview before any payment:</p>
          <ul>
            {BANNED_CATEGORIES.map((c) => (
              <li key={c} data-category={c}>
                {BANNED_LABELS[c]}
              </li>
            ))}
          </ul>
          <p>
            We may also refuse or stop a test if content is deceptive, infringes someone&apos;s rights, targets jurors with
            anything harmful, or tries to manipulate our systems (for example, instructions hidden in a page).
          </p>
        </>
      ),
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      body: (
        <ul>
          <li>Don&apos;t try to identify, contact or recruit jurors, or ask them for personal information.</li>
          <li>Don&apos;t overload, scrape, probe or attack the service, or get around rate limits or bot checks.</li>
          <li>Don&apos;t use JuryHour to build a competing panel or dataset from jurors&apos; answers.</li>
          <li>Don&apos;t resell reports as your own research service without our written permission.</li>
        </ul>
      ),
    },
    {
      id: "jurors",
      title: "Juror anonymity",
      body: (
        <p>
          Jurors are anonymous to customers. Reports label them only by number (&ldquo;Juror 06&rdquo;). Terac holds their
          identities and we never share names, emails, photos or profiles with customers. Jurors are paid through Terac and
          we reject answers only for clear low quality, always with a written reason.
        </p>
      ),
    },
    {
      id: "payment",
      title: "Payment and refunds",
      body: (
        <p>
          Payments are processed by Whop and are subject to Whop&apos;s terms. Promo codes record where you heard about us;
          they don&apos;t change the price unless the checkout shows a different price. Refunds follow our{" "}
          <a href="/legal/refunds">refund policy</a>, which is enforced in code.
        </p>
      ),
    },
    {
      id: "liability",
      title: "Limits of liability",
      body: (
        <>
          <p>
            JuryHour is provided &ldquo;as is&rdquo;. To the extent the law allows, we make no warranties beyond what these
            terms say, including any warranty that a report will be error-free or that acting on it will improve your
            results.
          </p>
          <p>
            To the extent the law allows, JuryHour is not liable for indirect or consequential losses (such as lost profits,
            revenue or ad spend), and our total liability for any claim about an order is limited to the amount you paid for
            that order. Nothing in these terms limits liability that can&apos;t be limited by law.
          </p>
          <p>
            You are responsible for claims that arise from content you submit or from how you use a report.
          </p>
        </>
      ),
    },
    {
      id: "termination",
      title: "Suspension",
      body: (
        <p>
          We may refuse service, suspend access or cancel an order that breaks these terms. Refunds for cancelled orders
          follow our <a href="/legal/refunds">refund policy</a>.
        </p>
      ),
    },
    {
      id: "law",
      title: "Governing law",
      body: (
        <p>
          These terms are governed by the laws of <span className={s.mono}>{GOVERNING_LAW}</span>, without regard to its
          conflict-of-law rules. If you&apos;re a consumer, you keep any rights the law of your home country gives you.
        </p>
      ),
    },
    {
      id: "changes",
      title: "Changes and contact",
      body: (
        <p>
          We will update these terms as the service changes and change the &ldquo;Last updated&rdquo; date. The terms in
          place when you paid apply to that order. Questions: <strong className={s.mono}>{email}</strong>.
        </p>
      ),
    },
  ];
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      lede="The rules for using JuryHour, in plain English."
      path={PATH}
      sections={sections()}
    />
  );
}
