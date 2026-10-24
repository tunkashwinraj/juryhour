// Production price smoke test (sandbox mode only): creates real sandbox checkouts through the public
// /api/checkout and checks the stored order price, extra jurors and promo code, plus the refusals.
// Never pays anything. Usage: npx tsx scripts/smoke-prices.ts [baseUrl]
import { Client } from "pg";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

const BASE = (process.argv[2] ?? "https://juryhour.com").replace(/\/+$/, "");
const PITCH = "Ledgerly: bookkeeping for Etsy sellers. Connect your shop and get tax-ready books every month, no spreadsheets.";
const run = Math.random().toString(36).slice(2, 7);

type Case = {
  name: string;
  body: Record<string, unknown>;
  expect: { price?: number; extra?: number; promo?: string | null; code?: string };
};

const cases: Case[] = [
  { name: "Quick Read", body: { tier: "spark" }, expect: { price: 49, extra: 0, promo: null } },
  { name: "Verdict", body: { tier: "proof" }, expect: { price: 299, extra: 0, promo: null } },
  { name: "Verdict + LAUNCH20", body: { tier: "proof", code: "LAUNCH20" }, expect: { price: 239, promo: "LAUNCH20" } },
  { name: "Verdict + LAUNCH20 + 5 extra", body: { tier: "proof", code: "LAUNCH20", extra_jurors: 5 }, expect: { price: 319, extra: 5 } },
  { name: "Quick Read + 20 extra", body: { tier: "spark", extra_jurors: 20 }, expect: { price: 369, extra: 20 } },
  // `code` (from ad links) is attribution: never blocks a sale, never discounts wrongly
  { name: "ad code HALF (retired)", body: { tier: "proof", code: "HALF" }, expect: { price: 299, promo: "HALF" } },
  { name: "ad code LAUNCH20 on Quick Read", body: { tier: "spark", code: "LAUNCH20" }, expect: { price: 49 } },
  // `coupon` (typed by the buyer) is strict
  { name: "typed coupon HALF", body: { tier: "proof", coupon: "HALF" }, expect: { code: "coupon_unknown" } },
  { name: "typed LAUNCH20 on Quick Read", body: { tier: "spark", coupon: "LAUNCH20" }, expect: { code: "coupon_not_applicable" } },
  { name: "typed LAUNCH20 on Verdict", body: { tier: "proof", coupon: "LAUNCH20" }, expect: { price: 239, promo: "LAUNCH20" } },
  { name: "21 extra jurors", body: { tier: "spark", extra_jurors: 21 }, expect: { code: "extra_jurors_out_of_range" } },
  { name: "Retired tier", body: { tier: "pulse" }, expect: { code: "tier_not_offered" } },
];

async function main() {
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  let failed = 0;
  try {
    for (const [i, c] of cases.entries()) {
      const email = `delivered+price${run}${i}@resend.dev`;
      const res = await fetch(`${BASE}/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addons: [], email, buyer_desc: "Etsy sellers doing their own taxes", pitch_text: PITCH, src: "smoke-test", ...c.body }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string; purchase_url?: string };
      let ok: boolean;
      let detail: string;
      if (c.expect.code) {
        ok = json.ok === false && json.code === c.expect.code;
        detail = `→ ${res.status} ${json.code ?? ""}`;
      } else {
        const row = (await db.query("select price_usd, extra_jurors, promo_code from orders where email = $1 order by created_at desc limit 1", [email])).rows[0];
        const price = row ? Number(row.price_usd) : NaN;
        ok = json.ok === true && !!json.purchase_url?.includes("whop.com/checkout")
          && price === c.expect.price
          && (c.expect.extra === undefined || row.extra_jurors === c.expect.extra)
          && (c.expect.promo === undefined || row.promo_code === c.expect.promo);
        detail = json.ok ? `→ $${price} (extra ${row?.extra_jurors}, code ${row?.promo_code ?? "-"})` : `→ ${res.status} ${json.code}: ${json.error}`;
      }
      if (!ok) failed++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(30)} ${detail}  (expected ${JSON.stringify(c.expect)})`);
    }
  } finally {
    await db.end();
  }
  console.log(failed ? `\n${failed} FAILED` : "\nall price checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
