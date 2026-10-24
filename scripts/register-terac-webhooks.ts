// One-time setup: subscribe <baseUrl>/api/terac-webhook to Terac events and confirm it.
// Usage: npx tsx scripts/register-terac-webhooks.ts https://juryhour.com
//
// Terac confirms by POSTing a signed `webhook.ping` that our receiver must verify, so the deployed app
// needs TERAC_WEBHOOK_SECRET before confirmation can pass:
//   1st run  → creates the subscription and prints the secret (confirmation fails with 412 if the
//              deployment does not have that secret yet).
//   set TERAC_WEBHOOK_SECRET on the deployment (and in .env.local), redeploy.
//   2nd run  → finds the existing subscription and confirms it.
// Uses the key in TERAC_API_KEY (a sandbox org has its own key, subscription and secret).
import { loadEnvLocal } from "./load-env";
import {
  TERAC_EVENT_TYPES,
  TeracPreconditionError,
  confirmWebhookSubscription,
  createWebhookSubscription,
  getWebhookSubscriptionSecret,
  listWebhookSubscriptions,
} from "../src/lib/terac";

async function main() {
  loadEnvLocal();
  const base = (process.argv[2] ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(base)) {
    console.error("Usage: npx tsx scripts/register-terac-webhooks.ts https://<public-host>  (Terac requires public https)");
    process.exit(1);
  }
  const target = `${base}/api/terac-webhook`;

  let sub = (await listWebhookSubscriptions()).find((s) => s.target_url === target);
  let secret: string;
  if (sub) {
    console.log(`Existing subscription ${sub.id} for ${target} (events: ${sub.event_types.join(", ")})`);
    secret = await getWebhookSubscriptionSecret(sub.id);
  } else {
    const created = await createWebhookSubscription(target, TERAC_EVENT_TYPES);
    console.log(`Created subscription ${created.id} for ${target}`);
    sub = created;
    secret = created.secret;
  }
  console.log(`\nTERAC_WEBHOOK_SECRET=${secret}\n`);

  if (sub.confirmed_at) {
    console.log(`Already confirmed at ${sub.confirmed_at}. Done.`);
    return;
  }
  if (process.env.TERAC_WEBHOOK_SECRET !== secret) {
    console.log("The local TERAC_WEBHOOK_SECRET differs from this subscription's secret.");
    console.log("Set the value above on the deployment, redeploy, then run this script again to confirm.");
  }
  try {
    const confirmed = await confirmWebhookSubscription(sub.id);
    console.log(`Confirmed at ${confirmed.confirmed_at}. Terac will now deliver ${confirmed.event_types.join(", ")}.`);
  } catch (e) {
    if (e instanceof TeracPreconditionError) {
      console.error(`Confirmation ping failed (412): ${e.message}`);
      console.error("Make sure the deployment has the secret above and answers 2xx at", target);
      process.exit(2);
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
