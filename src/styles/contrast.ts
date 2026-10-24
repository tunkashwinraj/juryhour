// WCAG 2.x contrast helpers (pure; used by tests/website/a/contrast.test.ts to check tokens.css).

/** "#abc" | "#aabbcc" → [r, g, b] in 0–255. Throws on anything else. */
export function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Not a hex color: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance per WCAG 2.2 (sRGB). */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio (1–21), order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Rounded down to 2 decimals so a reported "4.50" never hides a 4.499. */
export function formatRatio(r: number): string {
  return (Math.floor(r * 100) / 100).toFixed(2);
}
