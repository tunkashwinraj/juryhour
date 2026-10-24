// POST /api/quote — Specialist Jury quote request (SPEC §9, CONTRACTS §4).
// in  { email, buyer_desc, url?, pitch_text?, preview_id?, src? }  (url XOR pitch_text)
// out { ok:true, token } | { ok:false, code, error }
// Creates an order: tier specialist, CREATED, price null, quote_expires_at = now + 48h.
// The reconciler requests the Terac quote and emails a Whop checkout link once priced.
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { pickSrc } from "@/lib/analytics";
import { SPECIALIST_QUOTE_TTL_HOURS } from "@/lib/constants";
import { db, logEvent } from "@/lib/db";
import { env } from "@/lib/env";
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
} from "../checkout/_shared";

const Body = OrderInputBase.refine(exactlyOneTarget, exactlyOneTargetMsg);

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  const json = await readJson(req);
  if (!json.ok) return fail(400, "bad_request", "Body must be JSON", requestId);
  const parsed = Body.safeParse(json.value);
  if (!parsed.success) return fail(400, "bad_request", zodMessage(parsed.error), requestId);
  const b = parsed.data;

  try {
    if ((await salesPaused()).paused) {
      return fail(503, "sales_paused", "We're at capacity — verdicts reopen shortly.", requestId);
    }
    const previewId = await validPreviewId(b.preview_id);
    if (previewId === "refused") return fail(403, "content_refused", "We can't test this product.", requestId);

    const mode = env().APP_MODE;
    const token = newOrderToken();
    const src = pickSrc(b.src, req.cookies);
    const expiresAt = new Date(Date.now() + SPECIALIST_QUOTE_TTL_HOURS * 3600_000).toISOString();

    const ins = await db()
      .from("orders")
      .insert({
        token,
        mode,
        stage: "CREATED",
        tier: "specialist",
        addons: [],
        price_usd: null,
        email: b.email,
        url: b.url ?? null,
        pitch_text: b.pitch_text ?? null,
        buyer_desc: b.buyer_desc,
        src,
        preview_id: previewId,
        quote_expires_at: expiresAt,
        deadline_at: null,
      })
      .select("id")
      .single();
    if (ins.error || !ins.data) throw new Error(`insert order: ${ins.error?.message ?? "no row"}`);
    const orderId = (ins.data as { id: string }).id;

    await logEvent({
      order_id: orderId,
      actor: "code",
      action: "quote_requested",
      payload: { mode, tier: "specialist", quote_expires_at: expiresAt, src, request_id: requestId },
    });
    return ok({ token }, requestId);
  } catch (e) {
    console.error(`[quote ${requestId}] ${(e as Error).message}`);
    return fail(500, "internal", "Something went wrong creating your quote request.", requestId);
  }
}
