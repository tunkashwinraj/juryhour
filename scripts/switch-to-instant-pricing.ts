// One-off: move open QUOTING orders off a pending human feasibility quote onto instant pricing.
// Detaches the feasibility id so the reconciler prices a draft instead. Logged in the events trail.
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

async function main() {
  const { db } = await import("../src/lib/db");
  const { data: orders } = await db().from("orders").select("id").eq("stage", "QUOTING");
  for (const o of orders ?? []) {
    const { data: panels } = await db().from("panels").select("id, status, terac_feasibility_id").eq("order_id", o.id).eq("status", "quoting").not("terac_feasibility_id", "is", null);
    for (const p of panels ?? []) {
      await db().from("panels").update({ terac_feasibility_id: null }).eq("id", p.id);
      await db().from("events").insert({
        order_id: o.id, actor: "code", action: "switched_to_instant_pricing",
        reasoning: `Human quote ${p.terac_feasibility_id} unanswered; pricing this panel instantly instead`,
        payload: { panel_id: p.id, feasibility_id: p.terac_feasibility_id },
      });
      console.log(`order ${o.id}: panel ${p.id} → instant pricing`);
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
