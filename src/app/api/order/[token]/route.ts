// GET /api/order/[token] — safe projection for the order status page (polled every 4s).
import { getOrderStatus } from "@/lib/queries";
import { isValidToken } from "@/components/rules";
import { jsonError, jsonOk, log, rid } from "@/components/api";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const id = rid();
  if (!isValidToken(token)) return jsonError(404, "not_found", "Order not found", id);
  try {
    const order = await getOrderStatus(token);
    if (!order) return jsonError(404, "not_found", "Order not found", id);
    return jsonOk({ order }, id);
  } catch (e) {
    log(id, "api/order", "lookup failed", (e as Error).message);
    return jsonError(500, "internal", "Could not load this order. Try again in a moment.", id);
  }
}
