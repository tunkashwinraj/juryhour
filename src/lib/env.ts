// Environment access (SPEC §4). Required core vars are validated on first use and fail loudly
// with every missing name. Integration keys are optional at boot so the app can deploy before
// every key exists; call need("NAME") at the point of use to fail with a clear message.
import { z } from "zod";

// Empty values in .env files ("KEY=") count as unset.
const optional = z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().min(1).optional());

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  APP_MODE: z.enum(["live", "sandbox"]).default("sandbox"),
  OPS_API_KEY: z.string().min(32),
  INTERNAL_CRON_SECRET: z.string().min(32),
  OPS_BASIC_AUTH_USER: z.string().min(1),
  OPS_BASIC_AUTH_PASSWORD: z.string().min(8),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  WHOP_API_KEY: optional,
  WHOP_SANDBOX_API_KEY: optional,
  WHOP_WEBHOOK_SECRET: optional,
  WHOP_SANDBOX_WEBHOOK_SECRET: optional,
  WHOP_COMPANY_ID: optional,
  WHOP_SANDBOX_COMPANY_ID: optional,
  WHOP_API_VERSION_DATE: z.string().default("2026-07-01"),

  TERAC_API_KEY: optional,
  TERAC_PROJECT_ID: optional,
  TERAC_WEBHOOK_SECRET: optional,

  EXA_API_KEY: optional,
  OPENAI_API_KEY: optional,

  // Claude Code cloud scheduled tasks ("routines") with API triggers — see CLAUDE.md
  AGENT_RESEARCHER_FIRE_URL: optional,
  AGENT_RESEARCHER_FIRE_TOKEN: optional,
  AGENT_ANALYST_FIRE_URL: optional,
  AGENT_ANALYST_FIRE_TOKEN: optional,
  AGENT_PROCUREMENT_FIRE_URL: optional,
  AGENT_PROCUREMENT_FIRE_TOKEN: optional,
  AGENT_DISPUTES_FIRE_URL: optional,
  AGENT_DISPUTES_FIRE_TOKEN: optional,
  AGENT_SUPPORT_FIRE_URL: optional,
  AGENT_SUPPORT_FIRE_TOKEN: optional,

  RESEND_API_KEY: optional,
  RESEND_FROM: z.string().default("JuryHour <verdict@juryhour.com>"),

  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optional,
  TURNSTILE_SECRET: optional,

  X_API_KEY: optional,
  X_API_SECRET: optional,
  X_ACCESS_TOKEN: optional,
  X_ACCESS_SECRET: optional,
});

export type Env = z.infer<typeof schema>;
type OptionalKey = { [K in keyof Env]-?: undefined extends Env[K] ? K : never }[keyof Env];

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join(".")))];
    throw new Error(`Missing or invalid environment variables: ${names.join(", ")}`);
  }
  cached = parsed.data;
  return cached;
}

/** Returns an optional integration var or throws naming it. */
export function need(name: OptionalKey): string {
  const value = env()[name];
  if (value === undefined || value === "") throw new Error(`${name} is not configured`);
  return value;
}

/** True when an optional integration var is set (use to choose mock/dry-run paths). */
export function has(name: OptionalKey): boolean {
  const value = env()[name];
  return value !== undefined && value !== "";
}

/** Test helper: clear the cache after mutating process.env. */
export function resetEnvCache() {
  cached = undefined;
}
