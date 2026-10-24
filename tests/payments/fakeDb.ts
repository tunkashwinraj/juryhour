// Minimal chainable stand-in for the Supabase query builder used by the payments routes.
// Each awaited query is recorded and answered by `respond(call)`.
export type DbCall = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  columns?: string;
  filters: [string, string, unknown][];
  single?: "single" | "maybeSingle";
  options?: unknown;
};
export type DbResult = { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null };

export function createFakeDb(respond: (c: DbCall) => DbResult | undefined) {
  const calls: DbCall[] = [];

  class Query {
    call: DbCall;
    constructor(table: string) {
      this.call = { table, op: "select", filters: [] };
    }
    select(columns?: string, options?: unknown) {
      if (this.call.op === "select") this.call.columns = columns;
      if (options) this.call.options = options;
      return this;
    }
    insert(payload: unknown) {
      this.call.op = "insert";
      this.call.payload = payload;
      return this;
    }
    update(payload: unknown) {
      this.call.op = "update";
      this.call.payload = payload;
      return this;
    }
    delete() {
      this.call.op = "delete";
      return this;
    }
    eq(col: string, v: unknown) {
      this.call.filters.push(["eq", col, v]);
      return this;
    }
    not(col: string, op: string, v: unknown) {
      this.call.filters.push([`not.${op}`, col, v]);
      return this;
    }
    match(obj: Record<string, unknown>) {
      for (const [k, v] of Object.entries(obj)) this.call.filters.push(["eq", k, v]);
      return this;
    }
    single() {
      this.call.single = "single";
      return this.exec();
    }
    maybeSingle() {
      this.call.single = "maybeSingle";
      return this.exec();
    }
    exec(): Promise<{ data: unknown; error: { message: string; code?: string } | null; count: number | null }> {
      calls.push(this.call);
      const r = respond(this.call) ?? {};
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null });
    }
    then<A, B>(onFul: (v: { data: unknown; error: unknown; count: number | null }) => A, onRej?: (e: unknown) => B) {
      return this.exec().then(onFul, onRej);
    }
  }

  const client = { from: (table: string) => new Query(table) };
  return { client, calls };
}

export const filterValue = (c: DbCall, col: string) => c.filters.find((f) => f[1] === col)?.[2];
