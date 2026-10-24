// GET /api/juror/test/[testId] — PublicTest for the juror page (attention answer never included).
import { getPublicTest } from "@/lib/juror";

export async function GET(_req: Request, ctx: { params: Promise<{ testId: string }> }) {
  const { testId } = await ctx.params;
  const noStore = { "cache-control": "no-store" };
  try {
    const test = await getPublicTest(testId);
    if (!test) return Response.json({ ok: false, code: "test_not_found", error: "This test does not exist" }, { status: 404, headers: noStore });
    return Response.json(test, { headers: noStore }); // bare PublicTest per CONTRACTS §4
  } catch (e) {
    console.error("[juror/test]", e);
    return Response.json({ ok: false, code: "internal", error: "Could not load this test" }, { status: 500, headers: noStore });
  }
}
