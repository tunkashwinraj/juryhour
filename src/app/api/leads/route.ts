// POST /api/leads — waitlist (sales paused) and agency "free Proof" requests (WEBSITE_CONTRACTS §2 C).
// in  { kind: "waitlist" | "agency_offer", email, payload?, src?, hp? }   (hp = honeypot, must be empty)
// out { ok:true } | { ok:false, code: "bad_request" | "rate_limited" | "internal", error }
// Rate limit: 5 rows per ip_hash per 24h. A repeat of the same kind+email within 24h is a no-op.
// Sends no email (no marketing from the site beyond the existing two preview follow-ups).
import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, log, rid } from "@/components/api";
import { pickSrc } from "@/lib/analytics";
import { db } from "@/lib/db";
import { DAY_MS, LEADS_PER_IP_PER_DAY, clientIp, countLeads, hashIp } from "./_lib";

const LEAD_KINDS = ["waitlist", "agency_offer"] as const;

const PayloadValue = z.union([z.string().max(2_000), z.number(), z.boolean(), z.null()]);
const Body = z.object({
  kind: z.enum(LEAD_KINDS),
  email: z.string().trim().toLowerCase().max(254).email(),
  payload: z
    .record(z.string().min(1).max(40), PayloadValue)
    .refine((p) => Object.keys(p).length <= 10, "payload: at most 10 fields")
    .optional(),
  src: z.string().max(100).nullable().optional(),
  hp: z.string().max(1_000).optional(),
});

export async function POST(req: NextRequest) {
  const requestId = rid();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, "bad_request", "Body must be JSON", requestId);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return jsonError(400, "bad_request", msg, requestId);
  }
  const b = parsed.data;
  if (b.hp && b.hp.trim() !== "") {
    log(requestId, "leads", "honeypot filled; ignored");
    return jsonOk({}, requestId);
  }

  try {
    const ipHash = hashIp(clientIp(req));
    if ((await countLeads("ip_hash", ipHash, [...LEAD_KINDS])) >= LEADS_PER_IP_PER_DAY) {
      return jsonError(429, "rate_limited", "Too many requests from your network today. Please try again tomorrow.", requestId);
    }

    const since = new Date(Date.now() - DAY_MS).toISOString();
    const dup = await db()
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("email", b.email)
      .eq("kind", b.kind)
      .gte("created_at", since);
    if (dup.error) throw new Error(`leads dedupe: ${dup.error.message}`);
    if ((dup.count ?? 0) > 0) return jsonOk({}, requestId);

    const ins = await db()
      .from("leads")
      .insert({
        kind: b.kind,
        email: b.email,
        payload: b.payload ?? {},
        src: pickSrc(b.src, req.cookies),
        ip_hash: ipHash,
      });
    if (ins.error) throw new Error(`insert lead: ${ins.error.message}`);
    log(requestId, "leads", `stored ${b.kind}`);
    return jsonOk({}, requestId);
  } catch (e) {
    console.error(`[leads] [${requestId}] ${e instanceof Error ? e.message : String(e)}`);
    return jsonError(500, "internal", "Something went wrong. Please try again.", requestId);
  }
}
