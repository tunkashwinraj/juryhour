// Loads .env.local into process.env for scripts (Next.js does this itself for the app).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadEnvLocal(file = ".env.local") {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    // strip trailing "# comment" only when preceded by whitespace
    const raw = m[2].trim();
    const quoted = raw.match(/^"(.*)"$/) ?? raw.match(/^'(.*)'$/);
    // like dotenv: an unquoted value ends at " #" (a value that is only a comment is empty)
    process.env[m[1]] = quoted ? quoted[1] : raw.startsWith("#") ? "" : raw.replace(/\s+#.*$/, "");
  }
}
