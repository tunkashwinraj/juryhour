"use client";
// Order status island: polls GET /api/order/[token] every 4s until the order is terminal.
import { useEffect, useState } from "react";
import { PUBLIC_TIER_LABELS } from "@/lib/constants";
import { etDeadline } from "@/lib/et-time";
import type { OrderStatus } from "@/lib/queries";
import { SandboxBadge } from "@/components/SiteHeader";
import {
  etaText,
  isTerminal,
  jurorsForTier,
  progressSteps,
  refundNotice,
  stageHeadline,
  usd,
} from "@/components/rules";

const POLL_MS = 4000;

const TIER_LABEL: Record<string, string> = PUBLIC_TIER_LABELS;

export function OrderStatusLive({
  initial,
  paidParam,
  orderRef = null,
}: {
  initial: OrderStatus;
  paidParam: boolean;
  /** "JH-F9DA6201": customers quote it to support. */
  orderRef?: string | null;
}) {
  const [order, setOrder] = useState(initial);
  const [now, setNow] = useState<number | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clock starts after hydration
    setNow(Date.now());
    if (isTerminal(order.stage)) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/order/${encodeURIComponent(order.token)}`, { cache: "no-store" });
        const body = await res.json();
        if (!alive) return;
        if (body?.ok) {
          setOrder(body.order as OrderStatus);
          setStale(false);
        } else setStale(true);
      } catch {
        if (alive) setStale(true);
      }
      if (alive) setNow(Date.now());
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [order.token, order.stage]);

  const steps = progressSteps({
    stage: order.stage,
    tier: order.tier,
    approvedN: order.approved_n,
    requestedN: order.requested_n,
  });
  const notice = refundNotice({ stage: order.stage, refundUsd: order.refund_usd });
  const delivered = order.stage === "DELIVERED" || order.stage === "PARTIAL";
  const etaBase = !delivered && !isTerminal(order.stage) && now !== null ? etaText(order.deadline_at, now) : null;
  // Add the clock time in ET while the deadline is still ahead ("Verdict due within 3h 20m (by 7:03pm ET today).").
  const etaBy = etaBase && now !== null && Date.parse(order.deadline_at ?? "") > now ? etDeadline(order.deadline_at, new Date(now)) : null;
  const eta = etaBase && etaBy ? etaBase.replace(/\.$/, ` (${etaBy}).`) : etaBase;
  const n = order.requested_n ?? jurorsForTier(order.tier);
  const bad = order.stage === "REFUNDED" || order.stage === "FAILED" || order.stage === "BLOCKED";

  return (
    <div>
      <div className="status-head">
        <span className="badge">{TIER_LABEL[order.tier] ?? order.tier}</span>
        <SandboxBadge mode={order.mode} />
        {orderRef ? <span className="small muted">Order {orderRef}</span> : null}
      </div>
      <h1>{stageHeadline(order.stage, paidParam)}</h1>
      {order.mode === "sandbox" ? (
        <p className="small muted">This is a test order in the sandbox. No real money moved.</p>
      ) : null}

      {order.stage === "CREATED" && order.tier === "specialist" && order.price_usd === null ? (
        <div className="notice" role="status">
          <p>
            We&apos;re getting a price for your custom jury. You&apos;ll get an email with a checkout link as soon as
            it&apos;s quoted; the quote holds for 48 hours.
          </p>
        </div>
      ) : order.stage === "CREATED" && paidParam ? (
        <div className="notice" role="status">
          <p>Your payment is being confirmed with Whop. This page updates by itself.</p>
        </div>
      ) : null}

      {notice ? (
        <div className={bad ? "notice notice-bad" : "notice notice-warn"} role="status">
          <p>{notice}</p>
        </div>
      ) : null}

      {delivered && order.has_report ? (
        <p>
          <a className="btn btn-primary" href={`/r/${order.token}`}>
            Read your verdict
          </a>
        </p>
      ) : null}

      {!bad ? (
        <ol className="steps" aria-label="Progress">
          {steps.map((s) => (
            <li key={s.key} className={`step step-${s.state}`} aria-current={s.state === "active" ? "step" : undefined}>
              {s.label}
            </li>
          ))}
        </ol>
      ) : null}

      <dl className="status-facts">
        {eta ? (
          <>
            <dt>ETA</dt>
            <dd>{eta}</dd>
          </>
        ) : null}
        <dt>Jurors</dt>
        <dd>
          {Math.min(order.approved_n, n)} of {n} done
        </dd>
        {order.price_usd !== null ? (
          <>
            <dt>Price</dt>
            <dd>{usd(order.price_usd)}</dd>
          </>
        ) : null}
        {order.refund_usd > 0 ? (
          <>
            <dt>Refunded</dt>
            <dd>{usd(order.refund_usd)}</dd>
          </>
        ) : null}
      </dl>

      {!isTerminal(order.stage) ? (
        <p className="small muted">
          {stale ? "Reconnecting… " : ""}This page refreshes every few seconds. You can close it: we email you when the
          verdict is ready. Bookmark it to check back.
        </p>
      ) : null}
    </div>
  );
}
