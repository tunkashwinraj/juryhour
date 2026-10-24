// Applies supabase/migrations/*.sql in order, once each. Usage: npm run db:migrate
// Needs SUPABASE_DB_URL (in .env.local). Tracks applied files in public.schema_migrations.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

const dir = join(process.cwd(), "supabase", "migrations");

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL is not set");

  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    await db.query("alter table schema_migrations enable row level security");
    const done = new Set(
      (await db.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name),
    );

    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(file)) continue;
      const sql = readFileSync(join(dir, file), "utf8");
      await db.query("begin");
      try {
        await db.query(sql);
        await db.query("insert into schema_migrations (name) values ($1)", [file]);
        await db.query("commit");
        console.log(`applied ${file}`);
      } catch (err) {
        await db.query("rollback");
        throw new Error(`${file} failed: ${(err as Error).message}`);
      }
    }
    console.log("migrations up to date");
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
