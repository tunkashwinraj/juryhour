// One-off: close sandbox test orders (smoke + chaos) so the reconciler doesn't start real agent runs
// or Terac panels for them. Goes through transition() so every step is in the events log.
// Usage: npx tsx scripts/close-test-orders.ts <order-id> [...]   (sandbox orders only)
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

async function main() {
  const ids = process.argv.slice(2);
  const { db } = await import("../src/lib/db");
  const { transition } = await import("../src/lib/orders/transition");
  const { refundPayment } = await import("../src/lib/whop");
  for (const id of ids) {
    const { data: o } = await db().from("orders").select("id, mode, stage, src, price_usd, whop_payment_id").eq("id", id).single();
    if (!o || o.mode !== "sandbox") {
      console.log(`${id}: skipped (not a sandbox order)`);
      continue;
    }
    const why = `Lead cleanup: ${o.src} test order closed before agents went live`;
    if (o.stage !== "FAILED") await transition(id, "FAILED", why, {}, { actor: "code" });
    let refunded = 0;
    let note = `${why} (synthetic order: no real payment to refund)`;
    if (o.whop_payment_id && !o.whop_payment_id.startsWith("chaos")) {
      try {
        await refundPayment({ paymentId: o.whop_payment_id, mode: "sandbox" });
        refunded = Number(o.price_usd ?? 0);
        note = `Sandbox payment refunded in full (${refunded})`;
      } catch (e) {
        note = `${why}. Whop sandbox refused the refund (${(e as Error).message.slice(-80)}); sandbox test money only, nothing real to return`;
      }
    }
    await transition(id, "REFUNDED", note, { refund_usd: refunded }, { from: "FAILED", actor: "code" });
    console.log(`${id}: ${o.stage} → FAILED → REFUNDED${refunded ? ` ($${refunded} sandbox refund)` : ""}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
