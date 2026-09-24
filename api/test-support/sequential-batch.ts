// Test support only: never imported by the Worker.
//
// #8842 R1 moved every row-changing update/delete in api/routes/mutations.ts
// into ONE env.DB.batch() (row write + receipt + read-back). The regex stub
// DBs in the mutations.*.test.ts files stubbed batch as `async () => []`,
// which a real D1 never returns. withSequentialBatch gives such a stub a
// batch that runs each statement through the stub's own first()/run(), in
// order, and returns D1-shaped results: SELECTs as { results: [row] }, writes
// as whatever run() returns.
//
// It is NOT transactional; a stub cannot roll back. Atomicity is pinned by
// api/routes/mutations.cas-race.test.ts on a real SQLite engine.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Stmt = { bind: (...v: unknown[]) => Stmt; first: () => Promise<any>; run: () => Promise<any> };
type StubDb = { prepare: (sql: string) => any };

const SQL = Symbol('sql');

function tag(stmt: any, sql: string): any {
  return new Proxy(stmt, {
    get(target, prop) {
      if (prop === SQL) return sql;
      if (prop === 'bind') return (...vals: unknown[]) => tag(target.bind(...vals), sql);
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

export function withSequentialBatch<T extends StubDb>(db: T): T {
  const prepare = db.prepare.bind(db);
  const wrapped = Object.create(db) as T;
  wrapped.prepare = (sql: string) => tag(prepare(sql), sql);
  (wrapped as any).batch = async (stmts: Stmt[]) => {
    const out: any[] = [];
    for (const s of stmts) {
      const sql = (s as any)[SQL] as string | undefined;
      if (sql !== undefined && /^\s*SELECT\b/i.test(sql)) {
        const row = await s.first();
        out.push({ results: row ? [row] : [], success: true, meta: {} });
      } else {
        out.push(await s.run());
      }
    }
    return out;
  };
  return wrapped;
}

/**
 * For a stub whose rows never change: the value an `UPDATE ... SET a = ?,
 * b = datetime('now'), c = ? WHERE ...` binds to `column`, or undefined.
 * Lets a static stub stamp `last_mutation_id` on its row the way D1 would,
 * which is how commitRowWrite recognises that its write landed.
 */
export function boundSetValue(sql: string, vals: unknown[], column: string): unknown {
  const m = sql.match(/\bSET\s+([\s\S]+?)\s+WHERE\b/i);
  if (!m) return undefined;
  let idx = 0;
  for (const pair of m[1].split(',')) {
    const [col, rhs] = pair.split('=').map((x) => x.trim());
    if (rhs === '?') {
      if (col === column) return vals[idx];
      idx += 1;
    }
  }
  return undefined;
}
