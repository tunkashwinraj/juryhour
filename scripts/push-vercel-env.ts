// Pushes non-empty vars from .env.local to the linked Vercel project (production).
// Usage: npx tsx scripts/push-vercel-env.ts [NAME ...]   (no names = all)
// Script-only vars (DB URL/password) are never pushed. Values are piped via stdin, never printed.
import { execFileSync } from "node:child_process";
import { loadEnvLocal } from "./load-env";

const SKIP = new Set(["SUPABASE_DB_URL", "SUPABASE_DB_PASSWORD"]);
const before = new Set(Object.keys(process.env));
loadEnvLocal();
const fromFile = Object.keys(process.env).filter((k) => !before.has(k));
const only = process.argv.slice(2);
const names = (only.length ? only : fromFile).filter((k) => !SKIP.has(k) && process.env[k]);

for (const name of names) {
  const opts = { input: process.env[name], stdio: ["pipe", "ignore", "pipe"] as ("pipe" | "ignore")[], shell: true };
  try { execFileSync("vercel", ["env", "rm", name, "production", "--yes"], opts); } catch { /* not set yet */ }
  execFileSync("vercel", ["env", "add", name, "production"], opts);
  console.log(`set ${name}`);
}
