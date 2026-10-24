// Creates/updates the Vault secrets the pg_cron reconcile job reads (see 0003_cron.sql).
// Usage: npx tsx scripts/setup-cron-secrets.ts <app base url>. Values are never printed.
import { Client } from "pg";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();
const base = process.argv[2]?.replace(/\/$/, "");
if (!base) throw new Error("usage: setup-cron-secrets.ts <app base url>");
const secrets = {
  reconcile_url: `${base}/api/reconcile`,
  internal_cron_secret: process.env.INTERNAL_CRON_SECRET ?? "",
};
if (!secrets.internal_cron_secret) throw new Error("INTERNAL_CRON_SECRET is not set");

async function main() {
const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
for (const [name, value] of Object.entries(secrets)) {
  const existing = await db.query("select id from vault.secrets where name = $1", [name]);
  if (existing.rows[0]) await db.query("select vault.update_secret($1, $2)", [existing.rows[0].id, value]);
  else await db.query("select vault.create_secret($1, $2)", [value, name]);
  console.log(`vault secret ${name} ${existing.rows[0] ? "updated" : "created"}`);
}
const job = await db.query("select jobname, schedule, active from cron.job where jobname = 'jh-reconcile'");
console.log("cron job:", job.rows[0] ?? "missing");
await db.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
