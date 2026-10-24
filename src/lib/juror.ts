// Server-side juror helpers (CONTRACTS §3 C). Never import from a client component.
import { db } from "@/lib/db";
import { PublicTest, Questions, type TestFormat } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export type TestRow = {
  id: string;
  order_id: string;
  format: TestFormat;
  card_a: unknown;
  card_b: unknown;
  questions: unknown;
};

/** Raw test row incl. the attention answer. Server-only. */
export async function getTestRow(testId: string): Promise<TestRow | null> {
  if (!isUuid(testId)) return null;
  const res = await db()
    .from("tests")
    .select("id, order_id, format, card_a, card_b, questions")
    .eq("id", testId)
    .maybeSingle();
  if (res.error) throw new Error(`getTestRow: ${res.error.message}`);
  return (res.data as TestRow | null) ?? null;
}

/** Latest panel for the test (one live panel per order; a broadened audience creates a newer row). */
export async function getLatestPanel(testId: string): Promise<{ id: string; status: string } | null> {
  const res = await db()
    .from("panels")
    .select("id, status")
    .eq("test_id", testId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) throw new Error(`getLatestPanel: ${res.error.message}`);
  return (res.data as { id: string; status: string } | null) ?? null;
}

/**
 * The test as the juror page may see it: attention-check `correct` is stripped (PublicTest has no
 * such field and Zod drops unknown keys). `live` = latest panel status is 'live'.
 */
export async function getPublicTest(testId: string): Promise<PublicTest | null> {
  const row = await getTestRow(testId);
  if (!row) return null;
  const questions = Questions.safeParse(row.questions);
  if (!questions.success) return null;
  const panel = await getLatestPanel(testId);
  const hasB = (row.format === "proof" || row.format === "specialist") && row.card_b != null;
  const out = PublicTest.safeParse({
    test_id: row.id,
    format: row.format,
    card_a: row.card_a,
    card_b: hasB ? row.card_b : null,
    attention: { prompt: questions.data.attention_check.prompt, options: questions.data.attention_check.options },
    specialist: questions.data.specialist,
    live: panel?.status === "live",
  });
  return out.success ? out.data : null;
}
