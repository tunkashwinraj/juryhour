// Every text/background pair in src/styles/tokens.css meets WCAG AA in both themes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, formatRatio, luminance, parseHex } from "@/styles/contrast";

const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function block(selectorStart: string): Record<string, string> {
  const i = css.indexOf(selectorStart);
  if (i < 0) throw new Error(`no block ${selectorStart}`);
  const open = css.indexOf("{", i + selectorStart.length - 1);
  const close = css.indexOf("}", open);
  const out: Record<string, string> = {};
  for (const m of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,6})\s*;/gi)) out[m[1]] = m[2];
  return out;
}

const light = block(':root,\n[data-theme="light"] {');
const darkMedia = block(':root:not([data-theme="light"]) {');
const darkAttr = block('[data-theme="dark"] {');

const TEXT = ["ink", "ink-2", "muted", "verdict-ink", "signal"];
const BGS = ["paper", "surface", "wash"];
const PAIRS: [string, string, number][] = [
  ...TEXT.flatMap((fg) => BGS.map((bg) => [fg, bg, 4.5] as [string, string, number])),
  // --verdict is the brand red for marks/fills (tally, stamp frame, input error edge): 3:1 graphics.
  ...BGS.map((bg) => ["verdict", bg, 3] as [string, string, number]),
  ...BGS.map((bg) => ["focus", bg, 3] as [string, string, number]),
  ...BGS.map((bg) => ["rule-strong", bg, 3] as [string, string, number]),
  ["on-ink", "ink", 4.5],
  ["on-ink", "ink-hover", 4.5],
  ["verdict-ink", "verdict-wash", 4.5],
  ["signal", "signal-wash", 4.5],
  ["warn-ink", "warn-wash", 4.5],
  ["on-verdict", "verdict", 4.5],
  ["ink", "verdict-wash", 4.5],
];

describe("contrast helpers", () => {
  it("parses hex and computes known ratios", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(luminance("#000000")).toBe(0);
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(formatRatio(4.499)).toBe("4.49");
    expect(() => parseHex("red")).toThrow();
  });
});

describe.each([
  ["light", light],
  ["dark (prefers-color-scheme)", darkMedia],
  ["dark ([data-theme])", darkAttr],
])("tokens.css %s", (_name, t) => {
  it("defines every color token", () => {
    for (const k of [...TEXT, ...BGS, "verdict", "focus", "rule", "rule-strong", "on-ink", "ink-hover", "verdict-wash", "signal-wash", "warn-ink", "warn-wash", "on-verdict"]) {
      expect(t[k], k).toMatch(/^#/);
    }
  });
  it.each(PAIRS)("%s on %s ≥ %s:1", (fg, bg, min) => {
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe("brand colors (public/brand/README.md)", () => {
  it("light theme uses Ink, Verdict red and Paper verbatim", () => {
    expect(light.ink.toLowerCase()).toBe("#14213d");
    expect(light.verdict.toLowerCase()).toBe("#d8342c");
    expect(light.paper.toLowerCase()).toBe("#eef2f8");
  });
  it("dark theme puts Paper text on an Ink page", () => {
    expect(darkMedia.paper.toLowerCase()).toBe("#14213d");
    expect(darkMedia.ink.toLowerCase()).toBe("#eef2f8");
  });
});

describe("dark theme is defined once in two places", () => {
  it("media-query and [data-theme=dark] blocks match", () => {
    expect(darkAttr).toEqual(darkMedia);
  });
});
