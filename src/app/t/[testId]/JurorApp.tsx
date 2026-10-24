"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CARD_REVEAL_SECONDS, JUROR_MIN_WORDS } from "@/lib/constants";
import type { Answers, Card, CardAnswers, PublicTest } from "@/lib/types";
import { countWords, shuffle } from "../rules";
import styles from "./juror.module.css";

type Letter = "A" | "B";
type CardDraft = { what_it_does: string; clarity: number | null; would_try: number | null; confusing: string };
type SpecialistDraft = {
  would_buy: "yes" | "no" | "maybe" | null;
  would_buy_why: string;
  objections: string;
  price_reaction: "low" | "fair" | "high" | null;
  expected_price: string;
  your_words: string;
};
type Draft = {
  cards: Record<Letter, CardDraft>;
  preferred: Letter | null;
  why: string;
  attention_choice: string | null;
  specialist: SpecialistDraft;
};

type ErrorReason = "missing_sid" | "not_found" | "not_live" | "load_failed";
type Phase =
  | { kind: "loading" }
  | { kind: "error"; reason: ErrorReason }
  | { kind: "consent" }
  | { kind: "reveal"; idx: 0 | 1 }
  | { kind: "ready"; idx: 1 }
  | { kind: "questions"; idx: 0 | 1 }
  | { kind: "preference" }
  | { kind: "attention" }
  | { kind: "specialist" }
  | { kind: "submitting" }
  | { kind: "done"; duplicate: boolean };

type Session = {
  firstCard: Letter;
  startedAt: number;
  attentionOrder: string[];
  draft: Draft;
  phase: Phase;
};

const emptyCard = (): CardDraft => ({ what_it_does: "", clarity: null, would_try: null, confusing: "" });
const emptyDraft = (): Draft => ({
  cards: { A: emptyCard(), B: emptyCard() },
  preferred: null,
  why: "",
  attention_choice: null,
  specialist: { would_buy: null, would_buy_why: "", objections: "", price_reaction: null, expected_price: "", your_words: "" },
});

const ERRORS: Record<ErrorReason, { title: string; body: string }> = {
  missing_sid: {
    title: "This link is missing your task ID",
    body: "Please go back to Terac and open the task again from there, so we can credit your work.",
  },
  not_found: { title: "We couldn't find this task", body: "Please check the link or go back to Terac and open the task again." },
  not_live: {
    title: "This task is closed",
    body: "It is no longer accepting answers. Thanks for your interest. Please go back to Terac for other tasks.",
  },
  load_failed: { title: "Something went wrong", body: "We couldn't load this task. Please check your connection and reload the page." },
};

function storageKey(testId: string, sid: string) {
  return `juror:${testId}:${sid}`;
}
function loadSession(key: string): Session | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function saveSession(key: string, s: Session) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(s));
  } catch {
    /* private mode etc. — progress just isn't kept across reloads */
  }
}

/** On reload never show a card again, and never resume mid-submit. */
function resumablePhase(p: Phase, hasB: boolean, specialist: boolean): Phase {
  if (p.kind === "reveal") return { kind: "questions", idx: p.idx };
  if (p.kind === "submitting" || p.kind === "done") return specialist ? { kind: "specialist" } : { kind: "attention" };
  if (p.kind === "loading" || p.kind === "error") return { kind: "consent" };
  if ((p.kind === "ready" || p.kind === "preference") && !hasB) return { kind: "attention" };
  return p;
}

export default function JurorApp({ testId, sid }: { testId: string; sid: string | null }) {
  const [test, setTest] = useState<PublicTest | null>(null);
  const [phase, setPhase] = useState<Phase>(sid ? { kind: "loading" } : { kind: "error", reason: "missing_sid" });
  const [firstCard, setFirstCard] = useState<Letter>("A");
  const [startedAt, setStartedAt] = useState<number>(0);
  const [attentionOrder, setAttentionOrder] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const restored = useRef(false);

  // Load the test (client-side so it is always fresh) and restore progress for this sid.
  useEffect(() => {
    if (!sid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/juror/test/${encodeURIComponent(testId)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) return setPhase({ kind: "error", reason: "not_found" });
        if (!res.ok) return setPhase({ kind: "error", reason: "load_failed" });
        const t = (await res.json()) as PublicTest;
        if (cancelled) return;
        setTest(t);
        if (!t.live) return setPhase({ kind: "error", reason: "not_live" });
        const saved = loadSession(storageKey(testId, sid));
        if (saved && saved.startedAt > 0) {
          setFirstCard(saved.firstCard);
          setStartedAt(saved.startedAt);
          setAttentionOrder(saved.attentionOrder);
          setDraft(saved.draft);
          setPhase(resumablePhase(saved.phase, !!t.card_b, t.specialist));
        } else {
          setAttentionOrder(shuffle(t.attention.options));
          setPhase({ kind: "consent" });
        }
        restored.current = true;
      } catch {
        if (!cancelled) setPhase({ kind: "error", reason: "load_failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [testId, sid]);

  // Persist progress (after consent) so a reload keeps the same card order and timer.
  useEffect(() => {
    if (!sid || !restored.current || startedAt === 0) return;
    if (phase.kind === "done" || phase.kind === "submitting") return;
    saveSession(storageKey(testId, sid), { firstCard, startedAt, attentionOrder, draft, phase });
  }, [testId, sid, firstCard, startedAt, attentionOrder, draft, phase]);

  // Hide the card after exactly CARD_REVEAL_SECONDS.
  useEffect(() => {
    if (phase.kind !== "reveal") return;
    const idx = phase.idx;
    const timer = window.setTimeout(() => setPhase({ kind: "questions", idx }), CARD_REVEAL_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Scroll to top on every step change (phones).
  useEffect(() => {
    window.scrollTo?.({ top: 0 });
  }, [phase.kind]);

  const hasB = !!test?.card_b;
  const specialist = !!test?.specialist;
  const order: Letter[] = hasB ? [firstCard, firstCard === "A" ? "B" : "A"] : ["A"];
  const cardFor = (l: Letter): Card | null => (l === "A" ? test?.card_a ?? null : test?.card_b ?? null);

  const setCard = (l: Letter, patch: Partial<CardDraft>) =>
    setDraft((d) => ({ ...d, cards: { ...d.cards, [l]: { ...d.cards[l], ...patch } } }));
  const setSpec = (patch: Partial<SpecialistDraft>) => setDraft((d) => ({ ...d, specialist: { ...d.specialist, ...patch } }));

  const start = () => {
    setFirstCard(hasB && Math.random() < 0.5 ? "B" : "A");
    setStartedAt(Date.now());
    restored.current = true;
    setPhase({ kind: "reveal", idx: 0 });
  };

  const afterQuestions = (idx: 0 | 1) => {
    if (idx === 0 && hasB) setPhase({ kind: "ready", idx: 1 });
    else if (hasB) setPhase({ kind: "preference" });
    else setPhase({ kind: "attention" });
  };

  const submit = useCallback(async () => {
    if (!test || !sid) return;
    setSubmitError(null);
    setPhase({ kind: "submitting" });
    const toCard = (c: CardDraft): CardAnswers => ({
      what_it_does: c.what_it_does.trim(),
      clarity: c.clarity ?? 0,
      would_try: c.would_try ?? 0,
      confusing: c.confusing.trim(),
    });
    const s = draft.specialist;
    const answers: Answers = {
      cards: hasB ? { A: toCard(draft.cards.A), B: toCard(draft.cards.B) } : { A: toCard(draft.cards.A) },
      ...(hasB ? { preferred: draft.preferred ?? undefined, why: draft.why.trim() } : {}),
      attention_choice: draft.attention_choice ?? "",
      ...(specialist && s.would_buy && s.price_reaction
        ? {
            specialist: {
              would_buy: s.would_buy,
              would_buy_why: s.would_buy_why.trim(),
              objections: s.objections.trim(),
              price_reaction: s.price_reaction,
              expected_price: s.expected_price.trim().slice(0, 100),
              your_words: s.your_words.trim(),
            },
          }
        : {}),
    };
    try {
      const res = await fetch("/api/juror/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_id: test.test_id, sid, first_card: hasB ? firstCard : "A", started_at: startedAt, answers }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; redirect: string; duplicate?: boolean }
        | { ok: false; code: string; error: string }
        | null;
      if (body && body.ok) {
        try {
          window.sessionStorage.removeItem(storageKey(testId, sid));
        } catch {
          /* ignore */
        }
        if (body.duplicate) {
          setPhase({ kind: "done", duplicate: true });
          window.setTimeout(() => window.location.assign(body.redirect), 2000);
        } else {
          setPhase({ kind: "done", duplicate: false });
          window.location.assign(body.redirect);
        }
        return;
      }
      if (body && !body.ok && body.code === "test_not_live") return setPhase({ kind: "error", reason: "not_live" });
      setSubmitError(body && !body.ok ? body.error : "We couldn't save your answers. Please try again.");
      setPhase(specialist ? { kind: "specialist" } : { kind: "attention" });
    } catch {
      setSubmitError("Network problem. Please check your connection and try again.");
      setPhase(specialist ? { kind: "specialist" } : { kind: "attention" });
    }
  }, [test, sid, draft, hasB, specialist, firstCard, startedAt, testId]);

  // ------------------------------------------------------------------ render

  if (phase.kind === "loading") return <p className={styles.muted} role="status">Loading…</p>;

  if (phase.kind === "error") {
    const e = ERRORS[phase.reason];
    return (
      <section className={styles.panel} data-testid="juror-error" data-reason={phase.reason}>
        <h1 className={styles.title}>{e.title}</h1>
        <p className={styles.body}>{e.body}</p>
      </section>
    );
  }

  if (!test) return null;

  const totalSteps = (hasB ? 2 : 1) + (hasB ? 1 : 0) + 1 + (specialist ? 1 : 0);
  const stepNo = (() => {
    switch (phase.kind) {
      case "reveal":
      case "questions":
        return phase.idx + 1;
      case "ready":
        return 2;
      case "preference":
        return 3;
      case "attention":
        return hasB ? 4 : 2;
      case "specialist":
      case "submitting":
      case "done":
        return totalSteps;
      default:
        return 0;
    }
  })();

  return (
    <div className={styles.flow}>
      {stepNo > 0 && (
        <div className={styles.progress} aria-label={`Step ${stepNo} of ${totalSteps}`}>
          <div className={styles.progressBar} style={{ width: `${(stepNo / totalSteps) * 100}%` }} />
        </div>
      )}

      {phase.kind === "consent" && (
        <section className={styles.panel} data-testid="consent">
          <h1 className={styles.title}>Your honest first impression</h1>
          <p className={styles.body}>
            You&apos;ll see a short product description for <strong>{CARD_REVEAL_SECONDS} seconds</strong>
            {hasB ? ", answer a few questions, then see a second one" : ", then answer a few questions"}. Write in your
            own words; there are no right or wrong answers.
          </p>
          <ul className={styles.notes}>
            <li>Takes about {hasB ? (specialist ? 10 : 8) : 3} minutes.</li>
            <li>Your answers are anonymous. We never ask for your name or email.</li>
            <li>Please answer yourself; don&apos;t use AI tools.</li>
          </ul>
          <p className={styles.small}>
            By continuing you agree that your anonymous answers may be shared with the company that made this product.
          </p>
          <button type="button" className={styles.primary} onClick={start} data-testid="start">
            I agree, show me the description
          </button>
        </section>
      )}

      {phase.kind === "ready" && (
        <section className={styles.panel} data-testid="ready">
          <h1 className={styles.title}>Next: a second description</h1>
          <p className={styles.body}>
            It will show for {CARD_REVEAL_SECONDS} seconds, then you&apos;ll answer the same questions about it.
          </p>
          <button type="button" className={styles.primary} onClick={() => setPhase({ kind: "reveal", idx: 1 })} data-testid="show-second">
            Show the second description
          </button>
        </section>
      )}

      {phase.kind === "reveal" && (
        <RevealCard
          card={cardFor(order[phase.idx])!}
          label={hasB ? `Description ${phase.idx + 1} of 2` : "The description"}
          letter={order[phase.idx]}
        />
      )}

      {phase.kind === "questions" && (
        <CardQuestions
          key={phase.idx}
          label={hasB ? `About description ${phase.idx + 1}` : "About the description"}
          value={draft.cards[order[phase.idx]]}
          onChange={(p) => setCard(order[phase.idx], p)}
          onNext={() => afterQuestions(phase.idx)}
        />
      )}

      {phase.kind === "preference" && (
        <section className={styles.panel} data-testid="preference">
          <h1 className={styles.title}>Which one interested you more?</h1>
          <Choice
            name="preferred"
            options={[
              { value: order[0], label: "The first description" },
              { value: order[1], label: "The second description" },
            ]}
            value={draft.preferred}
            onChange={(v) => setDraft((d) => ({ ...d, preferred: v as Letter }))}
          />
          <TextField
            id="why"
            label="Why?"
            value={draft.why}
            onChange={(v) => setDraft((d) => ({ ...d, why: v }))}
            rows={3}
          />
          <button
            type="button"
            className={styles.primary}
            disabled={!draft.preferred || countWords(draft.why) < 1}
            onClick={() => setPhase({ kind: "attention" })}
            data-testid="next"
          >
            Next
          </button>
        </section>
      )}

      {phase.kind === "attention" && (
        <section className={styles.panel} data-testid="attention">
          <h1 className={styles.title}>{test.attention.prompt}</h1>
          <Choice
            name="attention"
            options={attentionOrder.map((o) => ({ value: o, label: o }))}
            value={draft.attention_choice}
            onChange={(v) => setDraft((d) => ({ ...d, attention_choice: v }))}
            stacked
          />
          {submitError && !specialist && <p className={styles.error} role="alert">{submitError}</p>}
          {specialist ? (
            <button type="button" className={styles.primary} disabled={!draft.attention_choice} onClick={() => setPhase({ kind: "specialist" })} data-testid="next">
              Next
            </button>
          ) : (
            <button type="button" className={styles.primary} disabled={!draft.attention_choice} onClick={submit} data-testid="submit">
              Submit my answers
            </button>
          )}
        </section>
      )}

      {phase.kind === "specialist" && (
        <section className={styles.panel} data-testid="specialist">
          <h1 className={styles.title}>A few last questions</h1>
          <fieldset className={styles.fieldset}>
            <legend className={styles.label}>Would you buy something like this?</legend>
            <Choice
              name="would_buy"
              options={[
                { value: "yes", label: "Yes" },
                { value: "maybe", label: "Maybe" },
                { value: "no", label: "No" },
              ]}
              value={draft.specialist.would_buy}
              onChange={(v) => setSpec({ would_buy: v as SpecialistDraft["would_buy"] })}
              inline
            />
          </fieldset>
          <TextField id="would_buy_why" label="Why or why not?" value={draft.specialist.would_buy_why} onChange={(v) => setSpec({ would_buy_why: v })} rows={3} />
          <TextField id="objections" label="What would stop you from buying it?" value={draft.specialist.objections} onChange={(v) => setSpec({ objections: v })} rows={3} />
          <fieldset className={styles.fieldset}>
            <legend className={styles.label}>For what it offers, would you expect the price to feel…</legend>
            <Choice
              name="price_reaction"
              options={[
                { value: "low", label: "Low" },
                { value: "fair", label: "Fair" },
                { value: "high", label: "High" },
              ]}
              value={draft.specialist.price_reaction}
              onChange={(v) => setSpec({ price_reaction: v as SpecialistDraft["price_reaction"] })}
              inline
            />
          </fieldset>
          <TextField id="expected_price" label="What would you expect to pay? (optional)" value={draft.specialist.expected_price} onChange={(v) => setSpec({ expected_price: v.slice(0, 100) })} rows={1} />
          <TextField
            id="your_words"
            label="In your own words, describe the problem this is trying to solve."
            value={draft.specialist.your_words}
            onChange={(v) => setSpec({ your_words: v })}
            rows={4}
          />
          {submitError && <p className={styles.error} role="alert">{submitError}</p>}
          <button
            type="button"
            className={styles.primary}
            disabled={!draft.specialist.would_buy || !draft.specialist.price_reaction || countWords(draft.specialist.your_words) < 1}
            onClick={submit}
            data-testid="submit"
          >
            Submit my answers
          </button>
        </section>
      )}

      {phase.kind === "submitting" && (
        <section className={styles.panel} role="status">
          <p className={styles.body}>Saving your answers…</p>
        </section>
      )}

      {phase.kind === "done" && (
        <section className={styles.panel} role="status" data-testid={phase.duplicate ? "already-submitted" : "done"}>
          <h1 className={styles.title}>{phase.duplicate ? "You've already submitted this task" : "Thank you!"}</h1>
          <p className={styles.body}>Taking you back to Terac…</p>
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function RevealCard({ card, label, letter }: { card: Card; label: string; letter: Letter }) {
  return (
    <section className={styles.revealWrap} aria-live="polite" data-testid="card" data-card={letter}>
      <p className={styles.eyebrow}>{label}</p>
      <div className={styles.timer} aria-hidden="true">
        <div className={styles.timerBar} style={{ animationDuration: `${CARD_REVEAL_SECONDS}s` }} />
      </div>
      <article className={styles.card}>
        <h2 className={styles.cardHeadline} data-testid="card-headline">{card.headline}</h2>
        <p className={styles.cardSub}>{card.subheadline}</p>
        <ul className={styles.cardBullets}>
          {card.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
        <span className={styles.cardCta}>{card.cta}</span>
      </article>
      <p className={styles.small}>This will disappear after {CARD_REVEAL_SECONDS} seconds.</p>
    </section>
  );
}

function CardQuestions({
  label,
  value,
  onChange,
  onNext,
}: {
  label: string;
  value: CardDraft;
  onChange: (p: Partial<CardDraft>) => void;
  onNext: () => void;
}) {
  const words = countWords(value.what_it_does);
  const enough = words >= JUROR_MIN_WORDS;
  const complete = enough && value.clarity != null && value.would_try != null;
  return (
    <section className={styles.panel} data-testid="questions">
      <p className={styles.eyebrow}>{label}</p>
      <div className={styles.field}>
        <label htmlFor="what_it_does" className={styles.label}>
          In your own words, what does this product do, and who is it for?
        </label>
        <textarea
          id="what_it_does"
          className={styles.textarea}
          rows={5}
          value={value.what_it_does}
          onChange={(e) => onChange({ what_it_does: e.target.value })}
          aria-describedby="what_it_does_count"
          data-testid="what_it_does"
        />
        <p
          id="what_it_does_count"
          className={enough ? styles.countOk : styles.count}
          aria-live="polite"
          data-testid="word-count"
        >
          {words} / {JUROR_MIN_WORDS} words{enough ? " ✓" : ` (at least ${JUROR_MIN_WORDS})`}
        </p>
      </div>
      <Scale
        name="clarity"
        question="How clear was it?"
        low="Not clear at all"
        high="Very clear"
        value={value.clarity}
        onChange={(v) => onChange({ clarity: v })}
      />
      <Scale
        name="would_try"
        question="How likely would you be to try it?"
        low="Not at all likely"
        high="Very likely"
        value={value.would_try}
        onChange={(v) => onChange({ would_try: v })}
      />
      <TextField
        id="confusing"
        label="Was anything confusing or unclear? (optional)"
        value={value.confusing}
        onChange={(v) => onChange({ confusing: v })}
        rows={3}
      />
      <button type="button" className={styles.primary} disabled={!complete} onClick={onNext} data-testid="next">
        Next
      </button>
    </section>
  );
}

function Scale({
  name,
  question,
  low,
  high,
  value,
  onChange,
}: {
  name: string;
  question: string;
  low: string;
  high: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset className={styles.fieldset} data-testid={`scale-${name}`}>
      <legend className={styles.label}>{question}</legend>
      <div className={styles.scale}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <label key={n} className={value === n ? styles.scaleOptOn : styles.scaleOpt}>
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className={styles.srOnly}
              aria-label={`${n}${n === 1 ? ` (${low})` : n === 7 ? ` (${high})` : ""}`}
            />
            <span aria-hidden="true">{n}</span>
          </label>
        ))}
      </div>
      <div className={styles.scaleEnds} aria-hidden="true">
        <span>1 = {low}</span>
        <span>7 = {high}</span>
      </div>
    </fieldset>
  );
}

function Choice({
  name,
  options,
  value,
  onChange,
  stacked,
  inline,
}: {
  name: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
  stacked?: boolean;
  inline?: boolean;
}) {
  return (
    <div className={inline ? styles.choiceInline : styles.choiceStack} role="radiogroup" data-testid={`choice-${name}`} data-stacked={stacked ? "1" : undefined}>
      {options.map((o) => (
        <label key={o.value} className={value === o.value ? styles.choiceOn : styles.choiceOpt}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className={styles.srOnly} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  rows,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {rows <= 1 ? (
        <input id={id} className={styles.input} value={value} onChange={(e) => onChange(e.target.value)} data-testid={id} />
      ) : (
        <textarea id={id} className={styles.textarea} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} data-testid={id} />
      )}
    </div>
  );
}
