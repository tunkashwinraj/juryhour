// GET /api/og/verdict/[ref] — 1200×630 verdict share card (same template as /api/og).
// `ref` is the order token (owner) or the order id (public cards on the landing page).
// Access rule: see canViewOg in src/components/rules.ts (unchanged by the redesign).
import { ImageResponse } from "next/og";
import { getOgOrder } from "@/lib/queries";
import { canViewOg } from "@/components/rules";
import { log, rid } from "@/components/api";
import { OG_SIZE, loadOgFonts, ogImage, ogText, type OgImageInput } from "@/components/ui/og";

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token: ref } = await ctx.params;
  const id = rid();
  const t = new URL(req.url).searchParams.get("t");
  let order: Awaited<ReturnType<typeof getOgOrder>> = null;
  try {
    order = await getOgOrder(ref);
  } catch (e) {
    log(id, "api/og/verdict", "lookup failed", (e as Error).message);
    return new Response("Could not render this card", { status: 500 });
  }
  if (!order || !order.report || !canViewOg({ ref, t, order })) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const r = order.report;
  const n = r.scorecard.n_approved;
  const a = r.scorecard.prefer_a;
  const b = r.scorecard.prefer_b;
  const hasAB = a !== null && b !== null && r.winner !== null;
  // Winner's votes filled out of everyone heard (the tally motif); no tally for single-version tiers.
  const winnerVotes = hasAB ? (r.winner === "B" ? b : r.winner === "A" ? a : Math.max(a, b)) : 0;
  const input: OgImageInput = {
    title: r.headline_verdict,
    eyebrow: "The verdict",
    tally: hasAB && n > 0 && n <= 40 ? { filled: winnerVotes, total: n } : undefined,
    footer: `${n} real ${n === 1 ? "person" : "people"} · directional, not a guarantee`,
  };

  const [displayText, monoText] = ogText(input);
  const fonts = await loadOgFonts(displayText, monoText);
  return new ImageResponse(ogImage(input), {
    ...OG_SIZE,
    fonts,
    headers: { "Cache-Control": order.report_public ? "public, max-age=300" : "private, no-store" },
  });
}
