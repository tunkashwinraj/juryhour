// Shared building blocks for transactional/marketing emails: escaping, safe links and the
// plain HTML + text shell. No dependencies; every interpolated value is treated as untrusted.

export type EmailVars = Record<string, string | number | null | undefined>;

export type RenderedEmail = { subject: string; html: string; text: string };

/** Context the sender supplies to every template (absolute URLs only; never hardcode the host). */
export type EmailContext = { appUrl: string; unsubscribeUrl: string };

export const FOOTER_LINE = "Research, not a sales guarantee.";

export class EmailVarError extends Error {
  constructor(template: string, name: string) {
    super(`email template "${template}" is missing required var "${name}"`);
    this.name = "EmailVarError";
  }
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

/** Escapes text for HTML element content and double-quoted attribute values (we never emit unquoted ones). */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"'`]/g, (c) => HTML_ESCAPES[c]);
}

/** Subjects and plain-text bodies: strip control chars/newlines (no header injection). */
export function oneLine(value: unknown, max = 200): string {
  const s = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Reads an optional string var (numbers are stringified, blanks become null). */
export function str(vars: EmailVars, name: string): string | null {
  const v = vars[name];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function requireStr(template: string, vars: EmailVars, name: string): string {
  const v = str(vars, name);
  if (v === null) throw new EmailVarError(template, name);
  return v;
}

/** Reads a finite number var (accepts numeric strings). */
export function num(vars: EmailVars, name: string): number | null {
  const v = vars[name];
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function usd(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Accepts only absolute http(s) URLs; anything else (javascript:, data:, relative) → null. */
export function safeUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Absolute URL on our own app for a path; path segments must already be encoded. */
export function appLink(ctx: EmailContext, path: string): string {
  return `${ctx.appUrl.replace(/\/+$/, "")}${path}`;
}

// ---------- HTML shell ----------

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function p(innerHtml: string): string {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1a1a1a">${innerHtml}</p>`;
}

export function button(href: string, label: string): string {
  return (
    `<p style="margin:24px 0"><a href="${escapeHtml(href)}" ` +
    `style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;` +
    `padding:12px 20px;border-radius:6px;font-weight:600;font-size:16px">${escapeHtml(label)}</a></p>`
  );
}

export function link(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="color:#1a1a1a">${escapeHtml(label)}</a>`;
}

export function quoteBlock(text: string): string {
  return (
    `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #1a1a1a;` +
    `background:#f5f5f5;font-size:16px;line-height:1.5;color:#1a1a1a">${escapeHtml(text)}</blockquote>`
  );
}

/** Multi-line untrusted text → escaped paragraphs. */
export function paragraphs(text: string): string {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => p(escapeHtml(para).replace(/\r?\n/g, "<br>")))
    .join("");
}

export function shell(opts: {
  ctx: EmailContext;
  preheader: string;
  bodyHtml: string;
  marketing: boolean;
}): string {
  const unsubLabel = opts.marketing ? "Unsubscribe" : "Unsubscribe from JuryHour marketing emails";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JuryHour</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="margin:0 0 24px;font-size:14px;font-weight:700;letter-spacing:.04em;color:#1a1a1a">JURYHOUR</p>
${opts.bodyHtml}
<hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px">
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#666666">${escapeHtml(FOOTER_LINE)}</p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#666666">${link(opts.ctx.unsubscribeUrl, unsubLabel)}</p>
</div>
</body></html>`;
}

export function textShell(ctx: EmailContext, lines: string[], marketing: boolean): string {
  const unsub = marketing ? "Unsubscribe" : "Unsubscribe from JuryHour marketing emails";
  return [...lines, "", "--", FOOTER_LINE, `${unsub}: ${ctx.unsubscribeUrl}`].join("\n");
}
