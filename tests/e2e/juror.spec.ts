// Juror page smoke (mobile viewport): randomization, exact 5s reveal, word counter, submit, Terac redirect.
// Every request the page makes is mocked, so this needs only `next dev` (no DB, no Terac key).
import { expect, test, type Page, type Route } from "@playwright/test";

const TEST_ID = "11111111-1111-4111-8111-111111111111";
const SID = "sub_e2e_1";
const CALLBACK = "https://terac.com/api/external/callback";

const cardA = {
  headline: "Invoices that chase themselves",
  subheadline: "Automatic reminders for freelancers who hate asking twice.",
  bullets: ["Sends polite reminders on a schedule", "Syncs with your bank feed", "Late fees added automatically"],
  cta: "Start free",
};
const cardB = {
  headline: "Get paid on time without awkward emails",
  subheadline: "We remind your clients so you don't have to.",
  bullets: ["Friendly reminders on autopilot", "See who has paid at a glance", "Works with any bank"],
  cta: "Try it free",
};
const attentionOptions = ["Syncs with your bank feed", "Free pizza on Fridays", "Built-in video calls"];

function publicTest(over: Record<string, unknown> = {}) {
  return {
    test_id: TEST_ID,
    format: "proof",
    card_a: cardA,
    card_b: cardB,
    attention: { prompt: "Which of these was mentioned in the description you just saw?", options: attentionOptions },
    specialist: false,
    live: true,
    ...over,
  };
}

const SIXTEEN = "It sends reminders to clients who owe money so freelancers get paid without chasing them by email";

type Mocks = { submitted: Record<string, unknown>[] };
type CardBody = { what_it_does: string; clarity: number; would_try: number };
type SubmittedAnswers = { cards: { A: CardBody; B?: CardBody }; preferred?: string; attention_choice: string };

async function mockApis(page: Page, test: Record<string, unknown> | null, submitReply?: (body: Record<string, unknown>) => unknown) {
  const mocks: Mocks = { submitted: [] };
  await page.route(`**/api/juror/test/${TEST_ID}`, (route: Route) =>
    test
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(test) })
      : route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, code: "test_not_found", error: "x" }) }),
  );
  await page.route("**/api/juror/submit", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    mocks.submitted.push(body);
    const reply = submitReply?.(body) ?? { ok: true, redirect: `${CALLBACK}?teracSubmissionId=${body.sid}&result=completed` };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reply) });
  });
  await page.route(`${CALLBACK}**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>terac callback</p>" }));
  return mocks;
}

/** Click start with a deterministic Math.random and frozen clock; returns the first card letter shown. */
async function startWithClock(page: Page, random: number) {
  await expect(page.getByTestId("consent")).toBeVisible();
  await page.evaluate((r) => {
    Math.random = () => r;
  }, random);
  await page.clock.pauseAt(Date.now() + 1000);
  await page.getByTestId("start").click();
  const card = page.getByTestId("card");
  await expect(card).toBeVisible();
  return (await card.getAttribute("data-card")) as "A" | "B";
}

async function revealLastsExactly5s(page: Page) {
  const card = page.getByTestId("card");
  await expect(card).toBeVisible();
  await page.clock.runFor(4_900);
  await expect(card).toBeVisible();
  await page.clock.runFor(200);
  await expect(card).toBeHidden();
  await expect(page.getByTestId("questions")).toBeVisible();
}

async function answerCard(page: Page) {
  const next = page.getByTestId("next");
  const text = page.getByTestId("what_it_does");
  await text.fill("Too short to count");
  await expect(page.getByTestId("word-count")).toContainText("4 / 15");
  await page.getByTestId("scale-clarity").getByText("6", { exact: true }).click();
  await page.getByTestId("scale-would_try").getByText("5", { exact: true }).click();
  await expect(next).toBeDisabled();
  await text.fill(SIXTEEN);
  await expect(page.getByTestId("word-count")).toContainText("17 / 15");
  await expect(next).toBeEnabled();
  await next.click();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install();
});

test("proof: random first card, 5s reveals, both cards, preference, shuffled attention, submit → Terac redirect", async ({ page }) => {
  const mocks = await mockApis(page, publicTest());
  await page.goto(`/t/${TEST_ID}?sid=${SID}&teracSubmissionId=${SID}&taskId=task_1`);

  const first = await startWithClock(page, 0.1); // < 0.5 → B first
  expect(first).toBe("B");
  await expect(page.getByTestId("card-headline")).toHaveText(cardB.headline);
  await revealLastsExactly5s(page);
  await answerCard(page);

  await expect(page.getByTestId("ready")).toBeVisible();
  await page.getByTestId("show-second").click();
  await expect(page.getByTestId("card")).toHaveAttribute("data-card", "A");
  await expect(page.getByTestId("card-headline")).toHaveText(cardA.headline);
  await revealLastsExactly5s(page);
  await answerCard(page);
  await page.clock.resume();

  await expect(page.getByTestId("preference")).toBeVisible();
  await page.getByText("The first description").click();
  await page.getByTestId("why").fill("It was clearer about getting paid.");
  await page.getByTestId("next").click();

  await expect(page.getByTestId("attention")).toBeVisible();
  for (const o of attentionOptions) await expect(page.getByTestId("choice-attention").getByText(o, { exact: true })).toBeVisible();
  await page.getByText("Syncs with your bank feed", { exact: true }).click();
  await page.getByTestId("submit").click();

  await page.waitForURL(`${CALLBACK}?teracSubmissionId=${SID}&result=completed`);
  expect(mocks.submitted).toHaveLength(1);
  const body = mocks.submitted[0] as { test_id: string; sid: string; first_card: string; started_at: number; answers: SubmittedAnswers };
  expect(body).toMatchObject({ test_id: TEST_ID, sid: SID, first_card: "B" });
  expect(typeof body.started_at).toBe("number");
  expect(body.answers.preferred).toBe("B"); // "first description" = the card shown first
  expect(body.answers.cards.A).toMatchObject({ what_it_does: SIXTEEN, clarity: 6, would_try: 5 });
  expect(body.answers.cards.B).toMatchObject({ what_it_does: SIXTEEN, clarity: 6, would_try: 5 });
  expect(body.answers.attention_choice).toBe("Syncs with your bank feed");
  expect(JSON.stringify(body)).not.toMatch(/email|name/i);
});

test("randomization: Math.random ≥ 0.5 shows card A first", async ({ page }) => {
  await mockApis(page, publicTest());
  await page.goto(`/t/${TEST_ID}?sid=${SID}`);
  expect(await startWithClock(page, 0.9)).toBe("A");
});

test("pulse/spark: only card A, no preference step", async ({ page }) => {
  const mocks = await mockApis(page, publicTest({ format: "pulse", card_b: null }));
  await page.goto(`/t/${TEST_ID}?teracSubmissionId=${SID}`);
  expect(await startWithClock(page, 0.1)).toBe("A");
  await revealLastsExactly5s(page);
  await answerCard(page);
  await page.clock.resume();
  await expect(page.getByTestId("attention")).toBeVisible();
  await page.getByText("Free pizza on Fridays", { exact: true }).click();
  await page.getByTestId("submit").click();
  await page.waitForURL(`${CALLBACK}**`);
  const body = mocks.submitted[0] as { first_card: string; answers: SubmittedAnswers };
  expect(body.first_card).toBe("A");
  expect(body.answers.cards.B).toBeUndefined();
  expect(body.answers.preferred).toBeUndefined();
});

test("duplicate submission shows 'already submitted' then redirects as completed", async ({ page }) => {
  await mockApis(page, publicTest({ format: "pulse", card_b: null }), (b) => ({
    ok: true,
    duplicate: true,
    redirect: `${CALLBACK}?teracSubmissionId=${b.sid}&result=completed`,
  }));
  await page.goto(`/t/${TEST_ID}?submissionId=${SID}`);
  await startWithClock(page, 0.1);
  await revealLastsExactly5s(page);
  await answerCard(page);
  await page.clock.resume();
  await page.getByText("Syncs with your bank feed", { exact: true }).click();
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("already-submitted")).toBeVisible();
  await page.waitForURL(`${CALLBACK}?teracSubmissionId=${SID}&result=completed`);
});

test("missing sid → friendly error, no test loaded", async ({ page }) => {
  let loaded = false;
  await page.route("**/api/juror/test/**", (r) => {
    loaded = true;
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(publicTest()) });
  });
  await page.goto(`/t/${TEST_ID}`);
  await expect(page.getByTestId("juror-error")).toHaveAttribute("data-reason", "missing_sid");
  await expect(page.getByTestId("start")).toHaveCount(0);
  expect(loaded).toBe(false);
});

test("unsubstituted placeholder sid counts as missing", async ({ page }) => {
  await mockApis(page, publicTest());
  await page.goto(`/t/${TEST_ID}?sid=%7BTERAC_SUBMISSION_ID%7D`);
  await expect(page.getByTestId("juror-error")).toHaveAttribute("data-reason", "missing_sid");
});

test("test not live → friendly error, no answers accepted", async ({ page }) => {
  const mocks = await mockApis(page, publicTest({ live: false }));
  await page.goto(`/t/${TEST_ID}?sid=${SID}`);
  await expect(page.getByTestId("juror-error")).toHaveAttribute("data-reason", "not_live");
  await expect(page.getByTestId("start")).toHaveCount(0);
  expect(mocks.submitted).toHaveLength(0);
});

test("unknown test → friendly error", async ({ page }) => {
  await mockApis(page, null);
  await page.goto(`/t/${TEST_ID}?sid=${SID}`);
  await expect(page.getByTestId("juror-error")).toHaveAttribute("data-reason", "not_found");
});

test("fits a phone screen without horizontal scroll", async ({ page }) => {
  await mockApis(page, publicTest());
  await page.goto(`/t/${TEST_ID}?sid=${SID}`);
  await expect(page.getByTestId("consent")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
