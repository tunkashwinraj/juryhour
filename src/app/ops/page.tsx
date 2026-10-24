// /ops — company dashboard (HTTP basic auth via src/proxy.ts).
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { AutoRefresh, KillSwitch } from "@/components/ops/OpsControls";
import { getOpsData, type OpsData } from "@/lib/queries";
import { Actor } from "@/lib/types";
import { LOW_TERAC_BALANCE_USD } from "@/lib/constants";
import { orderRefOrNull } from "@/lib/order-ref";
import {
  ageText,
  funnelBySrc,
  maskEmail,
  nowMs,
  pct,
  summarizeLedger,
  usd,
  type LedgerSummary,
} from "@/components/rules";

export const metadata: Metadata = {
  title: "Ops",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function OpsPage({ searchParams }: Props) {
  return (
    <>
    <main>
      <SiteHeader>
        <span className="small muted">Company dashboard</span>
      </SiteHeader>
      <div className="wrap ops">
        <Suspense fallback={<p className="skeleton">Loading the company…</p>}>
          <Dashboard searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
      <SiteFooter />
    </>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

async function Dashboard({ searchParams }: Props) {
  await connection();
  const sp = await searchParams;
  const actorParam = one(sp.actor);
  const actor = Actor.safeParse(actorParam).success ? actorParam : null;
  const orderId = one(sp.order);

  let d: OpsData;
  try {
    d = await getOpsData({ actor, orderId });
  } catch (e) {
    return (
      <div className="notice notice-bad" role="alert">
        <p>
          <strong>Dashboard data failed to load.</strong> {(e as Error).message}
        </p>
      </div>
    );
  }
  const now = nowMs();
  const live = summarizeLedger(d.ledger, "live");
  const sandbox = summarizeLedger(d.ledger, "sandbox");
  const funnel = funnelBySrc(d.previewsBySrc, d.ordersForFunnel);
  const cs = d.companyState;
  const lowBalance = cs.terac_balance_usd !== null && cs.terac_balance_usd < LOW_TERAC_BALANCE_USD;

  return (
    <>
      <div className="ops-toolbar">
        <AutoRefresh seconds={10} />
        <KillSwitch salesPaused={cs.sales_paused} />
      </div>

      <p className="bigcounter" aria-label="Company counters">
        Users (previews): {d.previewCount}
        <span className="sep">·</span>
        Paying: {d.payingCustomers}
        <span className="sep">·</span>
        Human interventions: {d.humanInterventions}
      </p>

      <div className="ops-grid">
        <div className="ops-block">
          <h2>Status</h2>
          <dl className="kpis">
            <div>
              <dt>Sales</dt>
              <dd style={{ color: cs.sales_paused ? "var(--bad-ink)" : undefined }}>
                {cs.sales_paused ? "Paused" : "Open"}
              </dd>
            </div>
            <div>
              <dt>Terac balance</dt>
              <dd style={{ color: lowBalance ? "var(--bad-ink)" : undefined }}>
                {cs.terac_balance_usd === null ? "unknown" : usd(cs.terac_balance_usd, { cents: true })}
              </dd>
            </div>
            <div>
              <dt>Balance checked</dt>
              <dd className="small">{cs.terac_balance_checked_at ? `${ageText(cs.terac_balance_checked_at, now)} ago` : "never"}</dd>
            </div>
          </dl>
          {cs.sales_paused && cs.pause_reason ? <p className="small" style={{ marginTop: 12 }}>Reason: {cs.pause_reason}</p> : null}
          {lowBalance ? (
            <div className="notice notice-bad small" style={{ marginTop: 12, marginBottom: 0 }}>
              <p>Terac balance is below {usd(LOW_TERAC_BALANCE_USD)}. New panels can&apos;t launch; sales pause automatically.</p>
            </div>
          ) : null}
        </div>

        <div className="ops-block">
          <h2>Whop limits to keep in mind</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>New Whop accounts have a $2,500 checkout cap.</li>
            <li>Disputes under $500 may be auto-refunded by Whop before our Disputes agent can respond.</li>
          </ul>
        </div>
      </div>

      <MoneyBlock title="Live money" s={live} />
      <MoneyBlock title="Sandbox (test money, not revenue)" s={sandbox} sandbox />

      <div className="ops-block">
        <h2>Funnel by source</h2>
        {funnel.length === 0 ? (
          <p className="empty">No previews or orders yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>src</th>
                  <th className="n">Previews</th>
                  <th className="n">Checkouts</th>
                  <th className="n">Paid (live)</th>
                  <th className="n">Paid (sandbox)</th>
                  <th className="n">Preview → paid</th>
                </tr>
              </thead>
              <tbody>
                {funnel.map((f) => (
                  <tr key={f.src}>
                    <td>{f.src}</td>
                    <td className="n">{f.previews}</td>
                    <td className="n">{f.checkouts}</td>
                    <td className="n">{f.paidLive}</td>
                    <td className="n">{f.paidSandbox}</td>
                    <td className="n">{pct(f.paidLive, f.previews)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Visitor counts live in Vercel Web Analytics.
        </p>
      </div>

      <div className="ops-block">
        <h2>Orders (latest 50)</h2>
        {d.orders.length === 0 ? (
          <p className="empty">No orders yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Created</th>
                  <th>Tier</th>
                  <th>Stage</th>
                  <th className="n">In stage</th>
                  <th>Mode</th>
                  <th className="n">Price</th>
                  <th>Customer</th>
                  <th>src</th>
                  <th>Log</th>
                </tr>
              </thead>
              <tbody>
                {d.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="small">
                      <code>{orderRefOrNull(o.id) ?? "–"}</code>
                    </td>
                    <td className="small">{ageText(o.created_at, now)} ago</td>
                    <td>{o.tier}</td>
                    <td>
                      <a href={`/o/${o.token}`}>{o.stage}</a>
                    </td>
                    <td className="n">{ageText(o.stage_entered_at, now)}</td>
                    <td>
                      <span className={o.mode === "sandbox" ? "badge badge-sandbox" : "badge badge-live"}>{o.mode}</span>
                    </td>
                    <td className="n">{usd(o.price_usd)}</td>
                    <td className="small">{maskEmail(o.email)}</td>
                    <td className="small">{o.src ?? "direct"}</td>
                    <td>
                      <Link href={`/ops?order=${o.id}#log`}>events</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ops-block" id="log">
        <h2>Decision log</h2>
        <nav className="filters" aria-label="Filter by actor">
          <Link href="/ops#log" aria-current={!actor && !orderId ? "true" : undefined}>
            all
          </Link>
          {Actor.options.map((a) => (
            <Link key={a} href={`/ops?actor=${a}#log`} aria-current={actor === a ? "true" : undefined}>
              {a}
            </Link>
          ))}
        </nav>
        {orderId ? (
          <p className="small">
            Showing events for order <code>{orderId.slice(0, 8)}</code>. <Link href="/ops#log">Clear</Link>
          </p>
        ) : null}
        {d.events.length === 0 ? (
          <p className="empty">No decisions logged yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Reasoning</th>
                  <th>Order</th>
                </tr>
              </thead>
              <tbody>
                {d.events.map((e) => (
                  <tr key={e.id}>
                    <td className="small" title={e.created_at}>
                      {ageText(e.created_at, now)} ago
                    </td>
                    <td>{e.actor}</td>
                    <td>{e.action}</td>
                    <td className="small">{e.reasoning ?? ""}</td>
                    <td className="small">
                      {e.order_id ? <Link href={`/ops?order=${e.order_id}#log`}>{e.order_id.slice(0, 8)}</Link> : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ops-grid">
        <div className="ops-block">
          <h2>Agent runs</h2>
          {d.agentRuns.length === 0 ? (
            <p className="empty">No agent runs yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Agent</th>
                    <th>Status</th>
                    <th className="n">Try</th>
                    <th>Session</th>
                  </tr>
                </thead>
                <tbody>
                  {d.agentRuns.map((r) => (
                    <tr key={r.id}>
                      <td className="small">{ageText(r.started_at, now)} ago</td>
                      <td>{r.agent}</td>
                      <td>{r.status}</td>
                      <td className="n">{r.attempt}</td>
                      <td>
                        {r.session_url ? (
                          <a href={r.session_url} target="_blank" rel="noopener noreferrer">
                            open
                          </a>
                        ) : (
                          "–"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="ops-block">
          <h2>Incidents</h2>
          {d.incidents.length === 0 ? (
            <p className="empty">No incidents.</p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Kind</th>
                    <th>Detail</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {d.incidents.map((i) => (
                    <tr key={i.id}>
                      <td className="small">{ageText(i.created_at, now)} ago</td>
                      <td>{i.kind}</td>
                      <td className="small">{i.detail ?? ""}</td>
                      <td>{i.resolved ? "resolved" : <strong>open</strong>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MoneyBlock({ title, s, sandbox }: { title: string; s: LedgerSummary; sandbox?: boolean }) {
  const c = (n: number) => usd(n, { cents: true });
  return (
    <div className={sandbox ? "ops-block ops-sandbox" : "ops-block"}>
      <h2>{title}</h2>
      <dl className="kpis">
        <div>
          <dt>Revenue</dt>
          <dd>{c(s.revenue)}</dd>
        </div>
        <div>
          <dt>Refunds</dt>
          <dd>{c(s.refunds)}</dd>
        </div>
        <div>
          <dt>Terac cost</dt>
          <dd>{c(s.teracCost)}</dd>
        </div>
        <div>
          <dt>AI cost</dt>
          <dd>{c(s.aiCost)}</dd>
        </div>
        <div>
          <dt>Exa cost</dt>
          <dd>{c(s.exaCost)}</dd>
        </div>
        <div>
          <dt>Whop fees</dt>
          <dd>{c(s.whopFees)}</dd>
        </div>
        {s.otherCost > 0 ? (
          <div>
            <dt>Ads + affiliates</dt>
            <dd>{c(s.otherCost)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Gross profit</dt>
          <dd>{c(s.net)}</dd>
        </div>
        <div>
          <dt>Gross margin</dt>
          <dd>{s.grossMargin === null ? "–" : `${Math.round(s.grossMargin * 100)}%`}</dd>
        </div>
      </dl>
    </div>
  );
}
