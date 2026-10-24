// Whop REST client (SPEC §11.1, CONTRACTS §0.4 + §3 B). Server-only.
//
// Verified against docs.whop.com (2026-10-24) and the sandbox API — see docs/discrepancies/whop.md.
// Every request pins `Api-Version-Date` (env WHOP_API_VERSION_DATE, default 2026-07-01). At that pin
// the API serves the *legacy* ("stable") shapes: `company_id` (not `account_id`), bare-number money,
// payments with embedded `refunds`, disputes via `update_evidence` / `submit_evidence`.
//
// Two businesses: live (api.whop.com) and sandbox (sandbox-api.whop.com), chosen by the order's mode.
import { Webhook, WebhookVerificationError } from "standardwebhooks";
import { ADS_DAILY_CAP_PER_CAMPAIGN } from "./constants";
import { env, need } from "./env";
import type { Mode } from "./types";

export type WhopMode = Mode;

const BASE_URL: Record<Mode, string> = {
  live: "https://api.whop.com/api/v1",
  sandbox: "https://sandbox-api.whop.com/api/v1",
};
const TIMEOUT_MS = 20_000;
/** Product every inline checkout plan hangs off (find-or-create by external identifier). */
export const WHOP_PRODUCT_EXTERNAL_ID = "juryhour-verdict";
export const WHOP_WEBHOOK_EVENTS = [
  "payment.succeeded",
  "payment.failed",
  "refund.created",
  "dispute.created",
  "dispute.updated",
] as const;
/** Standard Webhooks timestamp tolerance (Whop docs: reject > 5 minutes from now). */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export class WhopError extends Error {
  constructor(
    message: string,
    public status: number,
    public type: string | null = null,
    public code: string | null = null,
  ) {
    super(message);
    this.name = "WhopError";
  }
}

export function whopConfig(mode: Mode): { baseUrl: string; apiKey: string; companyId: string; versionDate: string } {
  const live = mode === "live";
  return {
    baseUrl: BASE_URL[mode],
    apiKey: need(live ? "WHOP_API_KEY" : "WHOP_SANDBOX_API_KEY"),
    companyId: need(live ? "WHOP_COMPANY_ID" : "WHOP_SANDBOX_COMPANY_ID"),
    versionDate: env().WHOP_API_VERSION_DATE,
  };
}

type Query = Record<string, string | number | undefined | null>;

/** One HTTP call to Whop. Never retries, never logs the key. */
export async function whopRequest<T>(
  mode: Mode,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: { query?: Query; body?: unknown } = {},
): Promise<T> {
  const cfg = whopConfig(mode);
  const url = new URL(cfg.baseUrl + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Api-Version-Date": cfg.versionDate,
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    const why = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timed out after 20s" : (e as Error)?.message;
    throw new WhopError(`Whop ${mode} ${method} ${path} failed: ${why}`, 0);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as { error?: { type?: string; code?: string; message?: string } } | null)?.error;
    throw new WhopError(
      `Whop ${mode} ${method} ${path} → ${res.status}: ${err?.message ?? text.slice(0, 200)}`,
      res.status,
      err?.type ?? null,
      err?.code ?? null,
    );
  }
  return json as T;
}

// ---------- Response shapes we rely on (legacy shapes at Api-Version-Date 2026-07-01) ----------

export type WhopCheckoutConfiguration = {
  id: string;                         // ch_…
  purchase_url: string | null;
  redirect_url: string | null;
  metadata: Record<string, unknown> | null;
  plan: { id: string; initial_price: number; currency: string; plan_type: string } | null;
};

export type WhopRefundSummary = { id: string; amount: number; currency: string; status: string; created_at: string };

export type WhopPayment = {
  id: string;                         // pay_…
  status: string | null;              // draft | open | paid | pending | uncollectible | unresolved | void
  substatus: string | null;           // succeeded | refunded | partially_refunded | …
  total: number | null;
  subtotal: number | null;
  usd_total: number | null;
  refunded_amount: number | null;
  currency: string | null;
  created_at: string;
  paid_at: string | null;
  metadata: Record<string, unknown> | null;   // copied from the checkout configuration
  checkout_configuration_id: string | null;
  refunds?: WhopRefundSummary[] | null;        // newest first
};

type Page<T> = { data: T[]; page_info: { end_cursor: string | null; has_next_page: boolean } };

// ---------- Checkout ----------

export async function createCheckout(i: {
  orderId: string;
  amountUsd: number;
  title: string;
  mode: Mode;
  redirectUrl: string;
}): Promise<{ checkoutId: string; purchaseUrl: string }> {
  const amount = Math.round(i.amountUsd * 100) / 100;
  if (!Number.isFinite(amount) || amount < 1) throw new Error(`createCheckout: invalid amount ${i.amountUsd}`);
  const { companyId } = whopConfig(i.mode);
  const cc = await whopRequest<WhopCheckoutConfiguration>(i.mode, "POST", "/checkout_configurations", {
    body: {
      plan: {
        company_id: companyId,
        currency: "usd",
        plan_type: "one_time",
        initial_price: amount,
        renewal_price: 0,
        title: i.title.slice(0, 80),
        visibility: "hidden",
        product: { external_identifier: WHOP_PRODUCT_EXTERNAL_ID, title: "JuryHour verdict" },
      },
      metadata: { order_id: i.orderId },
      redirect_url: i.redirectUrl,
    },
  });
  if (!cc?.id || !cc.purchase_url) throw new WhopError("Whop checkout configuration has no id/purchase_url", 502);
  return { checkoutId: cc.id, purchaseUrl: cc.purchase_url };
}

// ---------- Refunds ----------

/** Full refund when amountUsd is omitted; `partial_amount` otherwise. Returns the newest refund on the payment. */
export async function refundPayment(i: {
  paymentId: string;
  amountUsd?: number;
  mode: Mode;
}): Promise<{ refundId: string | null; status: string }> {
  let body: { partial_amount?: number } = {};
  if (i.amountUsd !== undefined) {
    const amt = Math.round(i.amountUsd * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) throw new Error(`refundPayment: invalid amount ${i.amountUsd}`);
    body = { partial_amount: amt };
  }
  const p = await whopRequest<WhopPayment>(i.mode, "POST", `/payments/${encodeURIComponent(i.paymentId)}/refund`, { body });
  const latest = p?.refunds?.[0] ?? null;
  return {
    refundId: latest?.id ?? null,
    status: latest?.status ?? p?.substatus ?? p?.status ?? "unknown",
  };
}

// ---------- Payments sweep ----------

export async function listRecentPayments(i: {
  sinceMinutes: number;
  mode: Mode;
}): Promise<{ paymentId: string; orderId: string | null; amountUsd: number; status: string; substatus: string | null; checkoutId: string | null; createdAt: string }[]> {
  const { companyId } = whopConfig(i.mode);
  const since = new Date(Date.now() - i.sinceMinutes * 60_000).toISOString();
  const out: Awaited<ReturnType<typeof listRecentPayments>> = [];
  let after: string | null = null;
  for (let pageNo = 0; pageNo < 5; pageNo++) {
    const page: Page<WhopPayment> = await whopRequest<Page<WhopPayment>>(i.mode, "GET", "/payments", {
      query: { company_id: companyId, created_after: since, first: 100, after },
    });
    for (const p of page.data ?? []) {
      const orderId = p.metadata && typeof p.metadata.order_id === "string" ? p.metadata.order_id : null;
      out.push({
        paymentId: p.id,
        orderId,
        amountUsd: Number(p.usd_total ?? p.total ?? 0),
        status: p.status ?? "unknown",
        substatus: p.substatus ?? null,
        checkoutId: p.checkout_configuration_id ?? null,
        createdAt: p.created_at,
      });
    }
    if (!page.page_info?.has_next_page || !page.page_info.end_cursor) break;
    after = page.page_info.end_cursor;
  }
  return out;
}

// ---------- Disputes ----------

/** Text evidence fields accepted by `POST /disputes/{id}/update_evidence` (legacy, pinned version). */
export type DisputeEvidence = {
  access_activity_log?: string;
  billing_address?: string;
  cancellation_policy_disclosure?: string;
  customer_email_address?: string;
  customer_name?: string;
  notes?: string;
  product_description?: string;
  refund_policy_disclosure?: string;
  refund_refusal_explanation?: string;
  service_date?: string;
};

const EVIDENCE_KEYS: (keyof DisputeEvidence)[] = [
  "access_activity_log", "billing_address", "cancellation_policy_disclosure", "customer_email_address",
  "customer_name", "notes", "product_description", "refund_policy_disclosure", "refund_refusal_explanation", "service_date",
];

/** Writes the evidence, then submits it to the processor (no edits possible afterwards). */
export async function submitDisputeEvidence(i: { disputeId: string; mode: Mode; evidence: DisputeEvidence }): Promise<void> {
  const body: DisputeEvidence = {};
  for (const k of EVIDENCE_KEYS) {
    const v = i.evidence[k];
    if (typeof v === "string" && v.trim()) body[k] = v.slice(0, 20_000);
  }
  if (Object.keys(body).length === 0) throw new Error("submitDisputeEvidence: no evidence given");
  const id = encodeURIComponent(i.disputeId);
  await whopRequest(i.mode, "POST", `/disputes/${id}/update_evidence`, { body });
  await whopRequest(i.mode, "POST", `/disputes/${id}/submit_evidence`, { body: {} });
}

// ---------- Ads ----------

/** Sets a campaign's daily budget. Throws "ads not available: …" when the account can't run ads. */
export async function setAdCampaignBudget(i: { campaignId: string; dailyUsd: number; mode: Mode }): Promise<void> {
  const amt = Math.round(i.dailyUsd * 100) / 100;
  if (!Number.isFinite(amt) || amt < 0 || amt > ADS_DAILY_CAP_PER_CAMPAIGN) {
    throw new Error(`setAdCampaignBudget: daily budget must be 0..${ADS_DAILY_CAP_PER_CAMPAIGN}`);
  }
  try {
    await whopRequest(i.mode, "PATCH", `/ad_campaigns/${encodeURIComponent(i.campaignId)}`, {
      body: { budget_amount: amt, budget_type: "daily" },
    });
  } catch (e) {
    if (e instanceof WhopError && [401, 402, 403, 404, 410].includes(e.status)) {
      throw new Error(`ads not available: ${e.message}`);
    }
    throw e;
  }
}

// ---------- Webhooks ----------

/**
 * Normalized Whop webhook event. Fields the app relies on (legacy payload shapes, pin 2026-07-01):
 * - payment.* : data.id (pay_…), data.metadata.order_id, data.checkout_configuration_id,
 *               data.usd_total ?? data.total (USD, number), data.status / data.substatus
 * - refund.*  : data.id (rf_…), data.amount (number), data.status, data.payment.id
 * - dispute.* : data.id (dspt_…), data.payment.id, data.status, data.amount
 * `id` is the `webhook-id` header (stable across retries; equals the envelope `id`).
 */
export type WhopEvent = { id: string; type: string; data: any; companyId: string | null; timestamp: string | null }; // eslint-disable-line @typescript-eslint/no-explicit-any

export class WhopWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhopWebhookError";
  }
}

/**
 * Whop signs `${webhook-id}.${webhook-timestamp}.${rawBody}` with HMAC-SHA256 keyed by the
 * *literal UTF-8 bytes* of the `ws_…` secret (Standard Webhooks headers). `standardwebhooks`
 * base64-decodes its key, so we hand it base64(secret) — exactly what @whop/sdk's unwrapWebhook does.
 */
export function whopSigningKey(secret: string): string {
  return Buffer.from(secret, "utf8").toString("base64");
}

export function verifyWhopWebhook(rawBody: string, headers: Headers, mode: Mode): WhopEvent {
  const secret = need(mode === "live" ? "WHOP_WEBHOOK_SECRET" : "WHOP_SANDBOX_WEBHOOK_SECRET");
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sig = headers.get("webhook-signature");
  if (!id || !ts || !sig) throw new WhopWebhookError("missing webhook-id/webhook-timestamp/webhook-signature");
  // Explicit staleness check (the library also enforces 5 min) so the error is unambiguous.
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new WhopWebhookError("stale or invalid webhook-timestamp");
  }
  let parsed: unknown;
  try {
    parsed = new Webhook(whopSigningKey(secret)).verify(rawBody, {
      "webhook-id": id,
      "webhook-timestamp": ts,
      "webhook-signature": sig,
    });
  } catch (e) {
    if (e instanceof WebhookVerificationError) throw new WhopWebhookError(`bad signature: ${e.message}`);
    throw new WhopWebhookError(`invalid webhook: ${(e as Error).message}`);
  }
  const body = (parsed ?? {}) as { id?: string; type?: string; data?: unknown; company_id?: string; account_id?: string; timestamp?: string };
  if (typeof body.type !== "string") throw new WhopWebhookError("webhook body has no type");
  return {
    id,
    type: body.type,
    data: body.data ?? null,
    companyId: body.company_id ?? body.account_id ?? null,
    timestamp: body.timestamp ?? null,
  };
}

/** Test/fixture helper: signs a body the way Whop does. */
export function signWhopWebhook(secret: string, msgId: string, timestamp: Date, rawBody: string): string {
  return new Webhook(whopSigningKey(secret)).sign(msgId, timestamp, rawBody);
}

export type WhopWebhookEndpoint = {
  id: string;
  url: string;
  enabled: boolean;
  events: string[];
  api_version: string | null;
  api_version_date: string | null;
  webhook_secret?: string | null;
};

export async function listWebhooks(mode: Mode): Promise<WhopWebhookEndpoint[]> {
  const { companyId } = whopConfig(mode);
  const page = await whopRequest<Page<WhopWebhookEndpoint>>(mode, "GET", "/webhooks", { query: { company_id: companyId } });
  return page.data ?? [];
}

/**
 * At the 2026-07-01 pin `api_version: "v1"` is required alongside `api_version_date`
 * (sandbox: "api_version_date is only supported for v1 webhooks"). The secret is returned once.
 */
export async function createWebhook(mode: Mode, url: string): Promise<WhopWebhookEndpoint> {
  const { companyId, versionDate } = whopConfig(mode);
  return whopRequest<WhopWebhookEndpoint>(mode, "POST", "/webhooks", {
    body: {
      url,
      api_version: "v1",
      api_version_date: versionDate,
      events: [...WHOP_WEBHOOK_EVENTS],
      resource_id: companyId,
      enabled: true,
    },
  });
}

export async function updateWebhook(mode: Mode, id: string, patch: { events?: string[]; enabled?: boolean }): Promise<WhopWebhookEndpoint> {
  return whopRequest<WhopWebhookEndpoint>(mode, "PATCH", `/webhooks/${encodeURIComponent(id)}`, { body: patch });
}
