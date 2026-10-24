// POST /api/juror/submit — stores one juror's answers, returns the Terac completion redirect (CONTRACTS §4).
import { randomUUID } from "node:crypto";
import { db, logEvent } from "@/lib/db";
import { JUROR_MIN_SECONDS, JUROR_MIN_WORDS } from "@/lib/constants";
import { getLatestPanel, getTestRow } from "@/lib/juror";
import { JurorSubmission, Questions } from "@/lib/types";
import { countWords, isDemoSid, isValidSid, teracCallbackUrl } from "@/app/t/rules";

function fail(status: number, code: string, error: string, requestId: string) {
  return Response.json({ ok: false, code, error }, { status, headers: { "x-request-id": requestId } });
}
function ok(body: Record<string, unknown>, requestId: string) {
  return Response.json({ ok: true, ...body }, { headers: { "x-request-id": requestId, "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const now = Date.now();

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail(400, "invalid_json", "Body must be JSON", requestId);
  }
  const parsed = JurorSubmission.safeParse(json);
  if (!parsed.success) {
    return fail(400, "invalid_input", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), requestId);
  }
  const sub = parsed.data;
  const sid = sub.sid.trim();
  if (!isValidSid(sid)) return fail(400, "invalid_sid", "Missing or invalid submission id", requestId);

  const completed = teracCallbackUrl(sid, "completed");

  try {
    // Duplicate first: a juror who re-submits after the panel closed still gets their completion redirect.
    const existing = await db().from("responses").select("id").eq("terac_submission_id", sid).maybeSingle();
    if (existing.error) throw new Error(`responses lookup: ${existing.error.message}`);
    if (existing.data) return ok({ duplicate: true, redirect: completed }, requestId);

    const test = await getTestRow(sub.test_id);
    if (!test) return fail(404, "test_not_found", "This test does not exist", requestId);
    const questions = Questions.safeParse(test.questions);
    if (!questions.success) return fail(500, "test_invalid", "This test is misconfigured", requestId);

    const panel = await getLatestPanel(test.id);
    if (!panel || panel.status !== "live") return fail(409, "test_not_live", "This test is not accepting answers", requestId);

    // Shape must match the test format.
    const hasB = (test.format === "proof" || test.format === "specialist") && test.card_b != null;
    const a = sub.answers;
    if (hasB) {
      if (!a.cards.B) return fail(400, "missing_card_b", "Answers for the second description are required", requestId);
      if (!a.preferred) return fail(400, "missing_preference", "A preference is required", requestId);
    } else {
      if (a.cards.B || a.preferred) return fail(400, "unexpected_card_b", "This test has only one description", requestId);
      if (sub.first_card !== "A") return fail(400, "invalid_first_card", "This test has only one description", requestId);
    }
    if (questions.data.specialist && !a.specialist) {
      return fail(400, "missing_specialist", "Specialist answers are required", requestId);
    }
    if (!questions.data.attention_check.options.includes(a.attention_choice)) {
      return fail(400, "invalid_attention_choice", "Pick one of the listed options", requestId);
    }

    // Server-side word minimum (client enforces the same rule with a live counter).
    for (const key of ["A", "B"] as const) {
      const card = a.cards[key];
      if (card && countWords(card.what_it_does) < JUROR_MIN_WORDS) {
        return fail(400, "too_few_words", `Please describe card ${key} in at least ${JUROR_MIN_WORDS} words`, requestId);
      }
    }

    const attentionPassed = a.attention_choice === questions.data.attention_check.correct;
    const secondsSpent = Math.max(0, Math.min(2_000_000_000, Math.floor((now - sub.started_at) / 1000)));
    const result = attentionPassed && secondsSpent >= JUROR_MIN_SECONDS ? "completed" : "rejected";
    const redirect = teracCallbackUrl(sid, result);

    // Terac's "Run a demo redirect" uses demo_ ids: answer like a real juror but store nothing.
    if (isDemoSid(sid)) return ok({ redirect, demo: true }, requestId);

    const ins = await db().from("responses").insert({
      test_id: test.id,
      panel_id: panel.id,
      terac_submission_id: sid,
      first_card: hasB ? sub.first_card : "A",
      answers: a,
      seconds_spent: secondsSpent,
      attention_passed: attentionPassed,
      decision: null,
    });
    if (ins.error) {
      if (ins.error.code === "23505") return ok({ duplicate: true, redirect: completed }, requestId);
      throw new Error(`responses insert: ${ins.error.message}`);
    }

    try {
      await logEvent({
        order_id: test.order_id,
        actor: "code",
        action: "juror_response_received",
        reasoning: result === "rejected" ? (attentionPassed ? "too fast" : "attention check failed") : null,
        payload: { terac_submission_id: sid, panel_id: panel.id, seconds_spent: secondsSpent, attention_passed: attentionPassed, result },
      });
    } catch (e) {
      console.error(`[juror/submit ${requestId}] logEvent failed`, e);
    }
    return ok({ redirect }, requestId);
  } catch (e) {
    console.error(`[juror/submit ${requestId}]`, e);
    return fail(500, "internal", "Something went wrong saving your answers. Please try again.", requestId);
  }
}
