// Email templates: typed pure functions returning { subject, html, text }.
// Vars per template are documented on each function. Every var is untrusted and escaped.
// Honest claims only (SPEC §2.10): "directional signal from N real people", never guarantees.
import { SPECIALIST_QUOTE_TTL_HOURS, TIERS } from "@/lib/constants";
import {
  appLink,
  button,
  EmailVarError,
  escapeHtml,
  link,
  num,
  oneLine,
  p,
  paragraphs,
  plural,
  quoteBlock,
  requireStr,
  safeUrl,
  shell,
  str,
  textShell,
  usd,
  type EmailContext,
  type EmailVars,
  type RenderedEmail,
} from "./layout";

export const EMAIL_TEMPLATES = [
  "paid",
  "delivered",
  "partial",
  "refunded",
  "preview_followup_1",
  "preview_followup_2",
  "quote_ready",
  "support_reply",
  "order_lookup",
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

/** Marketing templates check email_suppressions before sending. */
export const MARKETING_TEMPLATES: ReadonlySet<EmailTemplate> = new Set(["preview_followup_1", "preview_followup_2"]);

type Render = (vars: EmailVars, ctx: EmailContext) => RenderedEmail;

const statusUrl = (ctx: EmailContext, token: string) => appLink(ctx, `/o/${encodeURIComponent(token)}`);
const reportUrl = (ctx: EmailContext, token: string) => appLink(ctx, `/r/${encodeURIComponent(token)}`);

function build(
  ctx: EmailContext,
  marketing: boolean,
  subject: string,
  preheader: string,
  bodyHtml: string,
  textLines: string[],
): RenderedEmail {
  return {
    subject: oneLine(subject, 150),
    html: shell({ ctx, preheader: oneLine(preheader), bodyHtml, marketing }),
    text: textShell(ctx, textLines, marketing),
  };
}

/** vars: token (required), tier?, jurors?, eta? (human-readable, e.g. "about 4 hours") */
const paid: Render = (vars, ctx) => {
  const token = requireStr("paid", vars, "token");
  const url = statusUrl(ctx, token);
  const jurors = num(vars, "jurors");
  const eta = str(vars, "eta");
  const who = jurors ? `${jurors} real ${plural(jurors, "person", "people")}` : "real people";
  const lines = [
    `Payment received. We're recruiting ${who} who match your buyer.`,
    eta ? `Expected verdict: ${oneLine(eta)}.` : "We'll email you when the verdict is ready.",
  ];
  return build(
    ctx,
    false,
    "Your jury is being assembled",
    `Payment received. We're recruiting ${who} who match your buyer.`,
    p("Your jury is being assembled.") + lines.map((l) => p(escapeHtml(l))).join("") + button(url, "Track your order"),
    ["Your jury is being assembled.", "", ...lines, "", `Track your order: ${url}`],
  );
};

/** vars: token (required), verdict (required, headline verdict line), n (approved jurors, required) */
const delivered: Render = (vars, ctx) => {
  const token = requireStr("delivered", vars, "token");
  const verdict = oneLine(requireStr("delivered", vars, "verdict"), 300);
  const n = num(vars, "n");
  if (n === null) throw new EmailVarError("delivered", "n");
  const url = reportUrl(ctx, token);
  const card = appLink(ctx, `/api/og/verdict/${encodeURIComponent(token)}?t=${encodeURIComponent(token)}`);
  const signal = `Directional signal from ${n} real ${plural(n, "person", "people")}.`;
  return build(
    ctx,
    false,
    `Your verdict is ready: ${verdict}`,
    verdict,
    p("Your verdict is ready.") +
      quoteBlock(verdict) +
      p(escapeHtml(signal)) +
      button(url, "Read the full report") +
      `<p style="margin:0 0 16px"><img src="${escapeHtml(card)}" width="520" alt="Verdict share card" style="max-width:100%;height:auto;border:1px solid #e5e5e5;border-radius:6px"></p>` +
      p("The report includes the winning copy and the jurors' own words. You can choose to make the share card public from the report page."),
    [
      "Your verdict is ready.",
      "",
      verdict,
      signal,
      "",
      `Read the full report: ${url}`,
      `Share card: ${card}`,
    ],
  );
};

/** vars: token (required), delivered_n (required), ordered_n (required), refund_usd (required), summary? */
const partial: Render = (vars, ctx) => {
  const token = requireStr("partial", vars, "token");
  const got = num(vars, "delivered_n");
  const ordered = num(vars, "ordered_n");
  const refund = num(vars, "refund_usd");
  if (got === null) throw new EmailVarError("partial", "delivered_n");
  if (ordered === null) throw new EmailVarError("partial", "ordered_n");
  if (refund === null) throw new EmailVarError("partial", "refund_usd");
  const summary = str(vars, "summary");
  const url = reportUrl(ctx, token);
  const lines = [
    `We recruited ${got} of the ${ordered} jurors you ordered before the deadline.`,
    `Your report is based on those ${got} real ${plural(got, "person", "people")}: a directional signal, with a smaller sample than planned.`,
    `We've refunded ${usd(refund)} for the jurors we couldn't deliver. It goes back to your original payment method.`,
  ];
  return build(
    ctx,
    false,
    `Your verdict is ready (${got} of ${ordered} jurors) + ${usd(refund)} refunded`,
    lines[0],
    p("Your verdict is ready, with a partial jury.") +
      lines.map((l) => p(escapeHtml(l))).join("") +
      (summary ? quoteBlock(oneLine(summary, 500)) : "") +
      button(url, "Read the report"),
    ["Your verdict is ready, with a partial jury.", "", ...lines, ...(summary ? ["", oneLine(summary, 500)] : []), "", `Read the report: ${url}`],
  );
};

/** vars: refund_usd (required), token?, reason? (short, plain words) */
const refunded: Render = (vars, ctx) => {
  const refund = num(vars, "refund_usd");
  if (refund === null) throw new EmailVarError("refunded", "refund_usd");
  const token = str(vars, "token");
  const reason = str(vars, "reason");
  const lines = [
    `We've refunded ${usd(refund)} to your original payment method.`,
    ...(reason ? [`Reason: ${oneLine(reason, 300)}`] : []),
    "Refunds usually show up within 5-10 business days, depending on your bank.",
  ];
  const url = token ? statusUrl(ctx, token) : null;
  return build(
    ctx,
    false,
    `Refund issued: ${usd(refund)}`,
    lines[0],
    lines.map((l) => p(escapeHtml(l))).join("") + (url ? p(link(url, "View your order")) : ""),
    [...lines, ...(url ? ["", `View your order: ${url}`] : [])],
  );
};

/**
 * Marketing (+15 min after a free preview). vars: preview_id (required), weak_spots? (count found by
 * the preview), weakest_line?. The count is never invented: without it the subject stays generic.
 */
const previewFollowup1: Render = (vars, ctx) => {
  const previewId = requireStr("preview_followup_1", vars, "preview_id");
  const count = num(vars, "weak_spots");
  const weakest = str(vars, "weakest_line");
  const price = usd(TIERS.spark.price);
  const jurors = TIERS.spark.jurors;
  const url = appLink(ctx, `/?preview=${encodeURIComponent(previewId)}&tier=spark#pricing`);
  const found =
    count && count > 0
      ? `${count} weak ${plural(count, "spot", "spots")} found`
      : "Your preview is ready";
  const subject = `${found} — real humans can confirm for ${price}`;
  const pitch = `Our AI read is a guess. For ${price}, ${jurors} real people who match your buyer give their first impression of your headline: a directional signal from humans before you spend on ads.`;
  return build(
    ctx,
    true,
    subject,
    pitch,
    p(escapeHtml(`${found} in your free preview.`)) +
      (weakest ? p("The weakest line we spotted:") + quoteBlock(oneLine(weakest, 300)) : "") +
      p(escapeHtml(pitch)) +
      button(url, `Get a real verdict for ${price}`),
    [
      `${found} in your free preview.`,
      ...(weakest ? ["", "The weakest line we spotted:", `> ${oneLine(weakest, 300)}`] : []),
      "",
      pitch,
      "",
      `Get a real verdict for ${price}: ${url}`,
    ],
  );
};

/** Marketing (+24h after a free preview, last follow-up). vars: preview_id (required) */
const previewFollowup2: Render = (vars, ctx) => {
  const previewId = requireStr("preview_followup_2", vars, "preview_id");
  const t = TIERS.pulse;
  const price = usd(t.price);
  const url = appLink(ctx, `/?preview=${encodeURIComponent(previewId)}&tier=pulse#pricing`);
  const lines = [
    `Before you send traffic to your page, have ${t.jurors} real people who match your buyer react to it.`,
    `Pulse (${price}): a ${t.minutes}-minute reaction from each juror, a full report built on their own words, and a suggested rewrite (not tested on the jury).`,
    "It's research, a directional signal from real people, not a promise of sales.",
    "This is our last email about your preview.",
  ];
  return build(
    ctx,
    true,
    `${t.jurors} real people, one honest read of your page (${price})`,
    lines[0],
    lines.map((l) => p(escapeHtml(l))).join("") + button(url, `Get Pulse for ${price}`),
    [...lines, "", `Get Pulse for ${price}: ${url}`],
  );
};

/** vars: token (required), price_usd (required), purchase_url (required, Whop https link), expires_at? (ISO) */
const quoteReady: Render = (vars, ctx) => {
  const token = requireStr("quote_ready", vars, "token");
  const price = num(vars, "price_usd");
  if (price === null) throw new EmailVarError("quote_ready", "price_usd");
  const purchaseUrl = safeUrl(requireStr("quote_ready", vars, "purchase_url"));
  if (!purchaseUrl) throw new EmailVarError("quote_ready", "purchase_url");
  const expiresRaw = str(vars, "expires_at");
  const expires = expiresRaw && !Number.isNaN(Date.parse(expiresRaw)) ? new Date(expiresRaw) : null;
  const expiry = expires
    ? `This quote expires ${expires.toUTCString().replace(/:\d\d GMT$/, " UTC")}.`
    : `This quote expires in ${SPECIALIST_QUOTE_TTL_HOURS} hours.`;
  const jurors = TIERS.specialist.jurors;
  const lines = [
    `Your Specialist Jury is priced at ${usd(price)}: ${jurors} verified professionals who match your buyer, in the Proof A/B format with your own questions.`,
    expiry,
  ];
  return build(
    ctx,
    false,
    `Your Specialist Jury quote: ${usd(price)}`,
    lines[0],
    lines.map((l) => p(escapeHtml(l))).join("") +
      button(purchaseUrl, `Pay ${usd(price)} and start`) +
      p(link(statusUrl(ctx, token), "View your quote")),
    [...lines, "", `Pay and start: ${purchaseUrl}`, `View your quote: ${statusUrl(ctx, token)}`],
  );
};

/** vars: body (required, plain text reply), subject?, token? */
const supportReply: Render = (vars, ctx) => {
  const body = requireStr("support_reply", vars, "body").replace(/\r\n/g, "\n").slice(0, 10_000);
  const subj = str(vars, "subject");
  const token = str(vars, "token");
  const url = token ? statusUrl(ctx, token) : null;
  return build(
    ctx,
    false,
    subj ? `Re: ${oneLine(subj, 120)}` : "Re: your JuryHour order",
    oneLine(body, 120),
    paragraphs(body) + (url ? p(link(url, "View your order")) : ""),
    [body.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ""), ...(url ? ["", `View your order: ${url}`] : [])],
  );
};

// ---------- order_lookup (Agent C: /api/order-lookup) ----------

const LOOKUP_STAGE_LABEL: Record<string, string> = {
  CREATED: "Waiting for payment",
  PAID: "Paid, jury being assembled",
  RESEARCHING: "In progress",
  QUOTING: "In progress",
  PANEL_LIVE: "Jury at work",
  GRADING: "In progress",
  SYNTHESIZING: "Writing your report",
  DELIVERED: "Verdict delivered",
  PARTIAL: "Verdict delivered (partial jury)",
  REFUNDED: "Refunded",
  FAILED: "Needs attention",
  BLOCKED: "Needs attention",
};

type LookupOrder = { token: string; tier: string; stage: string; created_at: string | null };

function parseLookupOrders(raw: string): LookupOrder[] {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new EmailVarError("order_lookup", "orders");
  }
  if (!Array.isArray(v)) throw new EmailVarError("order_lookup", "orders");
  const out: LookupOrder[] = [];
  for (const o of v.slice(0, 20)) {
    const r = (o ?? {}) as Record<string, unknown>;
    if (typeof r.token !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(r.token)) continue;
    out.push({
      token: r.token,
      tier: typeof r.tier === "string" ? r.tier : "",
      stage: typeof r.stage === "string" ? r.stage : "",
      created_at: typeof r.created_at === "string" ? r.created_at : null,
    });
  }
  if (out.length === 0) throw new EmailVarError("order_lookup", "orders");
  return out;
}

/**
 * Transactional (requested by the recipient on /contact). vars: orders (required, JSON array of
 * {token, tier, stage, created_at}). Links each order's status page, and its report once delivered.
 */
const orderLookup: Render = (vars, ctx) => {
  const orders = parseLookupOrders(requireStr("order_lookup", vars, "orders"));
  const rows = orders.map((o) => {
    const name = tierDisplayName(o.tier);
    const date = o.created_at && !Number.isNaN(Date.parse(o.created_at)) ? new Date(o.created_at).toUTCString().slice(5, 16) : null;
    const status = o.tier === "specialist" && o.stage === "CREATED" ? "Quote requested" : LOOKUP_STAGE_LABEL[o.stage] ?? "In progress";
    const delivered = o.stage === "DELIVERED" || o.stage === "PARTIAL";
    return {
      label: oneLine(`${name}${date ? ` · ${date}` : ""} · ${status}`, 160),
      status: statusUrl(ctx, o.token),
      report: delivered ? reportUrl(ctx, o.token) : null,
    };
  });
  const intro = `You asked for links to your JuryHour ${plural(rows.length, "order", "orders")}. Here ${plural(rows.length, "it is", "they are")}:`;
  const html =
    p(escapeHtml(intro)) +
    rows
      .map((r) => p(`${escapeHtml(r.label)}<br>${link(r.status, "Order status")}${r.report ? ` · ${link(r.report, "Read the report")}` : ""}`))
      .join("") +
    p("These links are private to you. Anyone with a link can see that order, so please don't share them.") +
    p("If you didn't ask for this email, you can ignore it.");
  const text = [
    intro,
    "",
    ...rows.flatMap((r) => [r.label, `Order status: ${r.status}`, ...(r.report ? [`Report: ${r.report}`] : []), ""]),
    "These links are private to you. Anyone with a link can see that order, so please don't share them.",
    "If you didn't ask for this email, you can ignore it.",
  ];
  return build(ctx, false, "Your JuryHour order links", intro, html, text);
};

function tierDisplayName(tier: string): string {
  const names: Record<string, string> = {
    spark: "Spark",
    pulse: "Pulse",
    proof: "Proof",
    launch_pack: "Launch Pack",
    specialist: "Specialist Jury",
  };
  return names[tier] ?? "Order";
}

export const TEMPLATES: Record<EmailTemplate, Render> = {
  paid,
  delivered,
  partial,
  refunded,
  preview_followup_1: previewFollowup1,
  preview_followup_2: previewFollowup2,
  quote_ready: quoteReady,
  support_reply: supportReply,
  order_lookup: orderLookup,
};

export function renderEmail(template: EmailTemplate, vars: EmailVars, ctx: EmailContext): RenderedEmail {
  const render = TEMPLATES[template];
  if (!render) throw new Error(`unknown email template "${template}"`);
  return render(vars, ctx);
}
