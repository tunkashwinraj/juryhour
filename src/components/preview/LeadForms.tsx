"use client";
// Email-capture forms that post to /api/leads and /api/order-lookup (WEBSITE_CONTRACTS §2 C).
// Every field is labelled; status and errors are announced via aria-live.
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { getAttribution, track } from "@/lib/attribution";
import { postJson } from "./client-api";
import { isValidEmail, normalizeUrl, type CtaTier } from "./logic";
import styles from "./preview.module.css";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "done"; message: string } | { kind: "error"; message: string };

function errorMessage(status: number, body: unknown): string {
  const code = (body as { code?: string } | null)?.code;
  if (code === "rate_limited") return "Too many requests from your network today. Please try again tomorrow.";
  if (code === "bad_request") return "Check the fields above and try again.";
  if (status === 0) return "Network error. Check your connection and try again.";
  return "Something went wrong on our side. Please try again.";
}

/** Hidden honeypot field: people never see or fill it; naive bots do. */
function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className={styles.honeypot} aria-hidden="true">
      <label>
        Leave this empty
        <input tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  return (
    <div aria-live="polite" className={styles.statusLine}>
      {status.kind === "done" ? <p className={styles.ok}>{status.message}</p> : null}
      {status.kind === "error" ? (
        <p className={styles.error} role="alert">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}

/** Sales paused: "Join the waitlist". One email when we reopen; nothing else. */
export function WaitlistForm({ tier, intro }: { tier?: CtaTier; intro?: ReactNode } = {}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError(null);
    setStatus({ kind: "busy" });
    const res = await postJson("/api/leads", {
      kind: "waitlist",
      email: email.trim(),
      payload: tier ? { tier } : {},
      src: getAttribution().src ?? null,
      hp,
    });
    if ((res.body as { ok?: boolean } | null)?.ok) {
      track("waitlist_joined", {});
      setStatus({ kind: "done", message: "You're on the list. We'll email you once when we have room for your jury." });
    } else {
      setStatus({ kind: "error", message: errorMessage(res.status, res.body) });
    }
  }

  if (status.kind === "done") return <StatusLine status={status} />;
  return (
    <form className={styles.inlineForm} onSubmit={submit} noValidate>
      {intro ?? <p className={styles.small}>We&apos;re at capacity. Leave your email and we&apos;ll write once when verdicts reopen.</p>}
      <Field id={`${id}-email`} label="Email for the waitlist" error={fieldError}>
        <Input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          aria-invalid={fieldError ? true : undefined}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
      </Field>
      <Honeypot value={hp} onChange={setHp} />
      <Button type="submit" variant="secondary" disabled={status.kind === "busy"}>
        {status.kind === "busy" ? "Joining…" : "Join the waitlist"}
      </Button>
      <StatusLine status={status} />
    </form>
  );
}

/** /contact: "Find my order". Same answer whether or not the email has orders. */
export function OrderLookupForm() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setFieldError("Enter the email you used at checkout.");
      return;
    }
    setFieldError(null);
    setStatus({ kind: "busy" });
    const res = await postJson("/api/order-lookup", { email: email.trim() });
    const body = res.body as { ok?: boolean; message?: string } | null;
    if (body?.ok) {
      setStatus({ kind: "done", message: body.message ?? "If we have orders for that email, we've sent the links." });
    } else {
      setStatus({ kind: "error", message: errorMessage(res.status, res.body) });
    }
  }

  return (
    <form className={styles.inlineForm} onSubmit={submit} noValidate>
      <Field
        id={`${id}-email`}
        label="Email you used at checkout"
        hint="We'll email you links to your order status and reports."
        error={fieldError}
      >
        <Input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          aria-invalid={fieldError ? true : undefined}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={status.kind === "busy"}>
        {status.kind === "busy" ? "Sending…" : "Email me my order links"}
      </Button>
      <StatusLine status={status} />
    </form>
  );
}

/** /for/agencies: "free Verdict on one live client page" offer. Writes a lead row; no marketing email. */
export function AgencyOfferForm() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [agency, setAgency] = useState("");
  const [clientUrl, setClientUrl] = useState("");
  const [note, setNote] = useState("");
  const [hp, setHp] = useState("");
  const [errors, setErrors] = useState<{ email?: string; agency?: string; url?: string }>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!isValidEmail(email)) next.email = "Enter a valid work email.";
    if (agency.trim().length < 2) next.agency = "Enter your agency's name.";
    const u = normalizeUrl(clientUrl);
    if (!u.ok) next.url = u.error;
    setErrors(next);
    if (Object.keys(next).length > 0 || !u.ok) return;
    setStatus({ kind: "busy" });
    const res = await postJson("/api/leads", {
      kind: "agency_offer",
      email: email.trim(),
      payload: { agency: agency.trim(), client_url: u.url, note: note.trim() || null },
      src: getAttribution().src ?? null,
      hp,
    });
    if ((res.body as { ok?: boolean } | null)?.ok) {
      setStatus({ kind: "done", message: "Thanks. We've got your request and will reply by email about your free Verdict." });
    } else {
      setStatus({ kind: "error", message: errorMessage(res.status, res.body) });
    }
  }

  if (status.kind === "done") return <StatusLine status={status} />;
  return (
    <form className={styles.inlineForm} onSubmit={submit} noValidate>
      <Field id={`${id}-agency`} label="Agency name" error={errors.agency}>
        <Input id={`${id}-agency`} autoComplete="organization" value={agency} maxLength={120} aria-invalid={errors.agency ? true : undefined} onChange={(e) => setAgency(e.target.value)} />
      </Field>
      <Field id={`${id}-email`} label="Work email" error={errors.email}>
        <Input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          aria-invalid={errors.email ? true : undefined}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field id={`${id}-url`} label="Live client page to test" hint="A public page you have the client's permission to test." error={errors.url}>
        <Input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          value={clientUrl}
          placeholder="clientproduct.com"
          aria-invalid={errors.url ? true : undefined}
          onChange={(e) => setClientUrl(e.target.value)}
        />
      </Field>
      <Field id={`${id}-note`} label="Anything we should know? (optional)">
        <Textarea id={`${id}-note`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Honeypot value={hp} onChange={setHp} />
      <Button type="submit" disabled={status.kind === "busy"}>
        {status.kind === "busy" ? "Sending…" : "Request my free Verdict"}
      </Button>
      <StatusLine status={status} />
    </form>
  );
}

