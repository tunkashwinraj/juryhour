// Idempotent Whop webhook registration (SPEC §11.1). Lead runs this after deploy.
//
//   npx tsx scripts/register-whop-webhooks.ts --base https://<app-host> --mode sandbox
//   npx tsx scripts/register-whop-webhooks.ts --base https://<app-host> --mode live --yes
//   add --dry-run to only list what is registered
//
// Registers `${base}/api/whop-webhook` (live) or `${base}/api/whop-webhook?mode=sandbox` (sandbox)
// for payment.succeeded, payment.failed, refund.created, dispute.created, dispute.updated, pinned to
// WHOP_API_VERSION_DATE. Lists existing webhooks first: an existing endpoint with the same URL is
// reused (events patched if missing). Whop shows the signing secret ONLY in the create response —
// it is printed once so the lead can store it as WHOP_WEBHOOK_SECRET / WHOP_SANDBOX_WEBHOOK_SECRET.
// If you lost the secret for an existing endpoint, delete it in the Whop dashboard and re-run.
import { loadEnvLocal } from "./load-env";
import type { Mode } from "../src/lib/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  loadEnvLocal();
  const { createWebhook, listWebhooks, updateWebhook, WHOP_WEBHOOK_EVENTS } = await import("../src/lib/whop");

  const base = (arg("base") ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const mode = (arg("mode") ?? "sandbox") as Mode;
  if (!/^https:\/\//.test(base)) throw new Error("--base must be the public https URL of the deployed app");
  if (mode !== "live" && mode !== "sandbox") throw new Error("--mode must be live or sandbox");
  if (mode === "live" && !process.argv.includes("--yes")) {
    throw new Error("Registering on the LIVE Whop business requires --yes");
  }
  const url = mode === "sandbox" ? `${base}/api/whop-webhook?mode=sandbox` : `${base}/api/whop-webhook`;

  const existing = await listWebhooks(mode);
  console.log(`[${mode}] ${existing.length} webhook(s) registered:`);
  for (const w of existing) console.log(`  ${w.id} ${w.enabled ? "enabled " : "disabled"} ${w.url} [${w.events.join(", ")}] v=${w.api_version_date ?? "-"}`);

  if (process.argv.includes("--dry-run")) {
    console.log(`--dry-run: would ensure ${url} is registered.`);
    return;
  }
  const same = existing.find((w) => w.url === url);
  if (same) {
    const missing = WHOP_WEBHOOK_EVENTS.filter((e) => !same.events.includes(e));
    if (missing.length || !same.enabled) {
      await updateWebhook(mode, same.id, { events: [...new Set([...same.events, ...WHOP_WEBHOOK_EVENTS])], enabled: true });
      console.log(`Updated ${same.id}: added [${missing.join(", ")}]${same.enabled ? "" : ", re-enabled"}.`);
    } else {
      console.log(`Already registered: ${same.id} → ${url}. Nothing to do.`);
    }
    if (same.api_version_date && same.api_version_date !== process.env.WHOP_API_VERSION_DATE && process.env.WHOP_API_VERSION_DATE) {
      console.warn(`WARNING: ${same.id} is pinned to ${same.api_version_date}, app expects ${process.env.WHOP_API_VERSION_DATE}.`);
    }
    console.log("The signing secret is only shown at creation; keep using the stored one.");
    return;
  }

  const created = await createWebhook(mode, url);
  const envName = mode === "live" ? "WHOP_WEBHOOK_SECRET" : "WHOP_SANDBOX_WEBHOOK_SECRET";
  console.log(`Created ${created.id} → ${created.url} [${created.events.join(", ")}] pinned ${created.api_version_date}`);
  if (created.webhook_secret) {
    console.log(`\nStore this now (shown once) as ${envName} in .env.local and Vercel:\n${envName}=${created.webhook_secret}\n`);
  } else {
    console.warn(`No webhook_secret in the response — copy it from the Whop dashboard (Developer → Webhooks) into ${envName}.`);
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
