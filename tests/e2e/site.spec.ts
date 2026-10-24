// Marketing-site smoke test (WEBSITE_SPEC §11): every IA route loads with 200 and no console errors,
// no horizontal scroll at 360/390/768/1024/1440, and the money path works end to end:
// hero → free preview (real /api/preview) → result → Proof → Whop sandbox checkout URL. We stop at the
// Whop URL: the checkout page itself is stubbed, so nothing is ever paid.
//
//   npx playwright test tests/e2e/site.spec.ts                                   # local dev server
//   E2E_BASE_URL=https://juryhour.vercel.app npx playwright test tests/e2e/site.spec.ts
//
// Free-preview limits are 3/email and 10/network per day, so the real preview runs once per run
// (desktop-chrome). The mobile project runs the same UI with /api/preview mocked and the real
// /api/checkout. Set E2E_REAL_PREVIEW=all to run the real preview in both projects, or =none to mock
// it everywhere.
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { SITE_ROUTES, collectConsoleErrors, mockPreviewApi } from "./helpers";

const WIDTHS: Record<string, number[]> = {
  "mobile-chrome": [360, 390],
  "desktop-chrome": [768, 1024, 1440],
};

/** Elements that stick out past the viewport (for a readable failure message). */
async function horizontalOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number; culprits: string[] }> {
  return page.evaluate(() => {
    const de = document.documentElement;
    const cw = de.clientWidth;
    const culprits: string[] = [];
    if (de.scrollWidth > cw) {
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > cw + 1) {
          const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
          culprits.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""} right=${Math.round(r.right)}`);
          if (culprits.length >= 8) break;
        }
      }
    }
    return { scrollWidth: de.scrollWidth, clientWidth: cw, culprits };
  });
}

test.describe("every route", () => {
  for (const route of SITE_ROUTES) {
    test(`${route} → 200, no console errors, no horizontal scroll`, async ({ page }, info) => {
      const errors = collectConsoleErrors(page);
      const res = await page.goto(route, { waitUntil: "load" });
      expect(res?.status(), `status of ${route}`).toBe(200);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("h1").first()).toBeVisible();

      for (const w of WIDTHS[info.project.name] ?? [390]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(150);
        const o = await horizontalOverflow(page);
        expect(o.scrollWidth, `horizontal scroll on ${route} at ${w}px: ${o.culprits.join(", ")}`).toBeLessThanOrEqual(o.clientWidth);
      }
      await page.waitForLoadState("networkidle").catch(() => {});
      expect(errors, `console errors on ${route}`).toEqual([]);
    });
  }
});

function realPreviewHere(info: TestInfo): boolean {
  const mode = process.env.E2E_REAL_PREVIEW ?? "desktop";
  if (mode === "all") return true;
  if (mode === "none") return false;
  return info.project.name === "desktop-chrome";
}

const PITCH =
  "Invoicely: get paid on time without awkward emails. We send polite payment reminders to your clients " +
  "on a schedule, show who has paid at a glance, and add late fees automatically. Start free, no card needed.";

/** Stub the Whop page itself so the test stops at the checkout URL and never touches a payment form. */
async function stubWhop(page: Page) {
  await page.route(/^https:\/\/([a-z0-9-]+\.)?whop\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Whop checkout (stubbed by e2e)</title>" }),
  );
}

test("money path: hero preview → result → Proof → Whop sandbox checkout", async ({ page }, info) => {
  test.setTimeout(150_000);
  const real = realPreviewHere(info);
  const errors = collectConsoleErrors(page);
  await stubWhop(page);
  if (!real) await mockPreviewApi(page);

  await page.goto("/");
  const hero = page.locator("#preview");
  await expect(hero.getByLabel("Your landing page URL")).toBeVisible();

  // The quick input expands inline; pitch mode avoids depending on a third-party page being readable.
  await hero.getByRole("button", { name: "or paste your pitch" }).click();
  await expect(hero.getByRole("tab", { name: "Paste your pitch" })).toHaveAttribute("aria-selected", "true");
  await hero.getByRole("textbox", { name: "Your pitch" }).fill(PITCH);
  await hero.getByRole("textbox", { name: "Who's your buyer?" }).fill("freelance designers who invoice clients monthly");
  const email = `delivered+qa${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}@resend.dev`;
  await hero.getByRole("textbox", { name: "Your email" }).fill(email);

  const previewResponse = page.waitForResponse((r) => r.url().endsWith("/api/preview") && r.request().method() === "POST", {
    timeout: 90_000,
  });
  await hero.getByRole("button", { name: "Run free preview" }).click();
  const pr = await previewResponse;
  const prBody = (await pr.json().catch(() => ({}))) as Record<string, unknown>;
  expect(pr.status(), `/api/preview answered ${JSON.stringify(prBody)}`).toBe(200);

  await expect(hero.getByRole("heading", { name: "Your free preview" })).toBeVisible({ timeout: 30_000 });
  await expect(hero.getByText("Your weakest line")).toBeVisible();
  await expect(hero.getByText("This is AI guessing. Want real people to judge it?")).toBeVisible();

  const checkoutResponse = page.waitForResponse((r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST", {
    timeout: 45_000,
  });
  await hero.getByRole("button", { name: "Get Proof" }).click();
  const cr = await checkoutResponse;
  const crBody = (await cr.json().catch(() => ({}))) as Record<string, unknown>;
  expect(cr.status(), `/api/checkout answered ${JSON.stringify(crBody)}`).toBe(200);
  const sent = cr.request().postDataJSON() as Record<string, unknown>;
  expect(sent.tier).toBe("proof");
  expect(sent.email).toBe(email);
  if (real) expect(sent.preview_id).toBe(prBody.preview_id);

  await page.waitForURL(/^https:\/\/sandbox\.whop\.com\/checkout\//, { timeout: 30_000 });
  expect(errors, "console errors during the money path").toEqual([]);
});

// Launch offer (WEBSITE_CONTRACTS §0.1): the static shell can be minutes stale, so the bar, the $99 price
// and "until 6:00pm ET today" must disappear in the browser at the real end time, without a reload.
const OFFER_ENDS_AT = Date.parse(process.env.E2E_OFFER_ENDS_AT ?? "2026-10-24T22:00:00Z");

for (const route of ["/", "/pricing"]) {
  test(`launch offer on ${route} disappears at its end time`, async ({ page }) => {
    await page.clock.install({ time: new Date(OFFER_ENDS_AT - 60_000) });
    await page.goto(route);
    const bar = page.getByRole("complementary", { name: "Launch offer" });
    const offerLive = (await bar.count()) > 0; // false once the server itself has stopped offering it
    if (offerLive) {
      await expect(bar).toBeVisible();
      await expect(bar).toContainText(/Proof \$99 \(normally \$149\) until 6:00pm ET today/);
      await expect(page.locator("main")).toContainText("$99");
    }
    await page.clock.runFor(2 * 60_000); // cross the end time with the tab open
    await expect(bar).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("$99");
    await expect(page.locator("main")).not.toContainText(/until 6:00pm ET today/);
    await expect(page.locator("main")).toContainText("$149");

    // A visitor arriving after the end time never sees it, even from a stale shell.
    await page.reload();
    await expect(bar).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("$99");
  });
}
