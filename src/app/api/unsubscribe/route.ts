// GET  /api/unsubscribe?e=&s=  → verify HMAC link, suppress marketing email, small HTML page.
// POST /api/unsubscribe?e=&s=  → RFC 8058 one-click unsubscribe (mail clients POST
//                                "List-Unsubscribe=One-Click" to the List-Unsubscribe URL).
import { suppressEmail, verifyUnsubscribe } from "@/lib/email";
import { escapeHtml, FOOTER_LINE } from "@/emails/layout";

function page(status: number, title: string, message: string): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)} · JuryHour</title></head>
<body style="margin:0;background:#ffffff;color:#14213d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<main style="max-width:480px;margin:0 auto;padding:48px 16px">
<p style="margin:0 0 28px"><img src="/brand/svg/juryhour-horizontal-fullcolor.svg" width="139" height="24" alt="JuryHour" style="display:block;border:0"></p>
<h1 style="font-size:24px;line-height:1.3;margin:0 0 12px">${escapeHtml(title)}</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 32px">${escapeHtml(message)}</p>
<p style="font-size:13px;color:#666666;margin:0">${escapeHtml(FOOTER_LINE)}</p>
</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function handle(req: Request, method: "GET" | "POST"): Promise<Response> {
  const url = new URL(req.url); // request data first: keeps this handler dynamic under Cache Components
  const requestId = crypto.randomUUID();
  const email = verifyUnsubscribe(url.searchParams.get("e"), url.searchParams.get("s"));
  if (!email) {
    console.info(`[unsubscribe] ${requestId} ${method} bad_signature`);
    if (method === "POST") {
      return Response.json({ ok: false, code: "bad_signature", error: "Invalid unsubscribe link" }, { status: 400 });
    }
    return page(400, "This link isn't valid", "The unsubscribe link is incomplete or was changed. Use the link from the latest email we sent you.");
  }
  try {
    await suppressEmail(email);
  } catch (err) {
    console.error(`[unsubscribe] ${requestId} ${method} db_error: ${err instanceof Error ? err.message : String(err)}`);
    if (method === "POST") {
      return Response.json({ ok: false, code: "db_error", error: "Could not unsubscribe right now" }, { status: 500 });
    }
    return page(500, "Something went wrong", "We couldn't save your request. Please try the link again in a minute.");
  }
  console.info(`[unsubscribe] ${requestId} ${method} ok`);
  if (method === "POST") return Response.json({ ok: true });
  return page(
    200,
    "You're unsubscribed",
    "We won't send you follow-up or marketing emails again. You'll still get emails about orders you place (receipts, verdicts, refunds).",
  );
}

export async function GET(req: Request): Promise<Response> {
  return handle(req, "GET");
}

export async function POST(req: Request): Promise<Response> {
  return handle(req, "POST");
}
