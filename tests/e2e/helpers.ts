// Shared helpers for the marketing-site e2e specs (site.spec.ts, a11y.spec.ts).
import { test, type Page } from "@playwright/test";

/** WEBSITE_SPEC §4 + /legal and /legal/accessibility. */
export const SITE_ROUTES = [
  "/",
  "/how-it-works",
  "/pricing",
  "/sample-report",
  "/for/whop-sellers",
  "/for/lovable-builders",
  "/for/agencies",
  "/compare",
  "/compare/wynter",
  "/compare/pickfu",
  "/verdicts",
  "/blog",
  "/blog/zero-employee-company-in-one-day",
  "/faq",
  "/about",
  "/agents",
  "/affiliates",
  "/contact",
  "/changelog",
  "/legal",
  "/legal/privacy",
  "/legal/terms",
  "/legal/refunds",
  "/legal/accessibility",
  "/styleguide",
] as const;

/** Console noise that isn't a site bug: Vercel analytics endpoints don't exist off Vercel. */
function ignorable(text: string, url: string | undefined): boolean {
  const where = `${text} ${url ?? ""}`;
  return /\/_vercel\/(insights|speed-insights)\//.test(where);
}

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const loc = msg.location()?.url;
    if (!ignorable(msg.text(), loc)) errors.push(`${msg.text()}${loc ? ` (${loc})` : ""}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("response", (res) => {
    const u = res.url();
    if (res.status() >= 400 && sameOrigin(page, u) && !ignorable("", u)) errors.push(`HTTP ${res.status()} ${u}`);
  });
  return errors;
}

function sameOrigin(page: Page, url: string): boolean {
  try {
    const base = new URL(page.url() === "about:blank" ? test.info().project.use.baseURL ?? "" : page.url());
    return new URL(url).origin === base.origin;
  } catch {
    return false;
  }
}

export async function mockPreviewApi(page: Page) {
  await stubTurnstile(page);
  await page.route("**/api/preview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        preview_id: "00000000-0000-4000-8000-0000000e2e01",
        result: {
          headline: "Get paid on time without awkward emails",
          weakest_line: "Start free, no card needed.",
          rewrite_suggestion: "Stop chasing invoices: we remind your clients so you don't have to.",
          recommended_panel: "Freelance designers and developers who invoice clients monthly",
          safety: { verdict: "allow" },
        },
      }),
    }),
  );
}

/**
 * Replace Cloudflare Turnstile with a stub that hands the form a dummy token. Only for tests that also
 * mock /api/preview (the server would reject the dummy token). Builds with a real site key (e.g. a
 * local .env.local) otherwise never get a token on localhost in headless Chromium.
 */
export async function stubTurnstile(page: Page) {
  await page.route(/^https:\/\/challenges\.cloudflare\.com\/turnstile\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('e2e-dummy-token')},0);return 'e2e'},remove:function(){},reset:function(){}};",
    }),
  );
}
