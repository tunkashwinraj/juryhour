// GET /api/og/verdict/[ref] — 1200×630 verdict share card.
// `ref` is the order token (owner) or the order id (public cards on the landing page).
// Access rule: see canViewOg in src/components/rules.ts.
import { ImageResponse } from "next/og";
import { getOgOrder } from "@/lib/queries";
import { canViewOg, tallyMarks } from "@/components/rules";
import { log, rid } from "@/components/api";

const INK = "#16181D";
const MUTED = "#5A6070";
const PAPER = "#FBFBFC";
const ACCENT = "#2346D8";
const RULE = "#D9DCE3";

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
  const hasAB = r.scorecard.prefer_a !== null && r.scorecard.prefer_b !== null && r.winner !== null;
  const marks = hasAB ? tallyMarks(r.scorecard.prefer_a, r.scorecard.prefer_b, n) : [];
  const verdict = r.headline_verdict.length > 90 ? r.headline_verdict.slice(0, 87) + "…" : r.headline_verdict;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          color: INK,
          padding: "64px 72px",
          borderTop: `16px solid ${ACCENT}`,
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: MUTED }}>The verdict</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: verdict.length > 50 ? 56 : verdict.length > 22 ? 68 : 84, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5 }}>
            {verdict}
          </div>
          {marks.length > 0 && marks.length <= 40 ? (
            <div style={{ display: "flex", marginTop: 36, gap: 10 }}>
              {marks.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    width: 26,
                    height: 56,
                    borderRadius: 4,
                    background: m === "B" ? ACCENT : m === "A" ? INK : "transparent",
                    border: m === "none" ? `3px solid ${RULE}` : "none",
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 36 }}>
            {`${n} real ${n === 1 ? "person" : "people"} · directional signal, not a guarantee`}
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: ACCENT }}>JuryHour</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": order.report_public ? "public, max-age=300" : "private, no-store" },
    },
  );
}
