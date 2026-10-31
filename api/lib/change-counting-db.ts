// change-counting-db.ts -- a D1 handle that counts the rows a request changed
// (schema-v154 receipts). The receipts catch-all owes a summary line only when
// a PB-key request actually changed rows; counting at the handle means no route
// has to declare whether it writes (a POST that only reads, such as the
// listener's /api/ai-requests/queue poll, counts 0 and gets no line).
//
// Composes over whatever handle the request already has (the viewer-db scoped
// handle in production): prepare() goes to the inner handle, so scoping and
// refusals are the inner handle's; batch() hands the inner handle its own
// statements back, so the batch transaction is the inner handle's too.
//
// What counts:
//   - run() / all() on a write statement: result.meta.changes (D1's own count;
//     0 for an UPDATE whose WHERE matched nothing, an INSERT OR IGNORE that
//     ignored, an ON CONFLICT DO NOTHING).
//   - batch(): the same, summed over the write statements in it.
//   - first() / raw() on a write statement give no meta: a RETURNING write
//     counts the rows it returned; one without RETURNING counts 1 (unknown is
//     recorded, never dropped).
//   - exec(): counts 1 when it ran anything (no per-row count exists).
// A read statement (SELECT / PRAGMA / EXPLAIN / VALUES, or a WITH whose body
// has no INSERT/UPDATE/DELETE/REPLACE) never counts: SQLite's changes() is the
// last write's count, stale for a read, so meta.changes on a read is not used.

const READ_HEAD = /^(SELECT|PRAGMA|EXPLAIN|VALUES)\b/i
const WRITE_WORD = /\b(INSERT|UPDATE|DELETE|REPLACE)\b/i
const RETURNING = /\bRETURNING\b/i

/** Strip leading whitespace and SQL comments. */
function head(sql: string): string {
  let s = sql
  for (;;) {
    const t = s.replace(/^\s+/, '')
    if (t.startsWith('--')) { const nl = t.indexOf('\n'); s = nl < 0 ? '' : t.slice(nl + 1); continue }
    if (t.startsWith('/*')) { const end = t.indexOf('*/'); s = end < 0 ? '' : t.slice(end + 2); continue }
    return t
  }
}

/** True when the statement can change rows. */
export function isWriteSql(sql: string): boolean {
  const h = head(sql)
  if (READ_HEAD.test(h)) return false
  if (/^WITH\b/i.test(h)) return WRITE_WORD.test(h)
  return h.length > 0
}

interface Meta { meta?: { changes?: number } }
const changesOf = (r: unknown): number => {
  const n = (r as Meta | null)?.meta?.changes
  return typeof n === 'number' && n > 0 ? n : 0
}

const INNER = Symbol('change-counting-db.inner')
type Counted = D1PreparedStatement & { [INNER]: D1PreparedStatement; write: boolean }

function counted(inner: D1PreparedStatement, sql: string, write: boolean, add: (n: number) => void): Counted {
  const stmt = {
    [INNER]: inner,
    write,
    bind: (...values: unknown[]) => counted(inner.bind(...values), sql, write, add),
    run: async () => {
      const r = await inner.run()
      if (write) add(changesOf(r))
      return r
    },
    all: async () => {
      const r = await inner.all()
      if (write) add(changesOf(r))
      return r
    },
    first: async (col?: string) => {
      const r = col === undefined ? await inner.first() : await inner.first(col)
      if (write) add(RETURNING.test(sql) ? (r == null ? 0 : 1) : 1)
      return r
    },
    raw: async (opts?: { columnNames?: boolean }) => {
      const r = await (inner.raw as (o?: unknown) => Promise<unknown[]>)(opts)
      if (write) {
        const rows = Array.isArray(r) ? r.length - (opts?.columnNames ? 1 : 0) : 0
        add(RETURNING.test(sql) ? Math.max(rows, 0) : 1)
      }
      return r
    },
  }
  return stmt as unknown as Counted
}

/**
 * `inner` with every row change reported to `add`. The returned handle is used
 * exactly like a D1Database; statements it prepares must be batched on it.
 */
export function changeCountingDb(inner: D1Database, add: (n: number) => void): D1Database {
  const handle = {
    prepare: (sql: string) => counted(inner.prepare(sql), sql, isWriteSql(sql), add),
    batch: async (stmts: D1PreparedStatement[]) => {
      const raw = stmts.map((s) => (s as Partial<Counted>)[INNER] ?? s)
      const results = await inner.batch(raw)
      stmts.forEach((s, i) => {
        // A statement this handle did not prepare is counted by its result:
        // unknown origin is recorded, never dropped.
        const write = (s as Partial<Counted>)[INNER] ? (s as Counted).write : true
        if (write) add(changesOf(results[i]))
      })
      return results
    },
    exec: async (sql: string) => {
      const r = await inner.exec(sql)
      if (isWriteSql(sql)) add(1)
      return r
    },
    dump: () => inner.dump(),
    withSession: (...args: unknown[]) => (inner.withSession as (...a: unknown[]) => unknown)(...args),
  }
  return handle as unknown as D1Database
}
