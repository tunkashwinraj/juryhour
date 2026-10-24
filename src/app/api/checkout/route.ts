// POST /api/checkout — create a CREATED order + Whop checkout (SPEC §10, CONTRACTS §4).
// in  { tier, addons[], email, buyer_desc, url?, pitch_text?, preview_id?, parent_order_id?, src? }  (url XOR pitch_text)
// out { ok:true, purchase_url, token } | { ok:false, code, error }
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { pickSrc } from "@/lib/analytics";
import { BUYABLE_TIERS, type TierName } from "@/lib/constants";
import { db, logEvent, openIncident } from "@/lib/db";
import { env } from "@/lib/env";
import { applyLaunchOffer } from "@/lib/launch";
import { checkoutTitle, computePrice, type ParentOrderForCredit } from "@/lib/pricing";
import { Addon } from "@/lib/types";
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
  tier: z.enum(BUYABLE_TIERS),
  addons: z.array(Addon).max(3).default([]),
  parent_order_id: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().uuid().optional()),
  // Promo / partner code from ?code= or the "Have a code?" field. Stored for attribution; the only
  // price effect today is the launch offer, which applies by time, not by code.
  code: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().max(40).regex(/^[A-Za-z0-9_-]+$/).optional()),
}).refine(exactlyOneTarget, exactlyOneTargetMsg);

type ParentRow = { id: string; tier: TierName; price_usd: number | string | null; paid_at: string | null; email: string; mode: string };

/**
 * Parent order for an upgrade/retest. Must exist, be in the same mode and belong to the same email.
 * Credit is only offered once per parent: if another paid order already used it, no credit.
 */
async function loadParent(parentId: string, email: string, mode: string): Promise<{ parent: ParentOrderForCredit | null; error?: string }> {
  const res = await db().from("orders").select("id, tier, price_usd, paid_at, email, mode").eq("id", parentId).maybeSingle();
  if (res.error) throw new Error(`orders(parent): ${res.error.message}`);
  const row = res.data as ParentRow | null;
  if (!row || row.mode !== mode || row.email.toLowerCase() !== email) return { parent: null, error: "parent order not found" };
  const used = await db()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("parent_order_id", parentId)
    .not("paid_at", "is", null);
  if (used.error) throw new Error(`orders(parent usage): ${used.error.message}`);
  if ((used.count ?? 0) > 0) return { parent: null };
  return { parent: { tier: row.tier, price_usd: Number(row.price_usd ?? 0), paid_at: row.paid_at } };
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

  try {
    const pause = await salesPaused();
    if (pause.paused) {
      return fail(503, "sales_paused", "We're at capacity — verdicts reopen shortly.", requestId);
    }

    const previewId = await validPreviewId(b.preview_id);
    if (previewId === "refused") return fail(403, "content_refused", "We can't test this product.", requestId);

    const mode = env().APP_MODE;
    let parent: ParentOrderForCredit | null = null;
    if (b.parent_order_id) {
      const p = await loadParent(b.parent_order_id, b.email, mode);
      if (p.error) return fail(400, "bad_parent", p.error, requestId);
      parent = p.parent;
    }

    const prices = applyLaunchOffer(await loadPrices());
    const quote = computePrice({ tier: b.tier, addons: b.addons, parentOrder: parent, prices });
    const addons = [...new Set(b.addons)];
    const token = newOrderToken();
    const src = pickSrc(b.src, req.cookies);

    const ins = await db()
      .from("orders")
      .insert({
        token,
        mode,
        stage: "CREATED",
        tier: b.tier,
        addons,
        price_usd: quote.priceUsd,
        email: b.email,
        url: b.url ?? null,
        pitch_text: b.pitch_text ?? null,
        buyer_desc: b.buyer_desc,
        src,
        preview_id: previewId,
        parent_order_id: b.parent_order_id ?? null,
        retest_available: b.tier === "launch_pack",
        promo_code: b.code ? b.code.toUpperCase() : null,
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
        title: checkoutTitle(b.tier, addons, quote.creditUsd),
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
      reasoning: quote.creditUsd > 0 ? `upgrade credit $${quote.creditUsd} from ${b.parent_order_id}` : null,
      payload: {
        mode,
        tier: b.tier,
        addons,
        price_usd: quote.priceUsd,
        credit_usd: quote.creditUsd,
        jurors: quote.jurors,
        juror_cost_cap: quote.jurorCostCap,
        whop_checkout_id: checkout.checkoutId,
        src,
        request_id: requestId,
      },
    });

    return ok({ purchase_url: checkout.purchaseUrl, token }, requestId);
  } catch (e) {
    console.error(`[checkout ${requestId}] ${(e as Error).message}`);
    return fail(500, "internal", "Something went wrong creating your order.", requestId);
  }
}
