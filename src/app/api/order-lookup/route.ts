// POST /api/order-lookup — "email me my order links" (WEBSITE_CONTRACTS §2 C, /contact).
// in  { email }  →  always { ok:true, message: LOOKUP_MESSAGE } for a valid email, whether or not it
// has orders, and whether or not the per-email limit was hit (never reveals who is a customer).
// The order query and the email run after the response is sent, so timing doesn't leak either.
// Limits: 3 lookups per email per 24h (silently not sent above it); 10 per ip_hash per 24h → 429.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, rid } from "@/components/api";
import { pickSrc } from "@/lib/analytics";
import { db } from "@/lib/db";
import {
  LOOKUPS_PER_EMAIL_PER_DAY,
  LOOKUPS_PER_IP_PER_DAY,
  LOOKUP_MESSAGE,
  clientIp,
  countLeads,
  hashIp,
  runAfterResponse,
  sendOrderLinks,
} from "../leads/_lib";

const Body = z.object({ email: z.string().trim().toLowerCase().max(254).email() });

export async function POST(req: NextRequest) {
  const requestId = rid();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, "bad_request", "Body must be JSON", requestId);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return jsonError(400, "bad_request", "Enter a valid email address.", requestId);
  const email = parsed.data.email;

  try {
    const ipHash = hashIp(clientIp(req));
    if ((await countLeads("ip_hash", ipHash, ["order_lookup"])) >= LOOKUPS_PER_IP_PER_DAY) {
      return jsonError(429, "rate_limited", "Too many requests from your network today. Please try again tomorrow.", requestId);
    }
    const prior = await countLeads("email", email, ["order_lookup"]);
    const ins = await db()
      .from("leads")
      .insert({ kind: "order_lookup", email, payload: {}, src: pickSrc(null, req.cookies), ip_hash: ipHash })
      .select("id")
      .single();
    if (ins.error) throw new Error(`insert lead: ${ins.error.message}`);
    const leadId = (ins.data as { id: string } | null)?.id ?? requestId;

    if (prior < LOOKUPS_PER_EMAIL_PER_DAY) {
      await runAfterResponse(async () => {
        const r = await sendOrderLinks(email, leadId);
        console.log(`[order-lookup] [${requestId}] ${r}`);
      }, `order-lookup ${requestId}`);
    }
    return jsonOk({ message: LOOKUP_MESSAGE }, requestId);
  } catch (e) {
    console.error(`[order-lookup] [${requestId}] ${e instanceof Error ? e.message : String(e)}`);
    return jsonError(500, "internal", "Something went wrong. Please try again.", requestId);
  }
}
