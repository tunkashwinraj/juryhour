// The juror page must stay neutral (WEBSITE_SPEC §11): no JuryHour name, logo, marketing chrome,
// launch offer or analytics-visible brand in the page or its link preview. The test API is mocked.
import { expect, test } from "@playwright/test";

const TEST_ID = "22222222-2222-4222-8222-222222222222";

test("/t is neutral: no brand, no marketing chrome, neutral link preview", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-chrome", "juror page is phone-first");
  await page.route(`**/api/juror/test/${TEST_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        test_id: TEST_ID,
        format: "proof",
        card_a: { headline: "Acme invoices", subheadline: "Sub A", bullets: ["a1", "a2", "a3"], cta: "Go" },
        card_b: { headline: "Acme billing", subheadline: "Sub B", bullets: ["b1", "b2", "b3"], cta: "Go" },
        attention: { prompt: "Which of these was mentioned?", options: ["a1", "x", "y"] },
        specialist: false,
        live: true,
      }),
    }),
  );
  await page.goto(`/t/${TEST_ID}?sid=sub_neutral`);
  await expect(page.locator("main")).toBeVisible();
  await page.waitForLoadState("networkidle").catch(() => {});

  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/juryhour/i);
  await expect(page.locator("header, footer, nav")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Launch offer" })).toHaveCount(0);
  await expect(page.locator('img, svg[aria-label*="JuryHour" i], [class*="logo" i], [class*="wordmark" i]')).toHaveCount(0);

  await expect(page).toHaveTitle("Quick feedback task");
  const head = await page.locator("head").innerHTML();
  expect(head, "brand in <head> (title, Open Graph, icons)").not.toMatch(/juryhour|\$1,000|\/icon\.svg|apple-icon|manifest/i);
});
