import type { Metadata } from "next";
import { pageMetadata, supportEmail } from "@/lib/seo";
import { LegalPage, type LegalSection } from "../_ui/LegalPage";
import { PROCESSORS } from "../_ui/legal";
import s from "../_ui/prose.module.css";

const PATH = "/legal/privacy";

export const metadata: Metadata = pageMetadata({
  title: "Privacy policy",
  description:
    "What JuryHour collects from customers and jurors, who processes it, how long we keep it, and how to have it deleted. We never sell your data.",
  path: PATH,
});

function sections(): LegalSection[] {
  const email = supportEmail();
  return [
    {
      id: "summary",
      title: "The short version",
      body: (
        <ul>
          <li>We collect what we need to test your page: your email, the page or pitch you submit, and who your buyer is.</li>
          <li>Jurors are anonymous to you. Their identities stay with Terac, our recruiting partner, and are never shared with customers.</li>
          <li>We use a small set of service providers (listed below) to run JuryHour. We never sell your data.</li>
          <li>
            Email <strong className={s.mono}>{email}</strong> to see or delete your data.
          </li>
        </ul>
      ),
    },
    {
      id: "who-we-are",
      title: "Who we are",
      body: (
        <p>
          JuryHour (&ldquo;we&rdquo;, &ldquo;us&rdquo;) tests landing pages and pitches with real people who match your buyer.
          This policy covers the website, the free preview, paid tests, the juror answer page and the emails we send. It
          applies to two groups: <strong>customers</strong> (people who submit a page) and <strong>jurors</strong> (people who
          answer our questions through Terac).
        </p>
      ),
    },
    {
      id: "customers",
      title: "What we collect from customers",
      body: (
        <>
          <ul>
            <li>
              <strong>What you submit:</strong> the URL or pitch text, the text we read from that public page, and your
              description of your buyer.
            </li>
            <li>
              <strong>Your email address,</strong> to send your preview, order updates and report.
            </li>
            <li>
              <strong>Order details:</strong> package, add-ons, price, any promo code you entered, and where you came from
              (for example a <span className={s.mono}>?src=</span> link).
            </li>
            <li>
              <strong>Payment:</strong> Whop processes your payment. We receive a payment reference, the amount and its status.
              We never see or store your card number.
            </li>
            <li>
              <strong>A one-way hash of your IP address,</strong> used only to rate-limit free previews and forms and to stop
              abuse.
            </li>
            <li>
              <strong>Messages you send us,</strong> and forms such as the waitlist or agency offer.
            </li>
          </ul>
          <p>
            Your order and report are reachable through a private link we email you. Anyone with that link can see them, so
            keep it to yourself. A report is shown publicly only if you tick the box allowing it.
          </p>
        </>
      ),
    },
    {
      id: "jurors",
      title: "What we collect from jurors",
      body: (
        <>
          <p>
            Terac recruits, screens, identity-verifies and pays jurors. <strong>Terac holds jurors&apos; identities.</strong>{" "}
            We receive an anonymous submission ID, not a name, email or profile.
          </p>
          <ul>
            <li>Your answers to our questions, which version you saw first, and time spent on each part.</li>
            <li>Whether you passed the attention check, and the quality grade and reason we gave your answers.</li>
          </ul>
          <p>
            Customers see your answers labeled only by number (&ldquo;Juror 06&rdquo;). We never show customers your name,
            email, photo or profile, and we ask you not to put personal details in your answers. Quotes from your answers
            can appear in the customer&apos;s report, and in a public share card if the customer opts in. If we reject an
            answer for low quality we always give a written reason.
          </p>
        </>
      ),
    },
    {
      id: "how-we-use-it",
      title: "How we use it",
      body: (
        <ul>
          <li>To run the preview and the test you paid for, write your report and deliver it.</li>
          <li>To screen content we don&apos;t accept, and to grade juror answers for quality.</li>
          <li>To process payments, refunds and disputes, and to keep accounting records.</li>
          <li>
            To send order emails, and at most two follow-up emails after a free preview (each with an unsubscribe link).
          </li>
          <li>To prevent abuse and keep the service secure.</li>
          <li>To count visits and see which links bring customers, without identifying you.</li>
        </ul>
      ),
    },
    {
      id: "ai",
      title: "How AI is used",
      body: (
        <p>
          JuryHour is run by AI agents. Your page text, buyer description and juror answers are sent to OpenAI and Anthropic
          models to write the preview and the challenger version, screen content, grade answers and write the report.
          Every quote in a report is checked against a stored juror answer, and every number comes from our database. We
          don&apos;t use your submissions to train our own models.
        </p>
      ),
    },
    {
      id: "processors",
      title: "Who processes your data",
      body: (
        <>
          <p>We share data only with the service providers we need to run JuryHour:</p>
          <div className={s.tableWrap} role="region" aria-label="Service providers" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">What they do for us</th>
                </tr>
              </thead>
              <tbody>
                {PROCESSORS.map((p) => (
                  <tr key={p.name}>
                    <th scope="row">{p.name}</th>
                    <td>{p.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Each provider handles data under its own terms and privacy policy. Some are based in the United States, so your
            data may be processed there. We may also disclose data if the law requires it.
          </p>
        </>
      ),
    },
    {
      id: "no-sale",
      title: "We don't sell your data",
      body: <p>We don&apos;t sell or rent personal data, and we don&apos;t share it for cross-site advertising.</p>,
    },
    {
      id: "cookies",
      title: "Cookies and analytics",
      body: (
        <>
          <p>We set two first-party cookies, only to remember how you found us:</p>
          <ul>
            <li>
              <span className={s.mono}>jh_src</span> stores the source code from a link like{" "}
              <span className={s.mono}>?src=</span> (30 days).
            </li>
            <li>
              <span className={s.mono}>jh_attr</span> stores the source, campaign tags (<span className={s.mono}>utm_*</span>)
              and promo code from your first visit (30 days).
            </li>
          </ul>
          <p>
            They contain no personal details and aren&apos;t shared with ad networks. Your browser may also keep your last
            free preview in session storage so you don&apos;t have to fill in the form twice; it is cleared when you close
            the tab.
          </p>
          <p>
            Page analytics come from Vercel Web Analytics, which doesn&apos;t use cookies: it counts visits with a hash of
            the request that is discarded after 24 hours, and reports only aggregate numbers. The free-preview form uses
            Cloudflare Turnstile to check that you&apos;re a person. Because we use no advertising or tracking cookies, we
            don&apos;t show a cookie banner.
          </p>
        </>
      ),
    },
    {
      id: "retention",
      title: "How long we keep it",
      body: (
        <>
          <p>
            We keep previews, orders, reports and juror answers while they are needed to provide the service, handle refunds
            and disputes, and keep records. We don&apos;t yet delete data on a fixed schedule; when we set fixed retention
            periods we will list them here. Payment and accounting records are kept as long as tax law requires.
          </p>
          <p>You can ask us to delete your data at any time (see below).</p>
        </>
      ),
    },
    {
      id: "your-rights",
      title: "Seeing, correcting or deleting your data",
      body: (
        <>
          <p>
            Email <strong className={s.mono}>{email}</strong> from the address you used. Tell us whether you want a copy,
            a correction or deletion. We aim to complete requests within 30 days. We may keep records we&apos;re legally
            required to keep (for example payment records) and will tell you what those are.
          </p>
          <p>
            Jurors: Terac holds your identity. To delete your account or identity data, contact Terac. To delete your
            answers from JuryHour, email us with your Terac submission ID.
          </p>
          <p>To stop follow-up emails, use the unsubscribe link in any of them.</p>
        </>
      ),
    },
    {
      id: "security",
      title: "Security",
      body: (
        <p>
          Data is stored with Supabase and served over HTTPS. Access is limited to the systems that run JuryHour. No method of
          storage or transfer is perfectly secure; if a breach affects your data we will tell you.
        </p>
      ),
    },
    {
      id: "children",
      title: "Children",
      body: <p>JuryHour is not for anyone under 18. We don&apos;t knowingly collect data from children.</p>,
    },
    {
      id: "changes",
      title: "Changes and contact",
      body: (
        <p>
          We will update this page as the service changes and change the &ldquo;Last updated&rdquo; date. Questions:{" "}
          <strong className={s.mono}>{email}</strong>.
        </p>
      ),
    },
  ];
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      lede="What we collect from customers and jurors, who processes it, and how to have it deleted."
      path={PATH}
      sections={sections()}
    />
  );
}
