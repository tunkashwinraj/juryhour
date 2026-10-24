// POST /api/checkout — create a CREATED order + Whop checkout (SPEC §10, CONTRACTS §4).
// in  { tier, extra_jurors?, coupon?, code?, email, buyer_desc, url?, pitch_text?, preview_id?, parent_order_id?, src?, addons? }
//     (url XOR pitch_text; `addons` must be empty — legacy field)
// out { ok:true, purchase_url, token, price_usd, coupon_applied, credit_usd } | { ok:false, code, error }
// Sold here: spark (Quick Read), proof (Verdict), retest (Retest), each with 0–20 extra jurors at $7.
// Refusals (400):
//   tier_not_offered    retired (pulse, launch_pack, specialist) or unknown tier
//   addons_not_offered  any legacy add-on (extra5/rush are no longer sold)
//   extra_jurors_out_of_range  extra_jurors not an integer 0–20
//   coupon_unknown / coupon_expired / coupon_not_applicable / coupon_already_used
//                       explicit `coupon` that can't be applied (HALF: Verdict only, first Verdict per email)
//   margin_too_low      the combination can't keep the 30% margin at worst-case juror cost
//   retest_needs_parent / retest_parent_not_eligible / retest_window_expired / retest_already_used
//   bad_parent          upgrade parent not found for this email + mode
// `code` is attribution (partner/referral). When it equals the live coupon code (?code=HALF) and the
// coupon applies (Verdict, first Verdict for this email), it is applied automatically; otherwise it
// never changes the price or refuses.
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { pickSrc } from "@/lib/analytics";
import { type TierName } from "@/lib/constants";
import { checkCoupon, configuredCoupon, sameCode, type Coupon } from "@/lib/coupons";
import { db, logEvent, openIncident } from "@/lib/db";
import { env } from "@/lib/env";
import {
  BUYABLE_TIERS_TEXT,
  checkoutTitle,
  computePrice,
  PricingError,
  isBuyableTier,
  retestRefusal,
  type ParentOrderForCredit,
  type RetestParent,
} from "@/lib/pricing";
import { orderRef } from "@/lib/order-ref";
import { createCheckout } from "@/lib/whop";
import {
  OrderInputBase,
  exactlyOneTarget,
  exactlyOneTargetMsg,
  fail,
  newOrderToken,
  ok,
  readJson,
  salesPaused,
  validPreviewId,
  zodMessage,
} from "./_shared";

export const maxDuration = 30;

const Body = OrderInputBase.extend({
  // Any string here: retired/unknown tiers get a clear tier_not_offered refusal instead of a schema error.
  tier: z.string().trim().min(1).max(40),
  addons: z.array(z.string().max(40)).max(10).default([]),
  extra_jurors: z.number().optional(),
  // A discount code the buyer chose to apply (strict: unknown/expired/wrong tier → 400).
  coupon: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().max(40).regex(/^[A-Za-z0-9_-]+$/).optional()),
  parent_order_id: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().uuid().optional()),
  // Promo / partner code from ?code= or the "Have a code?" field. Stored for attribution only; no code
  // changes the price.
  code: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().max(40).regex(/^[A-Za-z0-9_-]+$/).optional()),
}).refine(exactlyOneTarget, exactlyOneTargetMsg);

type ParentRow = {
  id: string;
  tier: TierName;
  stage: string;
  price_usd: number | string | null;
  paid_at: string | null;
  delivered_at: string | null;
  email: string;
  mode: string;
};

async function loadParentRow(parentId: string): Promise<ParentRow | null> {
  const res = await db()
    .from("orders")
    .select("id, tier, stage, price_usd, paid_at, delivered_at, email, mode")
    .eq("id", parentId)
    .maybeSingle();
  if (res.error) throw new Error(`orders(parent): ${res.error.message}`);
  return res.data as ParentRow | null;
}

/** Paid orders that already name this parent (optionally only of one tier). */
async function paidChildren(parentId: string, tier?: TierName): Promise<number> {
  let q = db().from("orders").select("id", { count: "exact", head: true }).eq("parent_order_id", parentId);
  if (tier) q = q.eq("tier", tier);
  const used = await q.not("paid_at", "is", null);
  if (used.error) throw new Error(`orders(parent usage): ${used.error.message}`);
  return used.count ?? 0;
}

/**
 * Parent order for an upgrade. Must exist, be in the same mode and belong to the same email.
 * Credit is only offered once per parent: if another paid order already used it, no credit.
 */
async function loadUpgradeParent(parentId: string, email: string, mode: string): Promise<{ parent: ParentOrderForCredit | null; error?: string }> {
  const row = await loadParentRow(parentId);
  if (!row || row.mode !== mode || row.email.toLowerCase() !== email) return { parent: null, error: "parent order not found" };
  if ((await paidChildren(parentId)) > 0) return { parent: null };
  return { parent: { tier: row.tier, price_usd: Number(row.price_usd ?? 0), paid_at: row.paid_at } };
}

/** Paid orders of `tier` for this email + mode (HALF is for a customer's first Verdict). */
async function paidOrdersOf(email: string, mode: string, tier: TierName): Promise<number> {
  const res = await db()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .eq("mode", mode)
    .eq("tier", tier)
    .not("paid_at", "is", null);
  if (res.error) throw new Error(`orders(first verdict): ${res.error.message}`);
  return res.count ?? 0;
}

async function loadPrices(): Promise<Record<string, number>> {
  const res = await db().from("prices").select("tier, current_usd");
  if (res.error) throw new Error(`prices: ${res.error.message}`);
  const out: Record<string, number> = {};
  for (const r of (res.data ?? []) as { tier: string; current_usd: number | string }[]) out[r.tier] = Number(r.current_usd);
  return out;
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  const json = await readJson(req);
  if (!json.ok) return fail(400, "bad_request", "Body must be JSON", requestId);
  const parsed = Body.safeParse(json.value);
  if (!parsed.success) return fail(400, "bad_request", zodMessage(parsed.error), requestId);
  const b = parsed.data;

  if (!isBuyableTier(b.tier)) {
    return fail(400, "tier_not_offered", `"${b.tier}" is not sold. We sell ${BUYABLE_TIERS_TEXT}.`, requestId);
  }
  const tier = b.tier;
  if (b.addons.length > 0) {
    return fail(400, "addons_not_offered", "Add-ons are no longer sold. Remove them and try again.", requestId);
  }
  const now = new Date();
  if (b.coupon) {
    // Cheap checks first (no DB): unknown / expired / wrong tier.
    const c = checkCoupon({ code: b.coupon, tier, now });
    if (!c.ok) return fail(400, c.code, c.message, requestId);
  }
  if (tier === "retest" && !b.parent_order_id) {
    const r = retestRefusal({ parentOrderId: null, parent: null, email: b.email, mode: "", paidRetests: 0 });
    return fail(400, r!.code, r!.message, requestId);
  }

  try {
    const pause = await salesPaused();
    if (pause.paused) {
      return fail(503, "sales_paused", "We're at capacity — verdicts reopen shortly.", requestId);
    }

    const previewId = await validPreviewId(b.preview_id);
    if (previewId === "refused") return fail(403, "content_refused", "We can't test this product.", requestId);

    const mode = env().APP_MODE;

    // Coupon: explicit `coupon` is strict; an attribution `code` equal to the coupon applies silently
    // when it can (first-Verdict check needs the DB, so it runs here).
    let coupon: Coupon | null = null;
    const couponCode = b.coupon ?? (b.code && sameCode(b.code, configuredCoupon().code) ? b.code : null);
    if (couponCode) {
      const pre = checkCoupon({ code: couponCode, tier, now });
      if (pre.ok) {
        const prior = pre.coupon.firstOrderOnly ? await paidOrdersOf(b.email, mode, pre.coupon.tier) : 0;
        const c = checkCoupon({ code: couponCode, tier, now, priorPaidOrders: prior });
        if (c.ok) coupon = c.coupon;
        else if (b.coupon) return fail(400, c.code, c.message, requestId);
      }
    }

    let parent: ParentOrderForCredit | null = null;
    if (tier === "retest") {
      const parentId = b.parent_order_id as string;
      const row = await loadParentRow(parentId);
      const retestParent: RetestParent | null = row
        ? { tier: row.tier, stage: row.stage, mode: row.mode, email: row.email, delivered_at: row.delivered_at }
        : null;
      const base = { parentOrderId: parentId, parent: retestParent, email: b.email, mode };
      // Only count earlier retests once the parent itself qualifies (saves a query on bad links).
      const paidRetests = retestRefusal({ ...base, paidRetests: 0 }) ? 0 : await paidChildren(parentId, "retest");
      const r = retestRefusal({ ...base, paidRetests });
      if (r) return fail(400, r.code, r.message, requestId);
    } else if (b.parent_order_id) {
      const p = await loadUpgradeParent(b.parent_order_id, b.email, mode);
      if (p.error) return fail(400, "bad_parent", p.error, requestId);
      parent = p.parent;
    }

    // The prices table is the price (the launch offer is retired; src/lib/launch.ts is dormant).
    const prices = await loadPrices();
    let quote: ReturnType<typeof computePrice>;
    try {
      quote = computePrice({ tier, extraJurors: b.extra_jurors ?? 0, coupon, parentOrder: parent, prices, now });
    } catch (e) {
      if (e instanceof PricingError && e.code !== "no_price" && e.code !== "bad_parent_price") {
        return fail(400, e.code, e.message, requestId);
      }
      throw e;
    }
    const addons: string[] = [];
    const token = newOrderToken();
    const src = pickSrc(b.src, req.cookies);

    const ins = await db()
      .from("orders")
      .insert({
        token,
        mode,
        stage: "CREATED",
        tier,
        addons,
        // Column from migration 0006 (default 0): only sent when used, so plain orders keep working
        // on a database that hasn't been migrated yet.
        ...(quote.extraJurors > 0 ? { extra_jurors: quote.extraJurors } : {}),
        price_usd: quote.priceUsd,
        email: b.email,
        url: b.url ?? null,
        pitch_text: b.pitch_text ?? null,
        buyer_desc: b.buyer_desc,
        src,
        preview_id: previewId,
        parent_order_id: b.parent_order_id ?? null,
        retest_available: false,
        promo_code: quote.couponCode ?? (b.code ? b.code.toUpperCase() : null),
        deadline_at: null,
      })
      .select("id")
      .single();
    if (ins.error || !ins.data) throw new Error(`insert order: ${ins.error?.message ?? "no row"}`);
    const orderId = (ins.data as { id: string }).id;

    let checkout: { checkoutId: string; purchaseUrl: string };
    try {
      checkout = await createCheckout({
        orderId,
        amountUsd: quote.priceUsd,
        title: checkoutTitle(tier, {
          creditUsd: quote.creditUsd,
          extraJurors: quote.extraJurors,
          couponCode: quote.couponCode,
          orderRef: orderRef(orderId),
        }),
        mode,
        redirectUrl: `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/o/${token}?paid=1`,
      });
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[checkout ${requestId}] whop checkout failed for order ${orderId}: ${msg}`);
      await logEvent({ order_id: orderId, actor: "code", action: "checkout_failed", reasoning: msg, payload: { mode } }).catch(() => {});
      await openIncident("whop_checkout_failed", msg, orderId).catch(() => {});
      return fail(502, "checkout_unavailable", "Payment provider unavailable, please try again.", requestId);
    }

    const upd = await db().from("orders").update({ whop_checkout_id: checkout.checkoutId }).eq("id", orderId);
    if (upd.error) throw new Error(`store whop_checkout_id: ${upd.error.message}`);

    await logEvent({
      order_id: orderId,
      actor: "code",
      action: "checkout_created",
      reasoning:
        [
          quote.couponCode ? `coupon ${quote.couponCode} −$${quote.discountUsd}` : null,
          quote.creditUsd > 0 ? `upgrade credit $${quote.creditUsd} from ${b.parent_order_id}` : null,
          tier === "retest" ? `retest of ${b.parent_order_id}` : null,
        ]
          .filter(Boolean)
          .join("; ") || null,
      payload: {
        mode,
        tier,
        price_usd: quote.priceUsd,
        list_usd: quote.listUsd,
        discount_usd: quote.discountUsd,
        coupon: quote.couponCode,
        credit_usd: quote.creditUsd,
        extra_jurors: quote.extraJurors,
        jurors: quote.jurors,
        juror_cost_cap: quote.jurorCostCap,
        whop_checkout_id: checkout.checkoutId,
        src,
        request_id: requestId,
      },
    });

    return ok(
      {
        purchase_url: checkout.purchaseUrl,
        token,
        price_usd: quote.priceUsd,
        coupon_applied: quote.couponCode,
        credit_usd: quote.creditUsd,
      },
      requestId,
    );
  } catch (e) {
    console.error(`[checkout ${requestId}] ${(e as Error).message}`);
    return fail(500, "internal", "Something went wrong creating your order.", requestId);
  }
}
