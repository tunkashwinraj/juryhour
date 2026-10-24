// Verdict report (SPEC §9). Rendered only from orders.report + approved_responses + order_stats.
// Jurors are anonymous ("Juror N"): nothing here can identify a person.
import type { Card } from "@/lib/types";
import { REPORT_CAVEAT, RETEST_WINDOW_DAYS, TIERS, UPGRADE_CREDIT_HOURS } from "@/lib/constants";
import { supportEmail } from "@/lib/seo";
import { couponPrice, type PublicCoupon } from "@/lib/coupons";
import { orderRef } from "@/lib/order-ref";
import type { JurorRow, ReportData } from "@/lib/queries";
import { SandboxBadge } from "@/components/SiteHeader";
import { cardToText, retestOffer, shareOnXUrl, tallyMarks, upgradeCredit, usd } from "@/components/rules";
import { CopyButton } from "./CopyButton";
import { ShareControls } from "./ShareControls";

const pctOf = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);
const avg = (v: number | null) => (v === null ? "–" : v.toFixed(1));

export function ReportView({
  data,
  appUrl,
  nowMs,
  prices,
  coupon = null,
  sample = false,
}: {
  data: ReportData & { report: NonNullable<ReportData["report"]> };
  appUrl: string;
  nowMs: number;
  /** Current Verdict (proof) and Retest prices, for the upgrade and retest CTAs. */
  prices: { proof: number; retest: number };
  /** The running Verdict coupon (for the Quick Read upgrade CTA), if any. */
  coupon?: PublicCoupon | null;
  /** /sample-report: an illustrative report. Hides share, upgrade and next-step CTAs; the page owns the H1. */
  sample?: boolean;
}) {
  const r = data.report;
  const n = r.scorecard.n_approved;
  const isSpark = data.tier === "spark";
  const hasB = data.cardB !== null && r.scorecard.prefer_b !== null;
  const xUrl = shareOnXUrl({ verdict: r.headline_verdict, n, appUrl });

  const sections = isSpark
    ? [
        <Verdict key="v" data={data} hasB={false} sample={sample} />,
        <RawAnswers key="raw" jurors={data.jurors.slice(0, 3)} />,
        <Understanding key="u" rate={r.scorecard.understanding_rate_a} n={n} />,
        <Fixes key="f" fixes={r.top_fixes} title="Critique" />,
        r.rewritten_headline ? <RewrittenHeadline key="rh" text={r.rewritten_headline} /> : null,
        sample ? null : <SparkUpgrade key="up" data={data} nowMs={nowMs} proofPrice={prices.proof} coupon={coupon} />,
        <Method key="m" caveats={r.method_caveats} n={n} hasB={false} />,
        sample ? null : <Share key="s" data={data} xUrl={xUrl} />,
      ]
    : [
        <Verdict key="v" data={data} hasB={hasB} sample={sample} />,
        <Scorecard key="sc" data={data} hasB={hasB} />,
        <Fixes key="f" fixes={r.top_fixes} title="Top fixes" />,
        r.winning_copy ? <WinningCopy key="wc" card={r.winning_copy} tested={hasB} winner={r.winner} /> : null,
        <StillUnsolved key="su" items={r.still_unsolved} />,
        <AllJurors key="all" jurors={data.jurors} hasB={hasB} />,
        <Method key="m" caveats={r.method_caveats} n={n} hasB={hasB} />,
        sample ? null : <NextSteps key="cta" data={data} nowMs={nowMs} retestPrice={prices.retest} />,
        sample ? null : <Share key="s" data={data} xUrl={xUrl} />,
      ];

  return <article className="report">{sections}</article>;
}

function Verdict({
  data,
  hasB,
  sample,
}: {
  data: ReportData & { report: NonNullable<ReportData["report"]> };
  hasB: boolean;
  sample: boolean;
}) {
  const r = data.report;
  const n = r.scorecard.n_approved;
  const marks = hasB ? tallyMarks(r.scorecard.prefer_a, r.scorecard.prefer_b, n) : [];
  const Heading = sample ? "h2" : "h1";
  return (
    <section aria-labelledby="verdict-h">
      <div className="status-head">
        <span className="badge">{sample ? "Example verdict" : "Your verdict"}</span>
        {sample ? null : <SandboxBadge mode={data.mode} />}
        {sample ? null : <span className="small muted">Order {orderRef(data.orderId)}</span>}
      </div>
      {!sample && data.mode === "sandbox" ? (
        <p className="small muted">This report comes from a test order in the sandbox.</p>
      ) : null}
      <Heading id="verdict-h" className="verdict-line">
        {r.headline_verdict}
      </Heading>
      {marks.length > 0 ? (
        <>
          <ul className="tally" aria-label={`${r.scorecard.prefer_b} preferred the challenger, ${r.scorecard.prefer_a} preferred your current page`}>
            {marks.map((m, i) => (
              <li key={i} className={`mark-${m}`} />
            ))}
          </ul>
          <p className="legend">
            <span className="key-B">Preferred our challenger (B): {r.scorecard.prefer_b}</span>
            <span className="key-A">Preferred your current page (A): {r.scorecard.prefer_a}</span>
          </p>
        </>
      ) : null}
      <p className="muted" style={{ marginTop: 16 }}>
        Directional signal from {n} real {n === 1 ? "person" : "people"}.
        {data.stage === "PARTIAL" && data.refundUsd > 0
          ? ` Fewer jurors finished than planned, so ${usd(data.refundUsd)} was refunded.`
          : ""}
      </p>
    </section>
  );
}

function Scorecard({ data, hasB }: { data: ReportData & { report: NonNullable<ReportData["report"]> }; hasB: boolean }) {
  const s = data.report.scorecard;
  const rows: { label: string; a: string; b: string; aNum: number | null; bNum: number | null }[] = [
    { label: "Understood what it does", a: pctOf(s.understanding_rate_a), b: pctOf(s.understanding_rate_b), aNum: s.understanding_rate_a, bNum: s.understanding_rate_b },
    { label: "Clarity (1–7)", a: avg(s.clarity_a), b: avg(s.clarity_b), aNum: s.clarity_a, bNum: s.clarity_b },
    { label: "Would try it (1–7)", a: avg(s.intent_a), b: avg(s.intent_b), aNum: s.intent_a, bNum: s.intent_b },
  ];
  if (hasB) {
    rows.push({ label: "Preferred it", a: String(s.prefer_a ?? 0), b: String(s.prefer_b ?? 0), aNum: s.prefer_a, bNum: s.prefer_b });
  }
  const better = (x: number | null, y: number | null) => x !== null && y !== null && x > y;
  return (
    <section aria-labelledby="score-h">
      <h2 id="score-h">Scorecard</h2>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col" className="n">
                Your page (A)
              </th>
              {hasB ? (
                <th scope="col" className="n">
                  Challenger (B)
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className={`n${hasB && better(row.aNum, row.bNum) ? " win" : ""}`}>{row.a}</td>
                {hasB ? <td className={`n${better(row.bNum, row.aNum) ? " win" : ""}`}>{row.b}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        Computed directly from {s.n_approved} approved juror responses.
      </p>
    </section>
  );
}

function Fixes({
  fixes,
  title,
}: {
  fixes: NonNullable<ReportData["report"]>["top_fixes"];
  title: string;
}) {
  return (
    <section aria-labelledby="fix-h">
      <h2 id="fix-h">{title}</h2>
      {fixes.map((f, i) => (
        <div className="fix" key={i}>
          <h3>{f.title}</h3>
          <p>{f.detail}</p>
          {f.evidence_quotes.map((q) => (
            <blockquote className="jq" key={`${q.response_id}-${q.text.slice(0, 20)}`}>
              “{q.text}”<cite>{q.juror_label}</cite>
            </blockquote>
          ))}
        </div>
      ))}
    </section>
  );
}

function CardBlock({ card }: { card: Card }) {
  return (
    <div className="copy-card">
      <div className="h">{card.headline}</div>
      <p>{card.subheadline}</p>
      <ul>
        {card.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <span className="cta">{card.cta}</span>
    </div>
  );
}

function WinningCopy({ card, tested, winner }: { card: Card; tested: boolean; winner: "A" | "B" | "none" | null }) {
  const title = !tested ? "Suggested rewrite" : winner === "A" ? "Your page won: keep it" : "Winning copy";
  return (
    <section aria-labelledby="copy-h">
      <h2 id="copy-h">{title}</h2>
      {!tested ? <p className="muted">Not tested on people. Jurors reacted to your current page only.</p> : null}
      {tested && winner === "none" ? <p className="muted">No clear winner. This is our strongest version.</p> : null}
      <CardBlock card={card} />
      <div className="copy-actions">
        <CopyButton text={cardToText(card)} label="Copy" />
      </div>
    </section>
  );
}

function RewrittenHeadline({ text }: { text: string }) {
  return (
    <section aria-labelledby="rh-h">
      <h2 id="rh-h">A rewritten headline</h2>
      <p className="muted">Not tested on people. A Verdict tests a full rewrite against your page.</p>
      <div className="copy-card">
        <div className="h">{text}</div>
      </div>
      <div className="copy-actions">
        <CopyButton text={text} />
      </div>
    </section>
  );
}

function StillUnsolved({ items }: { items: string[] }) {
  return (
    <section aria-labelledby="su-h">
      <h2 id="su-h">Still not solved</h2>
      {items.length === 0 ? (
        <p className="empty">Nothing the jurors flagged is left open.</p>
      ) : (
        <ul>
          {items.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function JurorAnswers({ j, hasB }: { j: JurorRow; hasB: boolean }) {
  const a = j.answers;
  const card = (k: "A" | "B") => a.cards[k];
  return (
    <div className="juror">
      <h3>
        Juror {j.juror_number}
        {hasB ? (
          <span className="small muted">saw {j.first_card === "A" ? "your page" : "the challenger"} first</span>
        ) : null}
      </h3>
      <dl>
        {(["A", "B"] as const).map((k) => {
          const c = card(k);
          if (!c || (k === "B" && !hasB)) return null;
          const which = k === "A" ? "your page" : "the challenger";
          return (
            <div key={k}>
              <dt>What {hasB ? which : "it"} does, in their words</dt>
              <dd>{c.what_it_does}</dd>
              {c.confusing ? (
                <>
                  <dt>What confused them</dt>
                  <dd>{c.confusing}</dd>
                </>
              ) : null}
              <dt>Clarity / would try</dt>
              <dd className="num">
                {c.clarity} / {c.would_try} (out of 7)
              </dd>
            </div>
          );
        })}
        {hasB && a.preferred ? (
          <>
            <dt>Preferred</dt>
            <dd>
              {a.preferred === "A" ? "Your page (A)" : "Challenger (B)"}
              {a.why ? `: ${a.why}` : ""}
            </dd>
          </>
        ) : null}
        {a.specialist ? (
          <>
            <dt>Would buy</dt>
            <dd>
              {a.specialist.would_buy}
              {a.specialist.would_buy_why ? `: ${a.specialist.would_buy_why}` : ""}
            </dd>
            {a.specialist.objections ? (
              <>
                <dt>Objections</dt>
                <dd>{a.specialist.objections}</dd>
              </>
            ) : null}
            <dt>Price reaction</dt>
            <dd>
              {a.specialist.price_reaction}
              {a.specialist.expected_price ? ` (expected ${a.specialist.expected_price})` : ""}
            </dd>
            {a.specialist.your_words ? (
              <>
                <dt>The problem, in their words</dt>
                <dd>{a.specialist.your_words}</dd>
              </>
            ) : null}
          </>
        ) : null}
      </dl>
    </div>
  );
}

function AllJurors({ jurors, hasB }: { jurors: JurorRow[]; hasB: boolean }) {
  return (
    <section aria-labelledby="all-h">
      <h2 id="all-h">All juror responses</h2>
      {jurors.length === 0 ? (
        <p className="empty">No approved responses on record.</p>
      ) : (
        <details className="jurors">
          <summary>Show all {jurors.length} anonymous responses</summary>
          {jurors.map((j) => (
            <JurorAnswers key={j.juror_number} j={j} hasB={hasB} />
          ))}
        </details>
      )}
    </section>
  );
}

function RawAnswers({ jurors }: { jurors: JurorRow[] }) {
  return (
    <section aria-labelledby="raw-h">
      <h2 id="raw-h">What {jurors.length} real people said</h2>
      {jurors.length === 0 ? <p className="empty">No approved responses on record.</p> : null}
      {jurors.map((j) => (
        <JurorAnswers key={j.juror_number} j={j} hasB={false} />
      ))}
    </section>
  );
}

function Understanding({ rate, n }: { rate: number | null; n: number }) {
  return (
    <section aria-labelledby="und-h">
      <h2 id="und-h">Did they get it?</h2>
      <p>
        <strong className="num">{pctOf(rate)}</strong> of {n} jurors described what your product does correctly.
      </p>
    </section>
  );
}

function SparkUpgrade({
  data,
  nowMs,
  proofPrice,
  coupon,
}: {
  data: ReportData;
  nowMs: number;
  proofPrice: number;
  coupon: PublicCoupon | null;
}) {
  const couponDue = coupon ? couponPrice(proofPrice, coupon.percentOff) : null;
  const c = upgradeCredit({
    paidAtIso: data.paidAt,
    sparkPaid: data.pricePaid,
    proofPrice,
    nowMs,
    windowHours: UPGRADE_CREDIT_HOURS,
  });
  return (
    <section aria-labelledby="up-h">
      <h2 id="up-h">Test a full rewrite on {TIERS.proof.jurors} people</h2>
      <p>
        A Verdict writes a challenger version of your page and has {TIERS.proof.jurors} real people judge it against
        yours, blind and in random order.
      </p>
      {c.eligible ? (
        <p>
          Your {usd(c.credit)} counts toward a Verdict for the next {c.hoursLeft}{" "}
          {c.hoursLeft === 1 ? "hour" : "hours"}: <span className="num">{usd(proofPrice)} − {usd(c.credit)} = </span>
          <strong className="num">{usd(c.due)}</strong>.
        </p>
      ) : (
        <p className="num">A Verdict is {usd(proofPrice)}.</p>
      )}
      {coupon && couponDue !== null ? (
        <p>
          First Verdict? Code {coupon.code} makes it <strong className="num">{usd(couponDue)}</strong>
          {c.eligible ? (
            <>
              {" "}
              and your {usd(c.credit)} still counts:{" "}
              <strong className="num">{usd(Math.max(0, couponDue - c.credit))}</strong>
            </>
          ) : null}
          . Enter it in &ldquo;Have a code?&rdquo; at checkout.
        </p>
      ) : null}
      <a className="btn btn-primary" href={`/?tier=proof&parent=${data.orderId}#preview`}>
        {c.eligible ? `Upgrade to a Verdict — your ${usd(c.credit)} counts for ${UPGRADE_CREDIT_HOURS}h` : "Get a Verdict"}
      </a>
    </section>
  );
}

function Method({ caveats, n, hasB }: { caveats: string; n: number; hasB: boolean }) {
  return (
    <section aria-labelledby="method-h">
      <h2 id="method-h">Method and caveats</h2>
      <p>
        {n} real, identity-verified people matching your buyer were recruited and paid through Terac.
        {hasB
          ? " Each saw your page and our challenger, in random order, then said which they preferred."
          : " Each reacted to your page."}{" "}
        Every answer was checked for effort and attention before it counted. Numbers are computed from approved
        responses only; every quote is a juror&apos;s own words.
      </p>
      <p>{caveats}</p>
      {caveats.includes(REPORT_CAVEAT) ? null : <p className="muted">This is research with {REPORT_CAVEAT}.</p>}
    </section>
  );
}

function NextSteps({ data, nowMs, retestPrice }: { data: ReportData; nowMs: number; retestPrice: number }) {
  const offer = retestOffer({
    tier: data.tier,
    stage: data.stage,
    deliveredAtIso: data.deliveredAt,
    retestUsed: data.retestUsed,
    nowMs,
    windowDays: RETEST_WINDOW_DAYS,
  });
  // Retired launch_pack orders included one retest: it is arranged by support, not sold again.
  const includedRetest = data.tier === "launch_pack";
  return (
    <section aria-labelledby="next-h">
      <h2 id="next-h">Next</h2>
      {offer.eligible ? (
        <p>
          Changed your page? A Retest puts your updated page in front of {TIERS.retest.jurors} new real people, against a
          fresh rewrite. Available for {offer.daysLeft} more {offer.daysLeft === 1 ? "day" : "days"}, once per Verdict.
        </p>
      ) : null}
      {includedRetest ? (
        <p>Your order includes one retest. Email us when your page is updated and we&apos;ll set it up.</p>
      ) : null}
      <div className="cta-row">
        {offer.eligible ? (
          <a className="btn btn-primary" href={`/?tier=retest&parent=${data.orderId}#preview`}>
            Retest your updated page — {usd(retestPrice)}
          </a>
        ) : null}
        {includedRetest ? (
          <a className="btn btn-primary" href={`mailto:${supportEmail()}?subject=${encodeURIComponent("Included retest")}`}>
            Ask for your included retest
          </a>
        ) : null}
      </div>
    </section>
  );
}

function Share({ data, xUrl }: { data: ReportData; xUrl: string }) {
  return (
    <section aria-labelledby="share-h">
      <h2 id="share-h">Share my verdict</h2>
      <ShareControls token={data.token} initialPublic={data.reportPublic} xUrl={xUrl} />
    </section>
  );
}
