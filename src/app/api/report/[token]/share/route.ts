// POST /api/report/[token]/share — customer opt-in/out for showing the verdict card publicly.
import { z } from "zod";
import { setReportPublic } from "@/lib/queries";
import { isValidToken } from "@/components/rules";
import { jsonError, jsonOk, log, rid } from "@/components/api";

const Body = z.object({ public: z.boolean() });

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const id = rid();
  if (!isValidToken(token)) return jsonError(404, "not_found", "Report not found", id);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "bad_json", "Body must be JSON", id);
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return jsonError(400, "invalid_input", "Expected { public: boolean }", id);
  try {
    const ok = await setReportPublic(token, parsed.data.public);
    if (!ok) return jsonError(404, "not_found", "No delivered report for this link", id);
    log(id, "api/report/share", `report_public=${parsed.data.public}`);
    return jsonOk({ public: parsed.data.public }, id);
  } catch (e) {
    log(id, "api/report/share", "update failed", (e as Error).message);
    return jsonError(500, "internal", "Could not save your choice. Try again.", id);
  }
}
