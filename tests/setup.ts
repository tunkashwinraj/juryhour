// Test env: deterministic fake values so env() validates. Tests must never hit live services;
// mock fetch / db() per test (vi.mock("@/lib/db") or vi.stubGlobal("fetch", ...)).
const testEnv: Record<string, string> = {
  NEXT_PUBLIC_APP_URL: "https://juryhour.test",
  APP_MODE: "sandbox",
  OPS_API_KEY: "test-ops-key-0123456789abcdef0123456789",
  INTERNAL_CRON_SECRET: "test-cron-secret-0123456789abcdef012345",
  OPS_BASIC_AUTH_USER: "admin",
  OPS_BASIC_AUTH_PASSWORD: "test-password",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
};

for (const [k, v] of Object.entries(testEnv)) process.env[k] = v;
// Never let a real key from the developer's shell leak into tests.
for (const k of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET|FIRE_URL)$/.test(k) && !(k in testEnv)) delete process.env[k];
}
