// Open Graph template (1200×630) for ImageResponse from "next/og": paper background, ink title in
// Newsreader, mono eyebrow, the tally motif. Satori supports flexbox only and no CSS variables, so the
// light-theme token values are inlined here (keep in sync with src/styles/tokens.css).
import type { ReactElement } from "react";

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const OG_COLORS = {
  paper: "#f3f5f9",
  surface: "#ffffff",
  ink: "#0e1a2e",
  ink2: "#33425a",
  muted: "#4f5e74",
  rule: "#d5dce6",
  ruleStrong: "#76839a",
  verdict: "#b42318",
  signal: "#1a6b40",
} as const;

export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700; style: "normal" };

/** Satori's display/mono family names; fall back to its bundled sans when the fetch fails. */
const DISPLAY = "Newsreader";
const MONO = "IBM Plex Mono";

/**
 * Fetch a Google font subset (only the glyphs in `text`) as TTF for Satori. Returns null on any
 * failure or after `timeoutMs`, so the image still renders in the bundled sans-serif.
 */
async function loadGoogleFont(family: string, weight: number, text: string, timeoutMs = 2500): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })).text();
    const src = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const res = await fetch(src, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Fonts for ogImage(): Newsreader 500 for the title, Plex Mono 500 for labels. Never throws. */
export async function loadOgFonts(displayText: string, monoText: string): Promise<OgFont[]> {
  const [display, mono] = await Promise.all([
    loadGoogleFont(DISPLAY, 500, displayText || "JuryHour"),
    loadGoogleFont(MONO, 500, monoText || "JuryHour"),
  ]);
  const fonts: OgFont[] = [];
  if (display) fonts.push({ name: DISPLAY, data: display, weight: 500, style: "normal" });
  if (mono) fonts.push({ name: MONO, data: mono, weight: 500, style: "normal" });
  return fonts;
}

export type OgImageInput = {
  title: string;
  eyebrow?: string;
  tally?: { filled: number; total: number };
  /** Bottom-left line. Default: "Real people · real verdict · same day". */
  footer?: string;
  /** Winner color for the tally. Default verdict red. */
  tone?: "verdict" | "signal";
};

function clampTitle(t: string, max = 110): string {
  const s = t.trim().replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function titleSize(t: string): number {
  if (t.length > 80) return 54;
  if (t.length > 50) return 64;
  if (t.length > 24) return 76;
  return 92;
}

/** Text the template will draw, for font subsetting: [display, mono]. */
export function ogText(i: OgImageInput): [string, string] {
  const footer = i.footer ?? "Real people · real verdict · same day";
  const tally = i.tally ? `${i.tally.filled} of ${i.tally.total}` : "";
  return [`${clampTitle(i.title)}JuryHour`, `${(i.eyebrow ?? "").toUpperCase()}${footer}${tally}0123456789`];
}

function TallyRow({ filled, total, color }: { filled: number; total: number; color: string }) {
  const t = Math.max(0, Math.min(40, Math.floor(total)));
  const f = Math.max(0, Math.min(t, Math.floor(filled)));
  const groups: boolean[][] = [];
  for (let i = 0; i < t; i++) {
    if (i % 5 === 0) groups.push([]);
    groups[groups.length - 1].push(i < f);
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 26 }}>
      {groups.map((g, gi) => (
        <div key={gi} style={{ display: "flex", gap: 10 }}>
          {g.map((on, mi) => (
            <div
              key={mi}
              style={{
                display: "flex",
                width: 14,
                height: 64,
                borderRadius: 2,
                background: on ? color : "transparent",
                border: on ? "none" : `3px solid ${OG_COLORS.ruleStrong}`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Tally-of-five glyph used as the brand mark. */
function Glyph() {
  return (
    <div style={{ display: "flex", position: "relative", width: 40, height: 40 }}>
      {[6, 14, 22, 30].map((x) => (
        <div key={x} style={{ position: "absolute", left: x, top: 4, width: 4, height: 32, borderRadius: 2, background: OG_COLORS.ink }} />
      ))}
      <div
        style={{
          position: "absolute",
          left: -2,
          top: 18,
          width: 44,
          height: 4,
          borderRadius: 2,
          background: OG_COLORS.verdict,
          transform: "rotate(-30deg)",
        }}
      />
    </div>
  );
}

/** JSX for `new ImageResponse(ogImage({...}), { ...OG_SIZE, fonts })`. */
export function ogImage(i: OgImageInput): ReactElement {
  const title = clampTitle(i.title);
  const footer = i.footer ?? "Real people · real verdict · same day";
  const color = i.tone === "signal" ? OG_COLORS.signal : OG_COLORS.verdict;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: OG_COLORS.paper,
        color: OG_COLORS.ink,
        padding: "64px 80px 56px",
        borderLeft: `14px solid ${OG_COLORS.ink}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Glyph />
          <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: 40, fontWeight: 500, letterSpacing: -0.5 }}>JuryHour</div>
        </div>
        {i.eyebrow ? (
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 22, letterSpacing: 2, color: OG_COLORS.muted }}>
            {i.eyebrow.toUpperCase()}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <div
          style={{
            display: "flex",
            fontFamily: DISPLAY,
            fontSize: titleSize(title),
            fontWeight: 500,
            lineHeight: 1.06,
            letterSpacing: -1.5,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
        {i.tally ? <TallyRow filled={i.tally.filled} total={i.tally.total} color={color} /> : null}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 22,
          borderTop: `2px solid ${OG_COLORS.rule}`,
          fontFamily: MONO,
          fontSize: 24,
          color: OG_COLORS.ink2,
        }}
      >
        <div style={{ display: "flex" }}>{footer}</div>
        {i.tally ? (
          <div style={{ display: "flex", color: OG_COLORS.ink }}>{`${Math.min(i.tally.filled, i.tally.total)} of ${i.tally.total}`}</div>
        ) : null}
      </div>
    </div>
  );
}
