// Accessibility checks (WEBSITE_SPEC §11, WCAG 2.2 AA):
// - keyboard-only path: skip link → hero → pitch form → errors announced → result → Proof → Whop URL,
//   with a visible focus indicator on every stop (preview + checkout APIs mocked: no rate limits,
//   no orders; the real path is covered by site.spec.ts)
// - axe-core (pinned, fetched from cdnjs and injected inline) on every route in light and dark
// - reduced motion: the tally / 5-second timer don't animate and smooth scrolling is off
import { expect, test, type Page } from "@playwright/test";
import { SITE_ROUTES, collectConsoleErrors, mockPreviewApi, stubTurnstile } from "./helpers";

const AXE_URL = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js";
let axeSource: Promise<string> | null = null;
function loadAxe(): Promise<string> {
  axeSource ??= fetch(AXE_URL).then((r) => {
    if (!r.ok) throw new Error(`axe-core download failed: HTTP ${r.status}`);
    return r.text();
  });
  return axeSource;
}

type AxeViolation = { id: string; impact: string | null; help: string; nodes: { target: string[]; failureSummary?: string }[] };

async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: await loadAxe() });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: AxeViolation[] }> } }).axe;
    const r = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      resultTypes: ["violations"],
    });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target, failureSummary: n.failureSummary })),
    }));
  });
}

function describeViolations(vs: AxeViolation[]): string {
  return vs
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `    ${n.target.join(" ")} — ${n.failureSummary?.split("\n").slice(1).join(" ").trim()}`).join("\n")}`)
    .join("\n");
}

test.describe("axe (WCAG 2.2 AA)", () => {
  test.skip(({ isMobile }) => isMobile, "one viewport is enough for axe; widths are covered by site.spec");
  for (const scheme of ["light", "dark"] as const) {
    for (const route of SITE_ROUTES) {
      test(`${scheme}: ${route}`, async ({ page }) => {
        // Reduced motion: audit the settled state, not a tally mark halfway through its fill.
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.goto(route, { waitUntil: "load" });
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        const lum = luminance(bg);
        if (scheme === "dark") expect(lum, `body background in dark mode is ${bg}`).toBeLessThan(0.2);
        else expect(lum, `body background in light mode is ${bg}`).toBeGreaterThan(0.7);
        const violations = await runAxe(page);
        expect(violations, describeViolations(violations)).toEqual([]);
      });
    }
  }
});

function luminance(rgb: string): number {
  const m = rgb.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  const [r, g, b] = m.slice(0, 3).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Press Tab until `done()` matches the focused element; every stop must show a focus indicator. */
async function tabUntil(page: Page, done: (el: { id: string; text: string; tag: string }) => boolean, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const el = await focused(page);
    expect(el.visibleFocus, `no visible focus indicator on ${el.tag}#${el.id} "${el.text}"`).toBe(true);
    if (done(el)) return el;
  }
  throw new Error(`target not reached after ${max} Tab presses`);
}

async function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { id: "", text: "", tag: "body", visibleFocus: false };
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
    const ring = cs.boxShadow !== "none" && cs.boxShadow !== "";
    const r = el.getBoundingClientRect();
    return {
      id: el.id,
      text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 60),
      tag: el.tagName.toLowerCase(),
      visibleFocus: (outline || ring) && r.width > 0 && r.height > 0,
    };
  });
}

test("keyboard only: preview → errors → result → Proof checkout", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chrome", "keyboard path runs on desktop");
  const errors = collectConsoleErrors(page);
  await mockPreviewApi(page);
  let checkoutBody: Record<string, unknown> | null = null;
  await page.route("**/api/checkout", async (route) => {
    checkoutBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, order_id: "e2e", token: "e2e", purchase_url: "https://sandbox.whop.com/checkout/plan_e2e_keyboard" }),
    });
  });
  await page.route(/^https:\/\/([a-z0-9-]+\.)?whop\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>stub</title>" }),
  );

  await page.goto("/");
  // 1. The first Tab stop is the skip link, and it becomes visible.
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  // 2. Reach the hero quick input, then the "or paste your pitch" switch.
  await tabUntil(page, (el) => el.id === "preview-quick-url");
  await tabUntil(page, (el) => el.text === "or paste your pitch");
  await page.keyboard.press("Enter");
  await expect(page.locator("#preview-pitch")).toBeFocused();

  // 3. Submitting empty: the error is announced and focus goes to the first invalid field.
  await page.keyboard.press("Tab"); // buyer
  await page.keyboard.press("Tab"); // email
  await tabUntil(page, (el) => el.text === "Run free preview", 4);
  await page.keyboard.press("Enter");
  await expect(page.locator("#preview").getByRole("alert")).toContainText(/Please fix the 3 highlighted fields/);
  await expect(page.locator("#preview-pitch")).toBeFocused();
  await expect(page.locator("#preview-pitch")).toHaveAttribute("aria-invalid", "true");
  const describedBy = await page.locator("#preview-pitch").getAttribute("aria-describedby");
  expect(describedBy).toContain("preview-pitch-error");
  await expect(page.locator("#preview-pitch-error")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#preview-pitch-error")).not.toBeEmpty();

  // 4. Fill by keyboard and submit.
  await page.keyboard.type("Invoicely sends polite payment reminders to your clients so freelancers get paid on time. Start free.");
  await page.keyboard.press("Tab");
  await page.keyboard.type("freelance designers");
  await page.keyboard.press("Tab");
  await page.keyboard.type("delivered+qa-keyboard@resend.dev");
  await tabUntil(page, (el) => el.text === "Run free preview", 4);
  await page.keyboard.press("Enter");

  // 5. Result: focus moves to its heading, so screen readers land on it.
  const resultHeading = page.locator("#preview-result-title");
  await expect(resultHeading).toBeFocused({ timeout: 15_000 });
  await expect(resultHeading).toHaveText("Your free preview");

  // 6. Tab to "Get Proof" and press Enter → Whop checkout URL.
  await tabUntil(page, (el) => el.text === "Get Proof", 40);
  await page.keyboard.press("Enter");
  await page.waitForURL(/^https:\/\/sandbox\.whop\.com\/checkout\//);
  expect(checkoutBody).toMatchObject({ tier: "proof", email: "delivered+qa-keyboard@resend.dev" });
  expect(errors).toEqual([]);
});

test("loading state is announced politely", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chrome", "desktop only");
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await stubTurnstile(page);
  await page.route("**/api/preview", async (route) => {
    await gate;
    await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ ok: false, code: "rate_limited", error: "x" }) });
  });
  await page.goto("/");
  const hero = page.locator("#preview");
  await hero.getByRole("button", { name: "or paste your pitch" }).click();
  await hero.getByRole("textbox", { name: "Your pitch" }).fill("Invoicely sends polite payment reminders to your clients so freelancers get paid on time.");
  await hero.getByRole("textbox", { name: "Who's your buyer?" }).fill("freelance designers");
  await hero.getByRole("textbox", { name: "Your email" }).fill("delivered+qa-loading@resend.dev");
  await hero.getByRole("button", { name: "Run free preview" }).click();
  const status = hero.getByRole("status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toContainText(/Reading your pitch/);
  release();
  // Rate limited: plain explanation, announced, focus on the heading.
  await expect(hero.getByRole("alert")).toContainText(/free preview limit/);
  await expect(page.locator("#preview-result-title")).toBeFocused();
});

test("reduced motion is honored", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const motion = await page.evaluate(() => {
    const animated: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      for (const pseudo of [null, "::before", "::after"]) {
        const cs = getComputedStyle(el, pseudo);
        const names = cs.animationName.split(",").map((s) => s.trim());
        const durations = cs.animationDuration.split(",").map((s) => parseFloat(s));
        if (names.some((n, i) => n !== "none" && (durations[i] ?? durations[0]) > 0.01)) {
          animated.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}${pseudo ?? ""} ${cs.animationName}`);
        }
      }
    }
    return { animated: animated.slice(0, 10), scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior };
  });
  expect(motion.animated, "animations running under prefers-reduced-motion: reduce").toEqual([]);
  expect(motion.scrollBehavior).not.toBe("smooth");
});
