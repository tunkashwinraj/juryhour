// Minimal chainable, thenable stand-in for the Supabase query builder used by B's data functions.
export type QueryCall = { table: string; cols: string; opts: { count?: string; head?: boolean } | undefined };
export type Resolver = (q: QueryCall) => { data?: unknown; count?: number | null; error?: { message: string } | null };

export function fakeDb(resolve: Resolver) {
  return {
    from(table: string) {
      const call: QueryCall = { table, cols: "", opts: undefined };
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ["eq", "in", "not", "order", "limit", "filter", "is"]) builder[m] = chain;
      builder.select = (cols: string, opts?: QueryCall["opts"]) => {
        call.cols = cols;
        call.opts = opts;
        return builder;
      };
      builder.maybeSingle = chain;
      builder.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
        try {
          const r = resolve(call);
          return Promise.resolve({ data: r.data ?? null, count: r.count ?? null, error: r.error ?? null }).then(ok, bad);
        } catch (e) {
          return Promise.reject(e).then(ok, bad);
        }
      };
      return builder;
    },
  };
}
