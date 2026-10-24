// Ad-hoc read-only SQL for debugging. Usage: npx tsx scripts/db-query.ts "select ..."
import { Client } from "pg";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();
async function main() {
  const sql = process.argv[2];
  if (!sql || !/^\s*(select|with)\b/i.test(sql)) throw new Error("read-only select/with queries only");
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query("begin read only");
    console.table((await db.query(sql)).rows);
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
}
main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
