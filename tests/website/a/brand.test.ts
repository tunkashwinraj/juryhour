// The logo used in the UI/OG is the founder's outlined kit (never retyped), the email header uses the
// kit-derived PNG, and the juror page /t stays unbranded.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_INK, BRAND_SLASH, LOGO_HORIZONTAL, LOGO_SYMBOL, logoDataUri, logoSvg } from "@/components/ui/brand";
import { EMAIL_LOGO_PATH, shell } from "@/emails/layout";

const root = process.cwd();
const kit = (f: string) => readFileSync(join(root, "public/brand/svg", f), "utf8");

function paths(svg: string): { viewBox: string; fills: string[]; ds: string[] } {
  const viewBox = svg.match(/viewBox="([^"]+)"/)![1];
  const m = [...svg.matchAll(/<path fill="(#[0-9a-f]+)" d="([^"]+)"/gi)];
  return { viewBox, fills: m.map((x) => x[1]), ds: m.map((x) => x[2]) };
}

describe("brand logo paths match the kit", () => {
  it.each([
    ["juryhour-horizontal-fullcolor.svg", LOGO_HORIZONTAL],
    ["juryhour-symbol-fullcolor.svg", LOGO_SYMBOL],
  ] as const)("%s", (file, logo) => {
    const k = paths(kit(file));
    expect(logo.viewBox).toBe(k.viewBox);
    expect(`0 0 ${logo.width} ${logo.height}`).toBe(k.viewBox);
    expect(k.fills).toEqual([BRAND_INK, BRAND_SLASH]);
    expect([logo.ink, logo.slash]).toEqual(k.ds);
  });

  it("ondark kit file only differs in the ink fill (slash stays red)", () => {
    const k = paths(kit("juryhour-horizontal-ondark.svg"));
    expect(k.fills).toEqual(["#EEF2F8", BRAND_SLASH]);
    expect(k.ds).toEqual([LOGO_HORIZONTAL.ink, LOGO_HORIZONTAL.slash]);
  });

  it("logoSvg/logoDataUri reproduce the fullcolor mark", () => {
    const svg = logoSvg(LOGO_HORIZONTAL);
    expect(paths(svg).ds).toEqual(paths(kit("juryhour-horizontal-fullcolor.svg")).ds);
    expect(atob(logoDataUri(LOGO_HORIZONTAL).split(",")[1])).toBe(svg);
  });
});

describe("icons and email assets exist", () => {
  it.each([
    "public/favicon.ico",
    "src/app/icon.svg",
    "src/app/apple-icon.png",
    "public/brand/web/icon-192.png",
    "public/brand/web/icon-512.png",
    `public${EMAIL_LOGO_PATH}`,
  ])("%s", (f) => {
    expect(existsSync(join(root, f))).toBe(true);
  });

  it("email shell shows the logo image (absolute URL, alt text) instead of a typed name", () => {
    const html = shell({
      ctx: { appUrl: "https://juryhour.com/", unsubscribeUrl: "https://juryhour.com/api/unsubscribe?e=x&s=y" },
      preheader: "p",
      bodyHtml: "<p>b</p>",
      marketing: false,
    });
    expect(html).toContain(`<img src="https://juryhour.com${EMAIL_LOGO_PATH}" width="162" height="28" alt="JuryHour"`);
    expect(html).not.toContain(">JURYHOUR<");
  });
});

describe("juror page /t stays unbranded", () => {
  const dir = join(root, "src/app/t/[testId]");
  const css = readFileSync(join(dir, "juror.module.css"), "utf8");
  const page = readFileSync(join(dir, "page.tsx"), "utf8");
  const app = readFileSync(join(dir, "JurorApp.tsx"), "utf8");

  it("uses only its own --j-* palette, no brand tokens or brand hexes", () => {
    const vars = [...css.matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]);
    expect(vars.every((v) => v.startsWith("j-"))).toBe(true);
    expect(css.toLowerCase()).not.toMatch(/#14213d|#d8342c|#eef2f8/);
  });

  it("renders no logo and opts out of the brand favicon and title suffix", () => {
    for (const src of [page, app]) {
      expect(src).not.toMatch(/Wordmark|<Logo|brand\/|@\/components\/ui/);
    }
    expect(page).toContain('title: { absolute: "Quick feedback task" }');
    expect(page).toMatch(/icons: \{ icon: BLANK_ICON/);
  });

  it("no app/favicon.ico (Next injects it on every route, /t included; the .ico lives in public/)", () => {
    expect(existsSync(join(root, "src/app/favicon.ico"))).toBe(false);
  });
});
