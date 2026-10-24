// Minimal chainable Supabase stand-in for Agent C route tests. Each awaited query is recorded and
// answered by `respond(call)`.
export type Call = {
  table: string;
  op: "select" | "insert" | "update";
  payload?: unknown;
  filters: [string, string, unknown][];
  options?: unknown;
};
export type Result = { data?: unknown; error?: { message: string } | null; count?: number | null };

export function createFakeDb(respond: (c: Call) => Result | undefined) {
  const calls: Call[] = [];
  class Q {
    call: Call;
    constructor(table: string) {
      this.call = { table, op: "select", filters: [] };
    }
    select(_cols?: string, options?: unknown) {
      if (options) this.call.options = options;
      return this;
    }
    insert(payload: unknown) {
      this.call.op = "insert";
      this.call.payload = payload;
      return this;
    }
    eq(c: string, v: unknown) {
      this.call.filters.push(["eq", c, v]);
      return this;
    }
    in(c: string, v: unknown) {
      this.call.filters.push(["in", c, v]);
      return this;
    }
    gte(c: string, v: unknown) {
      this.call.filters.push(["gte", c, v]);
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    single() {
      return this.exec();
    }
    maybeSingle() {
      return this.exec();
    }
    exec() {
      calls.push(this.call);
      const r = respond(this.call) ?? {};
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null });
    }
    then<A, B>(f: (v: { data: unknown; error: unknown; count: number | null }) => A, r?: (e: unknown) => B) {
      return this.exec().then(f, r);
    }
  }
  return { client: { from: (t: string) => new Q(t) }, calls };
}

export const filter = (c: Call, op: string, col: string) => c.filters.find((f) => f[0] === op && f[1] === col)?.[2];
