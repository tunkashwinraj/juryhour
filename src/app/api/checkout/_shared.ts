// Helpers shared by the payments routes (/api/checkout, /api/quote, /api/whop-webhook). Not a route.
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export function fail(status: number, code: string, error: string, requestId: string) {
  return NextResponse.json({ ok: false, code, error }, { status, headers: { "x-request-id": requestId } });
}

export function ok(body: Record<string, unknown>, requestId: string) {
  return NextResponse.json({ ok: true, ...body }, { status: 200, headers: { "x-request-id": requestId } });
}

/** Customer private link token: 32 random bytes, base64url (43 chars). */
export function newOrderToken(): string {
  return randomBytes(32).toString("base64url");
}

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v === null ? undefined : v);

/** Fields every order needs: what to test and who buys it. url XOR pitch_text. */
export const OrderInputBase = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  buyer_desc: z.string().trim().min(3).max(300),
  url: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(2_000).url().refine((u) => /^https?:\/\//i.test(u), "url must be http(s)").optional(),
  ),
  pitch_text: z.preprocess(emptyToUndefined, z.string().trim().min(40).max(6_000).optional()),
  preview_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  src: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
});

export const exactlyOneTarget = (b: { url?: string; pitch_text?: string }) => (b.url ? 1 : 0) + (b.pitch_text ? 1 : 0) === 1;
export const exactlyOneTargetMsg = { message: "Provide either url or pitch_text (exactly one)", path: ["url"] };

export async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false };
  }
}

export function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

/** company_state.sales_paused (single row id=1). Missing row → not paused. */
export async function salesPaused(): Promise<{ paused: boolean; reason: string | null }> {
  const res = await db().from("company_state").select("sales_paused, pause_reason").eq("id", 1).maybeSingle();
  if (res.error) throw new Error(`company_state: ${res.error.message}`);
  const row = res.data as { sales_paused: boolean; pause_reason: string | null } | null;
  return { paused: !!row?.sales_paused, reason: row?.pause_reason ?? null };
}

/** Returns preview_id only if that preview exists and was not refused (else null). */
export async function validPreviewId(previewId: string | undefined): Promise<string | null | "refused"> {
  if (!previewId) return null;
  const res = await db().from("previews").select("id, safety_verdict").eq("id", previewId).maybeSingle();
  if (res.error) throw new Error(`previews: ${res.error.message}`);
  const row = res.data as { id: string; safety_verdict: string } | null;
  if (!row) return null;
  return row.safety_verdict === "refuse" ? "refused" : row.id;
}
