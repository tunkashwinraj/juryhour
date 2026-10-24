// Prints which env vars are configured (never their values). Usage: npx tsx scripts/check-env.ts
import { loadEnvLocal } from "./load-env";
import { env, has } from "../src/lib/env";

loadEnvLocal();
const e = env();
console.log(`APP_MODE=${e.APP_MODE}  APP_URL=${e.NEXT_PUBLIC_APP_URL}`);

const keys = [
  "WHOP_API_KEY", "WHOP_SANDBOX_API_KEY", "WHOP_WEBHOOK_SECRET", "WHOP_SANDBOX_WEBHOOK_SECRET",
  "WHOP_COMPANY_ID", "WHOP_SANDBOX_COMPANY_ID", "TERAC_API_KEY", "TERAC_PROJECT_ID",
  "TERAC_WEBHOOK_SECRET", "EXA_API_KEY", "OPENAI_API_KEY", "AGENT_RESEARCHER_FIRE_URL",
  "AGENT_ANALYST_FIRE_URL", "AGENT_PROCUREMENT_FIRE_URL", "AGENT_DISPUTES_FIRE_URL",
  "AGENT_SUPPORT_FIRE_URL", "RESEND_API_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET",
] as const;
for (const k of keys) console.log(`${has(k) ? "✓" : "·"} ${k}`);
