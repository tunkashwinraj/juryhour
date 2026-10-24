// In-memory stand-in for the subset of supabase-js that Workstream E uses, with the schema's
// unique constraints, column defaults and the two SQL views (approved_responses, order_stats)
// computed on read exactly as in 0001_init.sql. Use via:
//   vi.mock("@/lib/db", async () => (await import("./helpers/fakeDb")).dbModule);
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Err = { message: string; code?: string };
type Res = { data: unknown; error: Err | null; count?: number | null };

const DEFAULTS: Record<string, () => Row> = {
  orders: () => ({
    stage: "CREATED", attempts: 0, refund_usd: 0, support_refund_used: false, retest_available: false,
    report: null, report_public: false, human_interventions: 0, addons: [], url: null, pitch_text: null, src: null,
    preview_id: null, parent_order_id: null, whop_checkout_id: null, whop_payment_id: null, whop_receipt_url: null,
    paid_at: null, delivered_at: null, deadline_at: null, quote_expires_at: null,
    stage_entered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }),
  panels: () => ({
    approved_n: 0, rejected_n: 0, status: "quoting", audience_broadened: false, terac_feasibility_id: null,
    terac_opportunity_id: null, cost_per_participant: null, budget_usd: null, launched_at: null, stopped_at: null,
  }),
  responses: () => ({ decision: null, decided_at: null, quality_score: null, quality_reason: null, understood_a: null, understood_b: null, grader_flags: null }),
  incidents: () => ({ resolved: false }),
  agent_runs: () => ({ attempt: 1, started_at: new Date().toISOString(), ended_at: null }),
  ledger: () => ({ ref: null, note: null }),
  events: () => ({ reasoning: null, payload: null, order_id: null }),
  tests: () => ({ card_b: null, research_notes: null, rewrite_strategy: null }),
  previews: () => ({ followup_1_sent_at: null, followup_2_sent_at: null }),
};

const UNIQUE: Record<string, ((r: Row) => string | null)[]> = {
  orders: [(r) => (r.whop_payment_id ? `pay:${r.whop_payment_id}` : null), (r) => (r.token ? `tok:${r.token}` : null)],
  tests: [(r) => `order:${r.order_id}`],
  panels: [(r) => (r.terac_opportunity_id ? `opp:${r.terac_opportunity_id}` : null), (r) => (r.status === "live" ? `live:${r.order_id}` : null)],
  responses: [(r) => `sub:${r.terac_submission_id}`],
  ledger: [(r) => (r.ref ? `${r.kind}:${r.ref}` : null)],
  processed_webhooks: [(r) => `${r.provider}:${r.event_id}`],
  agent_runs: [(r) => (r.session_id ? `sid:${r.session_id}` : null)],
  email_suppressions: [(r) => `e:${r.email}`],
  prices: [(r) => `t:${r.tier}`],
};

const FK: Record<string, [string, string][]> = {
  events: [["order_id", "orders"]],
  incidents: [["order_id", "orders"]],
  ledger: [["order_id", "orders"]],
};

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** Inject failures: table → error returned by the next insert/update on it. */
  failNext: Record<string, Err | undefined> = {};

  reset() {
    this.tables = {};
    this.failNext = {};
  }

  rows(table: string): Row[] {
    if (table === "approved_responses") return this.approvedResponses();
    if (table === "order_stats") return this.orderStats();
    return (this.tables[table] ??= []);
  }

  approvedResponses(): Row[] {
    const approved = (this.tables.responses ?? []).filter((r) => r.decision === "approved");
    const byTest = new Map<string, Row[]>();
    for (const r of approved) byTest.set(String(r.test_id), [...(byTest.get(String(r.test_id)) ?? []), r]);
    const out: Row[] = [];
    for (const list of byTest.values()) {
      const sorted = [...list].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
      sorted.forEach((r, i) => out.push({ ...r, juror_number: i + 1 }));
    }
    return out;
  }

  orderStats(): Row[] {
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const avg = (xs: number[]) => (xs.length ? r2(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
    const ar = this.approvedResponses();
    return (this.tables.tests ?? []).map((t) => {
      const rs = ar.filter((r) => r.test_id === t.id);
      const ans = (r: Row) => r.answers as { preferred?: string; cards: Record<string, { clarity: number; would_try: number } | undefined> };
      const num = (card: "A" | "B", k: "clarity" | "would_try") =>
        rs.map((r) => ans(r).cards[card]?.[k]).filter((x): x is number => typeof x === "number");
      const rate = (k: "understood_a" | "understood_b") => {
        const xs = rs.filter((r) => r[k] !== null && r[k] !== undefined).map((r) => (r[k] ? 1 : 0));
        return avg(xs);
      };
      return {
        test_id: t.id,
        order_id: t.order_id,
        n_approved: rs.length,
        prefer_a: rs.filter((r) => ans(r).preferred === "A").length,
        prefer_b: rs.filter((r) => ans(r).preferred === "B").length,
        clarity_a: avg(num("A", "clarity")),
        clarity_b: avg(num("B", "clarity")),
        intent_a: avg(num("A", "would_try")),
        intent_b: avg(num("B", "would_try")),
        understanding_rate_a: rate("understood_a"),
        understanding_rate_b: rate("understood_b"),
      };
    });
  }

  insert(table: string, input: Row | Row[]): { rows: Row[]; error: Err | null } {
    const err = this.failNext[table];
    if (err) {
      delete this.failNext[table];
      return { rows: [], error: err };
    }
    const list = Array.isArray(input) ? input : [input];
    const created: Row[] = [];
    for (const raw of list) {
      const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...(DEFAULTS[table]?.() ?? {}), ...clone(raw) };
      for (const [col, ref] of FK[table] ?? []) {
        if (row[col] && !this.rows(ref).some((r) => r.id === row[col])) {
          return { rows: [], error: { message: `insert or update on table "${table}" violates foreign key constraint`, code: "23503" } };
        }
      }
      const violation = this.uniqueViolation(table, row, null);
      if (violation) return { rows: [], error: violation };
      this.rows(table).push(row);
      created.push(row);
    }
    return { rows: created, error: null };
  }

  uniqueViolation(table: string, row: Row, selfId: unknown): Err | null {
    for (const key of UNIQUE[table] ?? []) {
      const k = key(row);
      if (k === null) continue;
      if (this.rows(table).some((r) => r.id !== selfId && key(r) === k)) {
        return { message: `duplicate key value violates unique constraint (${table} ${k})`, code: "23505" };
      }
    }
    return null;
  }

  get client() {
    return { from: (table: string) => new Builder(this, table) };
  }
}

type Filter = (r: Row) => boolean;

function getPath(r: Row, col: string): unknown {
  const m = col.match(/^(\w+)->>(\w+)$/);
  if (m) {
    const v = r[m[1]] as Row | null | undefined;
    const x = v?.[m[2]];
    return x === undefined || x === null ? null : String(x);
  }
  return r[col];
}

function cmp(a: unknown, b: unknown): number {
  if (typeof a === "number" || typeof b === "number") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

function eqVal(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  if (typeof a === "boolean" || typeof b === "boolean") return String(a) === String(b);
  return a === b;
}

class Builder implements PromiseLike<Res> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private rng: [number, number] | null = null;
  private payload: Row | Row[] | null = null;
  private returning = false;
  private singleMode: "one" | "maybe" | null = null;
  private countMode = false;
  private head = false;

  constructor(private fake: FakeDb, private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.countMode = Boolean(opts?.count);
      this.head = Boolean(opts?.head);
    } else this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => eqVal(getPath(r, col), v));
    return this;
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => !eqVal(getPath(r, col), v));
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.some((v) => eqVal(getPath(r, col), v)));
    return this;
  }
  is(col: string, v: null | boolean) {
    this.filters.push((r) => (v === null ? getPath(r, col) === null || getPath(r, col) === undefined : getPath(r, col) === v));
    return this;
  }
  not(col: string, op: string, v: unknown) {
    if (op !== "is" || v !== null) throw new Error(`fakeDb: unsupported not(${op})`);
    this.filters.push((r) => getPath(r, col) !== null && getPath(r, col) !== undefined);
    return this;
  }
  lt(col: string, v: unknown) {
    this.filters.push((r) => getPath(r, col) != null && cmp(getPath(r, col), v) < 0);
    return this;
  }
  lte(col: string, v: unknown) {
    this.filters.push((r) => getPath(r, col) != null && cmp(getPath(r, col), v) <= 0);
    return this;
  }
  gt(col: string, v: unknown) {
    this.filters.push((r) => getPath(r, col) != null && cmp(getPath(r, col), v) > 0);
    return this;
  }
  gte(col: string, v: unknown) {
    this.filters.push((r) => getPath(r, col) != null && cmp(getPath(r, col), v) >= 0);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  range(a: number, b: number) {
    this.rng = [a, b];
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  single() {
    this.singleMode = "one";
    return this;
  }

  private matching(): Row[] {
    return this.fake.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private shape(rows: Row[]): Res {
    let out = [...rows];
    for (const o of [...this.orders].reverse()) {
      out.sort((a, b) => {
        const x = getPath(a, o.col);
        const y = getPath(b, o.col);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return o.asc ? cmp(x, y) : -cmp(x, y);
      });
    }
    if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
    if (this.lim !== null) out = out.slice(0, this.lim);
    const data = clone(out);
    if (this.singleMode === "maybe") {
      if (data.length > 1) return { data: null, error: { message: "multiple rows", code: "PGRST116" } };
      return { data: data[0] ?? null, error: null };
    }
    if (this.singleMode === "one") {
      if (data.length !== 1) return { data: null, error: { message: "expected one row", code: "PGRST116" } };
      return { data: data[0], error: null };
    }
    return { data, error: null };
  }

  private exec(): Res {
    if (this.op === "select") {
      const rows = this.matching();
      if (this.countMode) return { data: this.head ? null : clone(rows), error: null, count: rows.length };
      return this.shape(rows);
    }
    if (this.op === "insert") {
      const { rows, error } = this.fake.insert(this.table, this.payload as Row | Row[]);
      if (error) return { data: null, error };
      return this.returning ? this.shape(rows) : { data: null, error: null };
    }
    if (this.op === "update") {
      const err = this.fake.failNext[this.table];
      if (err) {
        delete this.fake.failNext[this.table];
        return { data: null, error: err };
      }
      const targets = this.matching();
      const patch = this.payload as Row;
      for (const t of targets) {
        const next = { ...t, ...clone(patch) };
        if (this.table === "orders" && !("updated_at" in patch)) next.updated_at = new Date().toISOString();
        const v = this.fake.uniqueViolation(this.table, next, t.id);
        if (v) return { data: null, error: v };
      }
      for (const t of targets) {
        Object.assign(t, clone(patch));
        if (this.table === "orders") t.updated_at = new Date().toISOString();
      }
      return this.returning ? this.shape(targets) : { data: null, error: null };
    }
    const targets = this.matching();
    this.fake.tables[this.table] = this.fake.rows(this.table).filter((r) => !targets.includes(r));
    return { data: null, error: null };
  }

  then<A = Res, B = never>(ok?: ((v: Res) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    let res: Res;
    try {
      res = this.exec();
    } catch (e) {
      return Promise.reject(e).then(ok, bad);
    }
    return Promise.resolve(res).then(ok, bad);
  }
}

export const fake = new FakeDb();

export const dbModule = {
  db: () => fake.client,
  must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
    if (res.error) throw new Error(`${what}: ${res.error.message}`);
    return res.data;
  },
  async logEvent(e: { order_id?: string | null; actor: string; action: string; reasoning?: string | null; payload?: unknown }) {
    const r = fake.insert("events", { order_id: e.order_id ?? null, actor: e.actor, action: e.action, reasoning: e.reasoning ?? null, payload: e.payload ?? null });
    if (r.error) throw new Error(`logEvent: ${r.error.message}`);
  },
  async openIncident(kind: string, detail: string, order_id?: string | null) {
    fake.insert("incidents", { kind, detail, order_id: order_id ?? null });
  },
  async claimWebhook(provider: string, eventId: string) {
    return !fake.insert("processed_webhooks", { provider, event_id: eventId }).error;
  },
};
