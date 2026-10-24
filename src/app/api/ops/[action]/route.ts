// POST /api/ops/<action> — guardrailed Ops API for agents (CONTRACTS §5, SPEC §12). Bearer OPS_API_KEY.
import { handleOpsRequest } from "@/lib/ops/router";

export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  return handleOpsRequest(req, action);
}
