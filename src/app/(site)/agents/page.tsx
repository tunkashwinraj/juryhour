import Link from "next/link";
import { Badge, Section } from "@/components/ui";
import {
  BUYABLE_TIERS,
  EXTRA_JUROR_USD,
  MAX_EXTRA_JURORS,
  PREVIEW_LIMIT_PER_EMAIL_PER_DAY,
  PREVIEW_LIMIT_PER_IP_PER_DAY,
  RETEST_WINDOW_DAYS,
  TIER_LABELS,
} from "@/lib/constants";
import { pageMetadata, siteUrl } from "@/lib/seo";
import { faqByIds } from "../../../../content/faq";
import { FaqBlock, PageHero, kit } from "../for/_kit";

export const metadata = pageMetadata({
  title: "JuryHour for AI agents and developers",
  description:
    "Let an agent test a landing page on real people: the public HTTP endpoints available today, and the JuryHour MCP server and tools coming soon.",
  path: "/agents",
  ogTitle: "JuryHour for AI agents",
});

const TOOLS: { name: string; does: string }[] = [
  { name: "juryhour_preview", does: "Free AI preview of a URL or pitch: headline read, weakest line, rewrite, suggested jury. Includes the safety screen." },
  { name: "juryhour_create_test", does: "Create an order for a tier and return a Whop checkout URL for a human to pay." },
  { name: "juryhour_get_verdict", does: "Read order status and, once delivered, the verdict report." },
];

const previewExample = (base: string) => `curl -X POST ${base}/api/preview \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com",
    "buyer_desc": "Freelance designers who bill by project",
    "email": "you@example.com",
    "turnstile_token": "<token from the Turnstile widget>"
  }'

# 200 {"ok":true,"preview_id":"…","result":{"headline":"…","weakest_line":"…",
#      "rewrite_suggestion":"…","recommended_panel":"…", …}}
# 200 {"ok":true,"preview_id":"…","refused":true,"reason":"…"}`;

const checkoutExample = (base: string) => `curl -X POST ${base}/api/checkout \\
  -H "Content-Type: application/json" \\
  -d '{
    "tier": "proof",
    "email": "you@example.com",
    "buyer_desc": "Freelance designers who bill by project",
    "url": "https://example.com",
    "preview_id": "<from /api/preview: run the free preview first, it includes our content check>"
  }'

# 200 {"ok":true,"purchase_url":"https://whop.com/…","token":"…","price_usd":299,
#      "coupon_applied":null,"credit_usd":0,"discount_applied":null,"discount_note":null}
# A human opens purchase_url and pays. Then poll the order:

curl ${base}/api/order/<token>
# 200 {"ok":true,"order":{"stage":"PANEL_LIVE","approved_n":7,"requested_n":15,
#      "has_report":false, …}}`;

export default function AgentsPage() {
  const base = siteUrl();
  return (
    <main id="main">
      <PageHero
        crumbs={[{ name: "For AI agents", path: "/agents" }]}
        eyebrow="FOR AI AGENTS & DEVELOPERS"
        title="Can an AI agent order a JuryHour test?"
        lede="Partly, today. The public HTTP endpoints our own site uses are documented below; an agent can create an order and hand a human the checkout link. A proper MCP server is coming soon."
      />

      <Section id="mcp" title="Is there a JuryHour MCP server?">
        <p className={kit.answer}>
          Not yet. We&apos;re building an MCP server so agents can preview a page, get a quote, create a test and read the
          verdict as tools. None of these tools is available today.
        </p>
        <div className={kit.tableScroll}>
          <table className={kit.table}>
            <thead>
              <tr>
                <th scope="col">Tool</th>
                <th scope="col">What it will do</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((t) => (
                <tr key={t.name}>
                  <th scope="row">
                    <code>{t.name}</code>
                  </th>
                  <td>{t.does}</td>
                  <td>
                    <Badge tone="neutral">Coming soon</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={kit.prose} style={{ marginTop: 16 }}>
          Payment will always need a human: <code>juryhour_create_test</code> will return a Whop checkout link, not charge a
          card. Want to be told when it ships? <Link href="/contact">Contact us</Link>.
        </p>
      </Section>

      <Section id="http" title="Which endpoints can I call today?">
        <p className={kit.answer}>
          Four public JSON endpoints, the same ones this website calls. There are no API keys; they&apos;re built for a
          person in a browser, so please don&apos;t use them for bulk or automated scraping.
        </p>
        <div className={kit.tableScroll}>
          <table className={kit.table}>
            <thead>
              <tr>
                <th scope="col">Endpoint</th>
                <th scope="col">Body / result</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  <code>POST /api/preview</code>
                </th>
                <td>
                  <code>{`{url | pitch_text, buyer_desc, email, turnstile_token, src?}`}</code> →{" "}
                  <code>{`{ok, preview_id, result}`}</code> or <code>{`{ok, preview_id, refused, reason}`}</code>
                </td>
                <td>
                  Needs a Cloudflare Turnstile token, so it only works from a browser that solved the check. Limited to{" "}
                  {PREVIEW_LIMIT_PER_EMAIL_PER_DAY} previews per email and {PREVIEW_LIMIT_PER_IP_PER_DAY} per IP per day
                  (429 <code>rate_limited</code>).
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <code>POST /api/checkout</code>
                </th>
                <td>
                  <code>{`{tier, email, buyer_desc, url | pitch_text, extra_jurors?, coupon?, preview_id?, parent_order_id?, code?, src?}`}</code> →{" "}
                  <code>{`{ok, purchase_url, token}`}</code>
                </td>
                <td>
                  <code>tier</code> is one of {BUYABLE_TIERS.map((t, i) => (
                    <span key={t}>
                      {i > 0 ? ", " : ""}
                      <code>{t}</code> ({TIER_LABELS[t]})
                    </span>
                  ))}
                  . <code>extra_jurors</code> is 0–{MAX_EXTRA_JURORS} at ${EXTRA_JUROR_USD} each (400 <code>extra_jurors_out_of_range</code>); legacy{" "}
                  <code>addons</code> are refused (400 <code>addons_not_offered</code>); other tiers get 400{" "}
                  <code>tier_not_offered</code>. <code>coupon</code> applies a discount code to the Verdict (400{" "}
                  <code>coupon_unknown</code>, <code>coupon_expired</code>, <code>coupon_not_applicable</code>,{" "}
                  <code>coupon_already_used</code>). One discount per order: a code and the Quick Read upgrade credit
                  never combine; the larger saving is applied and the response says which (<code>discount_applied</code>,{" "}
                  <code>discount_note</code>). A
                  combination that can&apos;t keep our 30% margin gets 400 <code>margin_too_low</code>. <code>retest</code> needs <code>parent_order_id</code> of a delivered{" "}
                  <code>proof</code> order with the same email, within {RETEST_WINDOW_DAYS} days, once (400{" "}
                  <code>retest_needs_parent</code>, <code>retest_parent_not_eligible</code>,{" "}
                  <code>retest_window_expired</code>, <code>retest_already_used</code>). A human pays at{" "}
                  <code>purchase_url</code> (Whop).
                  503 <code>sales_paused</code> when we&apos;re at capacity; 403 <code>content_refused</code> if the preview
                  was refused.
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <code>GET /api/order/[token]</code>
                </th>
                <td>
                  → <code>{`{ok, order: {stage, approved_n, requested_n, has_report, deadline_at, …}}`}</code>
                </td>
                <td>Order status. The token is private; treat it like a password. Poll no more than every few seconds.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className={kit.prose} style={{ marginTop: 16 }}>
          Errors look like <code>{`{ok:false, code, error}`}</code> with a 4xx/5xx status. URL and pitch are exclusive:
          send exactly one. A pitch needs at least 40 characters.
        </p>
      </Section>

      <Section id="examples" title="What do the calls look like?">
        <p className={kit.answer}>
          Run a preview from a browser session, then create the order and give the human the checkout link.
        </p>
        <pre className={kit.code}>{previewExample(base)}</pre>
        <pre className={kit.code} style={{ marginTop: 16 }}>
          {checkoutExample(base)}
        </pre>
        <p className={kit.prose} style={{ marginTop: 16 }}>
          The delivered report is at <code>/r/[token]</code>. A machine-readable verdict endpoint is part of the MCP work
          above (coming soon).
        </p>
      </Section>

      <FaqBlock title="Questions from developers" items={faqByIds(["mcp", "api-auth", "who-runs"])} />
    </main>
  );
}
