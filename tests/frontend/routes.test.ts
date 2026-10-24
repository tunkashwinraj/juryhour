import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- minimal chainable Supabase mock -------------------------------------------------------
type Result = { data: unknown; error: { message: string } | null; count?: number };
const state = vi.hoisted(() => ({
  results: {} as Record<string, unknown>,
  calls: [] as { table: string; op: string; args: unknown[] }[],
  rpc: null as unknown,
  events: [] as unknown[],
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = (op: string) => (...args: unknown[]) => {
    state.calls.push({ table, op, args });
    return b;
  };
  for (const op of ["select", "eq", "not", "order", "limit", "update", "insert", "maybeSingle", "single"]) b[op] = chain(op);
  b.then = (resolve: (r: Result) => void) => {
    const key = state.calls.some((c) => c.table === table && c.op === "update") ? `${table}:update` : table;
    const r = (state.results[key] ?? { data: null, error: null }) as Result;
    resolve(r);
  };
  return b;
}

vi.mock("@/lib/db", () => ({
  db: () => ({
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: unknown) => {
      state.calls.push({ table: "rpc", op: fn, args: [args] });
      return state.rpc ?? { data: [], error: null };
    },
  }),
  must: <T,>(res: { data: T; error: { message: string } | null }, what: string) => {
    if (res.error) throw new Error(`${what}: ${res.error.message}`);
    return res.data;
  },
  logEvent: async (e: unknown) => {
    state.events.push(e);
  },
}));

import { GET as getOrder } from "@/app/api/order/[token]/route";
import { POST as share } from "@/app/api/report/[token]/share/route";
import { POST as pause } from "@/app/api/ops-ui/pause/route";
import { POST as resume } from "@/app/api/ops-ui/resume/route";
import { GET as og } from "@/app/api/og/verdict/[token]/route";

const TOKEN = "T".repeat(43);
const ID = "11111111-2222-3333-4444-555555555555";
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const auth = `Basic ${btoa("admin:test-password")}`;

beforeEach(() => {
  state.results = {};
  state.calls = [];
  state.rpc = null;
  state.events = [];
});

describe("GET /api/order/[token]", () => {
  it("404s on malformed tokens without touching the DB", async () => {
    const res = await getOrder(new Request("https://x/api/order/abc"), ctx("abc"));
    expect(res.status).toBe(404);
    expect(state.calls).toHaveLength(0);
  });

  it("returns the safe projection from the RPC", async () => {
    state.rpc = {
      data: [
        {
          token: TOKEN, mode: "sandbox", stage: "PANEL_LIVE", tier: "proof", price_usd: "149.00",
          paid_at: "2026-10-24T10:00:00Z", delivered_at: null, deadline_at: "2026-10-24T18:00:00Z",
          refund_usd: "0", requested_n: 15, approved_n: 4, has_report: false, created_at: "2026-10-24T09:59:00Z",
        },
      ],
      error: null,
    };
    const res = await getOrder(new Request("https://x"), ctx(TOKEN));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.order).toMatchObject({ stage: "PANEL_LIVE", price_usd: 149, approved_n: 4, requested_n: 15, has_report: false });
    expect(Object.keys(body.order)).not.toContain("email");
    expect(state.calls[0]).toMatchObject({ table: "rpc", op: "get_order_by_token", args: [{ p_token: TOKEN }] });
  });

  it("404s when the RPC finds nothing", async () => {
    const res = await getOrder(new Request("https://x"), ctx(TOKEN));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/report/[token]/share", () => {
  const post = (body: unknown) =>
    new Request("https://x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

  it("validates input", async () => {
    expect((await share(post({ public: "yes" }), ctx(TOKEN))).status).toBe(400);
    expect((await share(post("{nope"), ctx(TOKEN))).status).toBe(400);
  });

  it("sets report_public only for a delivered report", async () => {
    state.results["orders:update"] = { data: [{ id: ID }], error: null };
    const res = await share(post({ public: true }), ctx(TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, public: true });
    const update = state.calls.find((c) => c.op === "update");
    expect(update?.args[0]).toEqual({ report_public: true });
    expect(state.calls.some((c) => c.op === "not" && c.args[0] === "report")).toBe(true);
  });

  it("404s when no row matched", async () => {
    state.results["orders:update"] = { data: [], error: null };
    expect((await share(post({ public: false }), ctx(TOKEN))).status).toBe(404);
  });
});

describe("POST /api/ops-ui/pause|resume", () => {
  const req = (headers: Record<string, string>) => new Request("https://x", { method: "POST", headers, body: "{}" });

  it("requires basic auth and the CSRF header", async () => {
    expect((await pause(req({ "x-ops-ui": "1" }))).status).toBe(401);
    expect((await pause(req({ authorization: auth }))).status).toBe(400);
    expect(state.calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("pauses sales, counts a human intervention, and logs it", async () => {
    state.results["company_state"] = { data: { human_interventions: 2 }, error: null };
    state.results["company_state:update"] = { data: null, error: null };
    const res = await pause(req({ authorization: auth, "x-ops-ui": "1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, salesPaused: true, humanInterventions: 3 });
    const update = state.calls.find((c) => c.op === "update");
    expect(update?.args[0]).toMatchObject({ sales_paused: true, human_interventions: 3 });
    expect(state.events[0]).toMatchObject({ actor: "code", action: "human_kill_switch" });
  });

  it("resume also counts as a human action", async () => {
    state.results["company_state"] = { data: { human_interventions: 0 }, error: null };
    const res = await resume(req({ authorization: auth, "x-ops-ui": "1" }));
    expect(await res.json()).toEqual({ ok: true, salesPaused: false, humanInterventions: 1 });
    expect(state.events[0]).toMatchObject({ actor: "code", action: "human_resume" });
  });
});

describe("GET /api/og/verdict/[ref]", () => {
  const report = {
    headline_verdict: "Your challenger wins 12 of 15",
    winner: "B",
    scorecard: {
      n_approved: 15, prefer_a: 3, prefer_b: 12, clarity_a: 4.1, clarity_b: 5.6, intent_a: 3.9, intent_b: 5.2,
      understanding_rate_a: 0.6, understanding_rate_b: 0.87,
    },
    top_fixes: [
      {
        title: "Say who it's for",
        detail: "Jurors could not tell.",
        evidence_quotes: [{ response_id: ID, text: "no idea who this is for", juror_label: "Juror 2" }],
      },
    ],
    winning_copy: { headline: "Hello there", subheadline: "Sub line", bullets: ["one", "two", "three"], cta: "Go" },
    rewritten_headline: null,
    still_unsolved: [],
    method_caveats: "15 real people, directional signal, not a sales guarantee.",
  };

  it("404s for a private card addressed by order id", async () => {
    state.results["orders"] = { data: { id: ID, token: TOKEN, stage: "DELIVERED", report, report_public: false }, error: null };
    const res = await og(new Request(`https://x/api/og/verdict/${ID}`), ctx(ID));
    expect(res.status).toBe(404);
  });

  it("404s for garbage refs without a DB call", async () => {
    const res = await og(new Request("https://x/api/og/verdict/nope"), ctx("nope"));
    expect(res.status).toBe(404);
    expect(state.calls).toHaveLength(0);
  });

  it("404s before delivery even for the token holder", async () => {
    state.results["orders"] = { data: { id: ID, token: TOKEN, stage: "SYNTHESIZING", report, report_public: true }, error: null };
    const res = await og(new Request(`https://x/api/og/verdict/${TOKEN}`), ctx(TOKEN));
    expect(res.status).toBe(404);
  });
});
