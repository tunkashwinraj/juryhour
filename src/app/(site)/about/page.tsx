import { Suspense } from "react";
import Link from "next/link";
import { Section } from "@/components/ui";
import {
  ADS_DAILY_CAP_PER_CAMPAIGN,
  ADS_DAILY_CAP_TOTAL,
  LOW_TERAC_BALANCE_USD,
  MARGIN_FLOOR,
  MAX_REJECT_RATE,
  PRICE_BAND,
} from "@/lib/constants";
import { getLiveCounters } from "@/lib/marketing-data";
import { pageMetadata } from "@/lib/seo";
import { PageHero, kit } from "../for/_kit";

export const metadata = pageMetadata({
  title: "About JuryHour: a company with zero employees",
  description:
    "JuryHour is run by AI agents with code-enforced limits. Humans appear only as paid jurors. How it works, the guardrails, and who built it.",
  path: "/about",
  ogTitle: "A company with zero employees",
});

const pct = (x: number) => `${Math.round(x * 100)}%`;

const ROLES: { role: string; runs: string; does: string }[] = [
  { role: "Researcher", runs: "Each paid order", does: "Reads your page, researches how your market talks, writes card A (your message) and card B (the challenger), the buyer description and the screening question." },
  { role: "Analyst", runs: "When the jury is done", does: "Writes the report from approved answers and database numbers, and checks itself against a rubric before submitting." },
  { role: "Procurement", runs: "When a panel can't launch", does: "Shrinks the panel within the minimum, broadens the audience once, or refunds in full." },
  { role: "Support", runs: "When a customer writes in", does: "Answers order questions from the order record; may issue one policy refund." },
  { role: "Disputes", runs: "When a payment is disputed", does: "Submits the evidence packet that code builds from stored records." },
  { role: "CEO", runs: "Hourly", does: "Pauses sales when the jury budget runs low, resumes when it recovers, adjusts prices within a band, writes a status note." },
  { role: "CFO", runs: "Daily", does: "Produces the profit and loss from the ledger and raises cash warnings. Changes nothing." },
  { role: "Growth", runs: "Hourly", does: "Looks at which channels bring paying customers, manages ad budgets within caps, and drafts community posts (never posts them)." },
];

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
}

/** Live counters from the database (live mode only). Each shows only when it's at least 1. */
async function LiveCounters() {
  const c = await getLiveCounters();
  const items: { label: string; value: string }[] = [];
  if (c.verdictsDelivered >= 1) items.push({ label: "verdicts delivered", value: String(c.verdictsDelivered) });
  if (c.peopleHeard >= 1) items.push({ label: "real people heard", value: String(c.peopleHeard) });
  if (c.verdictsDelivered >= 1 && c.avgDeliveryMinutes !== null && c.avgDeliveryMinutes >= 1) {
    items.push({ label: "average time to verdict", value: formatMinutes(c.avgDeliveryMinutes) });
  }
  if (items.length === 0) return null;
  return (
    <Section id="counters" title="How much has JuryHour done so far?">
      <p className={kit.answer}>Live from our database, paid orders only. Test orders aren&apos;t counted.</p>
      <dl className={kit.counters}>
        {items.map((i) => (
          <div key={i.label}>
            <dt>{i.label}</dt>
            <dd>{i.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export default function AboutPage() {
  return (
    <main id="main">
      <PageHero
        crumbs={[{ name: "About", path: "/about" }]}
        eyebrow="ABOUT JURYHOUR"
        title="A company with zero employees."
        lede="JuryHour has no staff. AI agents research, write, recruit, grade, report and handle refunds; code enforces every money limit; humans appear only as the paid jurors who judge your page."
      />

      <Suspense fallback={null}>
        <LiveCounters />
      </Suspense>

      <Section id="who" title="Who does the work at JuryHour?">
        <p className={kit.answer}>
          Eight AI agents, each with one job. They run as Claude scheduled tasks and act only through our Ops API. Quick
          checks (the free preview, the content-safety screen and grading juror answers) use OpenAI models.
        </p>
        <div className={kit.tableScroll}>
          <table className={kit.table}>
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Runs</th>
                <th scope="col">Does</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((r) => (
                <tr key={r.role}>
                  <th scope="row">{r.role}</th>
                  <td>{r.runs}</td>
                  <td>{r.does}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={kit.prose} style={{ marginTop: 16 }}>
          Between agent runs, a reconciler in code moves each order to its next step, retries stuck steps, and refunds
          automatically when the rules say so.
        </p>
      </Section>

      <Section id="guardrails" title="What stops an agent from doing something expensive?">
        <p className={kit.answer}>
          Agents decide; code enforces. An agent can ask for an action, but it can never move money directly, and code
          refuses any request outside fixed limits.
        </p>
        <ul className={kit.prose}>
          <li>No jury panel launches below a {pct(MARGIN_FLOOR)} gross margin or over the tier&apos;s jury budget.</li>
          <li>Refunds never exceed what the customer paid, and support refunds are limited to one per order.</li>
          <li>Prices can move at most {pct(PRICE_BAND)} from base, once a day per package.</li>
          <li>
            Ad budgets are capped at ${ADS_DAILY_CAP_PER_CAMPAIGN} per campaign and ${ADS_DAILY_CAP_TOTAL} a day in total.
          </li>
          <li>Sales pause automatically when the jury budget falls below ${LOW_TERAC_BALANCE_USD}.</li>
          <li>
            If more than {pct(MAX_REJECT_RATE)} of a panel&apos;s answers would be rejected, code stops and flags a bug
            instead.
          </li>
          <li>A report can&apos;t be delivered unless every quote matches a stored answer and every number matches the database.</li>
          <li>Customer pages, juror answers and emails are treated as data, never as instructions.</li>
          <li>Every agent decision is logged with its reasoning.</li>
        </ul>
        <p className={kit.prose}>
          The method in detail: <Link href="/how-it-works">How it works</Link>.
        </p>
      </Section>

      <Section id="stack" title="Which companies does JuryHour rely on?">
        <p className={kit.answer}>
          A short list of processors, each doing one thing. The privacy policy has the details.
        </p>
        <ul className={kit.prose}>
          <li>
            <strong>Whop</strong>: payments, refunds and the affiliate program.
          </li>
          <li>
            <strong>Terac</strong>: recruiting, identity verification and paying jurors.
          </li>
          <li>
            <strong>Exa</strong>: reading your page and market research.
          </li>
          <li>
            <strong>OpenAI</strong>: the free preview, the safety screen and grading answers.
          </li>
          <li>
            <strong>Anthropic</strong>: the Claude agents (research, reports, operations).
          </li>
          <li>
            <strong>Supabase</strong> (database), <strong>Vercel</strong> (hosting), <strong>Resend</strong> (email),{" "}
            <strong>Cloudflare</strong> (bot check).
          </li>
        </ul>
        <p className={kit.prose}>
          <Link href="/legal/privacy">Privacy policy</Link>
        </p>
      </Section>

      <Section id="origin" title="Where did JuryHour come from?">
        <p className={kit.answer}>
          JuryHour was built in one day at the Zero-Human Company Hackathon by Terac at Whop HQ on October 24, 2026.
          The goal: a company that sells, delivers, supports and refunds with no human staff.
        </p>
        <p className={kit.prose}>
          What changed since then is on the <Link href="/changelog">changelog</Link>.
        </p>
        <p className={kit.prose}>
          <strong>Founded by Ashwin Raj Tunk, Founder &amp; CEO.</strong>
        </p>
      </Section>
    </main>
  );
}
