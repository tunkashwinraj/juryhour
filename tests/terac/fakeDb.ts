// Minimal in-memory stand-in for the Supabase query builder calls used by Workstream C.
// Supports: from(t).select(cols).eq(c,v).order(c,{ascending}).limit(n).maybeSingle() and from(t).insert(row).
type Row = Record<string, unknown>;
type Res<T> = { data: T; error: { message: string; code?: string } | null };

export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** Unique constraints: table → column list. */
  unique: Record<string, string[]> = { responses: ["terac_submission_id"], processed_webhooks: ["event_id"] };
  failNext: { table: string; message: string } | null = null;

  seed(table: string, rows: Row[]) {
    this.tables[table] = [...(this.tables[table] ?? []), ...rows];
    return this;
  }
  rows(table: string) {
    return this.tables[table] ?? [];
  }

  from(table: string) {
    return new Query(this, table);
  }
}

class Query {
  private filters: [string, unknown][] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  constructor(private dbi: FakeDb, private table: string) {}

  select(cols?: string) {
    void cols;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  private run(): Row[] {
    let rows = this.dbi.rows(this.table).filter((r) => this.filters.every(([c, v]) => r[c] === v));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.max != null) rows = rows.slice(0, this.max);
    return rows;
  }
  async maybeSingle(): Promise<Res<Row | null>> {
    if (this.dbi.failNext?.table === this.table) {
      const message = this.dbi.failNext.message;
      this.dbi.failNext = null;
      return { data: null, error: { message } };
    }
    const rows = this.run();
    if (rows.length > 1) return { data: null, error: { message: "multiple rows" } };
    return { data: rows[0] ?? null, error: null };
  }
  then<T>(resolve: (r: Res<Row[]>) => T) {
    return Promise.resolve({ data: this.run(), error: null }).then(resolve);
  }
  async insert(row: Row): Promise<Res<null>> {
    const t = (this.dbi.tables[this.table] ??= []);
    for (const col of this.dbi.unique[this.table] ?? []) {
      if (t.some((r) => r[col] === row[col])) {
        return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
      }
    }
    t.push({ created_at: new Date().toISOString(), ...row });
    return { data: null, error: null };
  }
}
