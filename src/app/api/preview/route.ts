// POST /api/preview — free preview + content-safety screen (SPEC §10, CONTRACTS §4).
// in  { url?, pitch_text?, buyer_desc, email, turnstile_token, src? }   (url XOR pitch_text)
// out { ok:true, preview_id, result } | { ok:true, preview_id, refused:true, reason } | { ok:false, code, error }
import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db, logEvent } from "@/lib/db";
import { env } from "@/lib/env";
import { getPageText } from "@/lib/exa";
import { previewAndSafety, LlmError } from "@/lib/llm";
import { verifyTurnstile } from "@/lib/turnstile";
import { pickSrc } from "@/lib/analytics";
import { PREVIEW_LIMIT_PER_EMAIL_PER_DAY, PREVIEW_LIMIT_PER_IP_PER_DAY } from "@/lib/constants";

// Exa (≤20s) + OpenAI (≤20s, one retry on 5xx) can exceed the platform default.
export const maxDuration = 60;

const PITCH_MIN = 40;
const PITCH_MAX = 6_000;

const Body = z
  .object({
    url: z
      .string()
      .trim()
      .max(2_000)
      .url()
      .refine((u) => /^https?:\/\//i.test(u), "url must be http(s)")
      .optional(),
    pitch_text: z.string().trim().min(PITCH_MIN).max(PITCH_MAX).optional(),
    buyer_desc: z.string().trim().min(3).max(300),
    email: z.string().trim().toLowerCase().max(254).email(),
    turnstile_token: z.string().max(4_096).nullable().optional(),
    src: z.string().max(100).nullable().optional(),
  })
  .refine((b) => (b.url ? 1 : 0) + (b.pitch_text ? 1 : 0) === 1, {
    message: "Provide either url or pitch_text (exactly one)",
    path: ["url"],
  });

type ErrorCode =
  | "bad_request"
  | "turnstile_failed"
  | "rate_limited"
  | "page_unreadable"
  | "preview_failed"
  | "internal";

function fail(status: number, code: ErrorCode, error: string, requestId: string) {
  return NextResponse.json({ ok: false, code, error }, { status, headers: { "x-request-id": requestId } });
}

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || null;
  return req.headers.get("x-real-ip")?.trim() || null;
}

/** sha256(ip + OPS_API_KEY) — the key acts as a server-side salt so hashes can't be reversed by lookup. */
function hashIp(ip: string | null): string {
  return createHash("sha256").update(`${ip ?? "unknown"}|${env().OPS_API_KEY}`).digest("hex");
}

async function countSince(column: "email" | "ip_hash", value: string, sinceIso: string): Promise<number> {
  const res = await db()
    .from("previews")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", sinceIso);
  if (res.error) throw new Error(`count previews by ${column}: ${res.error.message}`);
  return res.count ?? 0;
}

/** Best-effort cost booking: a failed ledger write must not fail the customer's preview. */
async function bookCost(kind: "exa_cost" | "ai_cost", amountUsd: number, ref: string, note: string, requestId: string) {
  if (!(amountUsd > 0)) return;
  const res = await db().from("ledger").insert({
    order_id: null,
    mode: env().APP_MODE,
    kind,
    amount_usd: -amountUsd,
    ref,
    note,
  });
  if (res.error) console.error(`[preview ${requestId}] ledger ${kind} failed: ${res.error.message}`);
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "bad_request", "Body must be JSON", requestId);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return fail(400, "bad_request", msg, requestId);
  }
  const b = parsed.data;
  const ip = clientIp(req);

  try {
    if (!(await verifyTurnstile(b.turnstile_token ?? null, ip))) {
      return fail(403, "turnstile_failed", "Bot check failed. Refresh the page and try again.", requestId);
    }

    const ipHash = hashIp(ip);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [byEmail, byIp] = await Promise.all([countSince("email", b.email, since), countSince("ip_hash", ipHash, since)]);
    if (byEmail >= PREVIEW_LIMIT_PER_EMAIL_PER_DAY || byIp >= PREVIEW_LIMIT_PER_IP_PER_DAY) {
      return fail(429, "rate_limited", "You've reached today's free preview limit. Try again tomorrow.", requestId);
    }

    // Page text: Exa /contents for a URL, or the pasted pitch.
    let pageText: string;
    let exaCost = 0;
    if (b.url) {
      try {
        const page = await getPageText(b.url);
        pageText = page.title && !page.text.includes(page.title) ? `${page.title}\n\n${page.text}` : page.text;
        exaCost = page.costDollars;
      } catch (err) {
        console.warn(`[preview ${requestId}] page fetch failed: ${err instanceof Error ? err.message : String(err)}`);
        return fail(
          422,
          "page_unreadable",
          "We couldn't read that page. Paste your pitch instead (the text from your landing page works best).",
          requestId,
        );
      }
    } else {
      pageText = b.pitch_text!;
    }

    let result: Awaited<ReturnType<typeof previewAndSafety>>;
    try {
      result = await previewAndSafety({ pageText, buyerDesc: b.buyer_desc });
    } catch (err) {
      const code = err instanceof LlmError ? err.code : "unknown";
      console.error(`[preview ${requestId}] previewAndSafety failed (${code}): ${err instanceof Error ? err.message : String(err)}`);
      // Spend already incurred still gets booked.
      await bookCost("exa_cost", exaCost, `preview-req:${requestId}:exa`, "preview (failed) exa /contents", requestId);
      if (err instanceof LlmError) {
        await bookCost("ai_cost", err.costUsd, `preview-req:${requestId}:ai`, "preview (failed) openai", requestId);
      }
      return fail(502, "preview_failed", "Our reviewer is busy right now. Please try again in a minute.", requestId);
    }

    const { costUsd, ...preview } = result;
    const refused = preview.safety.verdict === "refuse";
    const src = pickSrc(b.src, req.cookies);

    const ins = await db()
      .from("previews")
      .insert({
        email: b.email,
        url: b.url ?? null,
        pitch_text: b.pitch_text ?? null,
        buyer_desc: b.buyer_desc,
        page_text: b.url ? pageText : null,
        headline: refused ? null : preview.headline,
        weakest_line: refused ? null : preview.weakest_line,
        rewrite_suggestion: refused ? null : preview.rewrite_suggestion,
        recommended_panel: refused ? null : preview.recommended_panel,
        safety_verdict: preview.safety.verdict,
        safety_reason: preview.safety.reason,
        src,
        ip_hash: ipHash,
      })
      .select("id")
      .single();
    if (ins.error || !ins.data) throw new Error(`insert preview: ${ins.error?.message ?? "no row"}`);
    const previewId = (ins.data as { id: string }).id;

    await Promise.all([
      bookCost("exa_cost", exaCost, `preview:${previewId}:exa`, `preview ${previewId} exa /contents`, requestId),
      bookCost("ai_cost", costUsd, `preview:${previewId}:ai`, `preview ${previewId} openai`, requestId),
    ]);

    if (refused) {
      try {
        await logEvent({
          actor: "code",
          action: "preview_refused",
          reasoning: preview.safety.reason,
          payload: { preview_id: previewId, url: b.url ?? null },
        });
      } catch (err) {
        console.error(`[preview ${requestId}] logEvent failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return NextResponse.json(
        { ok: true, preview_id: previewId, refused: true, reason: preview.safety.reason },
        { headers: { "x-request-id": requestId } },
      );
    }

    return NextResponse.json({ ok: true, preview_id: previewId, result: preview }, { headers: { "x-request-id": requestId } });
  } catch (err) {
    console.error(`[preview ${requestId}] ${err instanceof Error ? err.message : String(err)}`);
    return fail(500, "internal", "Something went wrong. Please try again.", requestId);
  }
}
