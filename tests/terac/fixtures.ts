export const TEST_ID = "11111111-1111-4111-8111-111111111111";
export const ORDER_ID = "22222222-2222-4222-8222-222222222222";
export const PANEL_ID = "33333333-3333-4333-8333-333333333333";

export const cardA = {
  headline: "Invoices that chase themselves",
  subheadline: "Automatic reminders for freelancers who hate asking twice.",
  bullets: ["Sends polite reminders on a schedule", "Syncs with your bank feed", "Late fees added automatically"],
  cta: "Start free",
};
export const cardB = {
  headline: "Get paid on time without awkward emails",
  subheadline: "We remind your clients so you don't have to.",
  bullets: ["Friendly reminders on autopilot", "See who has paid at a glance", "Works with any bank"],
  cta: "Try it free",
};

export const questions = {
  attention_check: {
    prompt: "Which of these was mentioned in the description you just saw?",
    options: ["Syncs with your bank feed", "Free pizza on Fridays", "Built-in video calls"],
    correct: "Syncs with your bank feed",
  },
  specialist: false,
};

export function testRow(over: Record<string, unknown> = {}) {
  return {
    id: TEST_ID,
    order_id: ORDER_ID,
    format: "proof",
    card_a: cardA,
    card_b: cardB,
    questions,
    juror_profile: { panel_description: "Freelancers who invoice clients monthly.", business_type: "b2c", screening_questions: [], filters: [] },
    created_at: "2026-10-24T10:00:00.000Z",
    ...over,
  };
}

export function panelRow(over: Record<string, unknown> = {}) {
  return { id: PANEL_ID, order_id: ORDER_ID, test_id: TEST_ID, status: "live", created_at: "2026-10-24T10:05:00.000Z", ...over };
}

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
export const cardAnswers = (n = 16) => ({ what_it_does: words(n), clarity: 6, would_try: 5, confusing: "" });

export function submission(over: Record<string, unknown> = {}, answersOver: Record<string, unknown> = {}) {
  return {
    test_id: TEST_ID,
    sid: "sub_abc123",
    first_card: "B",
    started_at: Date.now() - 120_000,
    answers: {
      cards: { A: cardAnswers(), B: cardAnswers() },
      preferred: "B",
      why: "It is clearer about the outcome I care about.",
      attention_choice: "Syncs with your bank feed",
      ...answersOver,
    },
    ...over,
  };
}
