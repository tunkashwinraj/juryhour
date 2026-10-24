// Fixtures on top of the fake DB.
import { randomBytes, randomUUID } from "node:crypto";
import type { Answers, Card, JurorProfile, Questions } from "@/lib/types";
import { fake } from "./fakeDb";

type Row = Record<string, unknown>;

export const CARD_A: Card = {
  headline: "Bookkeeping for Etsy sellers",
  subheadline: "Turn your Etsy sales into tax-ready books.",
  bullets: ["Connect your shop in 2 minutes", "Export a tax-ready report in one click", "Plans from $12 per month"],
  cta: "Start free",
};

export const CARD_B: Card = {
  headline: "Tax-ready books from your Etsy sales",
  subheadline: "Connect your shop in 2 minutes and stop doing spreadsheets.",
  bullets: ["Export a tax-ready report in one click", "Built for Etsy sellers", "Plans from $12 per month"],
  cta: "Get tax-ready",
};

export const PROFILE: JurorProfile = {
  panel_description: "US adults who sell handmade goods online and do their own bookkeeping.",
  business_type: "b2c",
  screening_questions: [{ question: "Do you currently sell products online?", options: ["Yes", "No"], accept: ["Yes"] }],
  filters: [],
};

export const QUESTIONS: Questions = {
  attention_check: {
    prompt: "Which of these was mentioned in the description you just saw?",
    options: ["Export a tax-ready report in one click", "Free accountant consultation", "Works with Shopify POS"],
    correct: "Export a tax-ready report in one click",
  },
  specialist: false,
};

export function seedBase(state: Row = {}) {
  fake.reset();
  fake.insert("company_state", {
    id: 1, sales_paused: false, pause_reason: null, terac_balance_usd: 500,
    terac_balance_checked_at: new Date().toISOString(), human_interventions: 0, updated_at: new Date().toISOString(), ...state,
  });
  for (const [tier, base] of [["spark", 11], ["pulse", 49], ["proof", 149], ["launch_pack", 199]] as const) {
    fake.insert("prices", { tier, base_usd: base, current_usd: base, min_usd: base * 0.75, max_usd: base * 1.25, last_changed_at: null });
  }
}

export function seedOrder(over: Row = {}): Row {
  const r = fake.insert("orders", {
    token: randomBytes(32).toString("base64url"),
    mode: "sandbox",
    tier: "proof",
    price_usd: 149,
    email: "buyer@example.com",
    url: "https://ledgerly.example/",
    buyer_desc: "Etsy sellers who do their own taxes",
    ...over,
  });
  if (r.error) throw new Error(r.error.message);
  return r.rows[0];
}

export function seedPaidOrder(over: Row = {}): Row {
  const now = Date.now();
  return seedOrder({
    whop_payment_id: `pay_${randomUUID().slice(0, 8)}`,
    paid_at: new Date(now).toISOString(),
    deadline_at: new Date(now + 8 * 3_600_000).toISOString(),
    ...over,
  });
}

export function seedTest(order: Row, over: Row = {}): Row {
  const format = ({ spark: "spark", pulse: "pulse", proof: "proof", launch_pack: "proof", specialist: "specialist" } as Record<string, string>)[String(order.tier)];
  const r = fake.insert("tests", {
    order_id: order.id,
    card_a: CARD_A,
    card_b: format === "proof" || format === "specialist" ? CARD_B : null,
    format,
    juror_profile: PROFILE,
    questions: QUESTIONS,
    ...over,
  });
  if (r.error) throw new Error(r.error.message);
  return r.rows[0];
}

export function seedPanel(order: Row, test: Row, over: Row = {}): Row {
  const r = fake.insert("panels", {
    order_id: order.id,
    test_id: test.id,
    mode: order.mode,
    terac_feasibility_id: `feas_${randomUUID().slice(0, 6)}`,
    requested_n: 15,
    ...over,
  });
  if (r.error) throw new Error(r.error.message);
  return r.rows[0];
}

export function answers(o: { preferred?: "A" | "B"; whatA?: string; whatB?: string; why?: string; clarityA?: number; clarityB?: number } = {}): Answers {
  return {
    cards: {
      A: {
        what_it_does: o.whatA ?? "It is a bookkeeping tool that takes your Etsy shop sales and turns them into books you can use for taxes.",
        clarity: o.clarityA ?? 5,
        would_try: 4,
        confusing: "Not sure what tax-ready means for my country.",
      },
      B: {
        what_it_does: o.whatB ?? "It connects to your Etsy shop and makes a tax report for you in one click so you skip spreadsheets.",
        clarity: o.clarityB ?? 6,
        would_try: 5,
        confusing: "The price after the first month is unclear.",
      },
    },
    preferred: o.preferred ?? "B",
    why: o.why ?? "The second one told me exactly what I get and that it saves me from spreadsheets.",
    attention_choice: QUESTIONS.attention_check.correct,
  };
}

export function seedResponse(test: Row, panel: Row, over: Row = {}): Row {
  const r = fake.insert("responses", {
    test_id: test.id,
    panel_id: panel.id,
    terac_submission_id: `sub_${randomUUID().slice(0, 8)}`,
    first_card: "A",
    answers: answers(),
    seconds_spent: 240,
    attention_passed: true,
    ...over,
  });
  if (r.error) throw new Error(r.error.message);
  return r.rows[0];
}

export function row(table: string, id: unknown): Row {
  const r = fake.rows(table).find((x) => x.id === id);
  if (!r) throw new Error(`${table} ${String(id)} not found`);
  return r;
}

export const events = (action?: string) => fake.rows("events").filter((e) => !action || e.action === action);
export const ledger = (kind?: string) => fake.rows("ledger").filter((l) => !kind || l.kind === kind);
export const incidents = (kind?: string) => fake.rows("incidents").filter((i) => !kind || i.kind === kind);
