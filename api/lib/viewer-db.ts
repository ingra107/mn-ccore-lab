// viewer-db.ts -- a D1 handle that can only see the caller's rows (#145).
//
// The access rule used to be a SQL fragment each route had to remember
// (pbTaskVisibilitySql, canSeePbProject, the canSeePb flag threaded through
// ~20 handlers). A route that forgot it leaked, silently, and #8842 R6 and
// the 2026-10-08 meetings leak were both that. This module moves the rule
// below the routes: the request middleware in api/index.ts swaps env.DB for
// viewerDb(raw, viewer), so every handler that reads `E(c).DB` reads through
// it without naming a filter.
//
// HOW. prepare(sql) prepends a WITH clause whose common table expressions
// carry the REAL names of the scoped tables, each defined as
//   meetings AS NOT MATERIALIZED (SELECT * FROM main.meetings WHERE <rule>)
// SQLite resolves an unqualified table name to a same-named CTE before the
// schema, so `FROM meetings`, a JOIN, a subquery and INSERT..SELECT all read
// only the viewer's rows. Proven on SQLite 3.50 (scratch probe cte_shadow.py)
// and on the prod D1 engine, read-only (hub145-seat-L1.md).
//
// WHAT THE SHADOW DOES NOT COVER, and what covers it here:
//   - A DML TARGET resolves to the real table, not the CTE: `UPDATE meetings
//     SET .. WHERE id = ?` would change a row the viewer cannot read. So an
//     UPDATE or DELETE whose target is scoped gets `<key> IN (SELECT <key>
//     FROM <table>)` ANDed into its WHERE, and that subquery reads the CTE.
//   - An INSERT into a child of a hidden parent (an agenda item on someone
//     else's meeting) is not a read at all. The handler checks the parent
//     through this handle first; api/routes/viewer-sweep.test.ts drives every
//     write route at a hidden sentinel to catch the one that does not.
//   - `main.<table>` names the real table. scopeSql refuses SQL that does
//     (and temp., sqlite_master, pragma, attach): a loud 500, never a pass.
//   - A view body reads the real tables. The migration chain defines no view
//     (table-scope.test.ts pins that); the first view must be classified.
//   - exec / dump / withSession run SQL this module cannot rewrite. They throw.
//
// WHO IS SCOPED. Three viewer kinds, built only by the constructors below:
//   - service: the PB Bearer key. Never scoped; viewerDb returns the raw
//     handle. PB sync, Hermes and every PB read depend on seeing everything.
//   - person:  a signed-in member. Each table's rule decides from the person's
//     slug, email and `pi` flag; a rule that returns null leaves that table
//     whole for that person. In Lane A the meetings rule returns null for a
//     PI, so Nick's session is unchanged. A person with no restricted table
//     gets the raw handle too (no prefix, no cost).
//
// COST. For a scoped person, EVERY statement that names a scoped table is
// prefixed, not only meeting reads: activity_entries, activity_log,
// agenda_items, hub_decisions and file_attachments rules read the meetings
// CTE, so the activity feeds pay too. Measured on prod D1 for Casey (#145
// review): `SELECT COUNT(*) FROM meetings` rows_read 73 -> 533; activity_log
// top 50 rows_read 50 -> 621. Nick and the PB key get the raw handle and pay
// nothing. Statements naming no scoped table are passed through unchanged.
//   - nobody:  no identity (anonymous, a signed-in non-member on a public GET,
//     a credential-less local caller). Every scoped table is empty.
// Service and person are separate kinds on purpose: Lane B scopes Nick's
// browser session (projects he has joined, plus an admin toggle) without
// touching the PB key.

import { TABLE_SCOPE, type HubTable as ScopedTable } from './table-scope'

declare const viewerBrand: unique symbol

export type Viewer =
  | { readonly kind: 'service'; readonly [viewerBrand]: true }
  | {
      readonly kind: 'person'
      readonly slug: string
      readonly email: string
      readonly pi: boolean
      readonly [viewerBrand]: true
    }
  | { readonly kind: 'nobody'; readonly [viewerBrand]: true }

/** A viewer a table rule can be asked about: never the service. */
export type ScopedViewer = Exclude<Viewer, { kind: 'service' }>

// Characters a viewer literal may never carry. Quotes are escaped anyway
// (sqlString), so this is not the SQL-injection guard; it keeps a literal free
// of anything that would make the SQL text ambiguous to a reader or to the
// d1Adapter's textual `?NNN` scan (a `?` followed by digits): control
// characters, `?` and backslash.
function hasForbiddenChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || c === 0x7f || c === 0x3f /* ? */ || c === 0x5c /* backslash */) return true
  }
  return false
}

export function serviceViewer(): Viewer {
  return { kind: 'service' } as Viewer
}

export function nobodyViewer(): Viewer {
  return { kind: 'nobody' } as Viewer
}

/** A signed-in member. Throws on a slug or email no team_members row could hold. */
export function personViewer(args: { slug: string; email: string | null | undefined; pi: boolean }): Viewer {
  const slug = (args.slug ?? '').trim().toLowerCase()
  const email = (args.email ?? '').trim().toLowerCase()
  if (!slug || slug === 'anonymous') throw new Error('personViewer: a person needs a real slug')
  if (hasForbiddenChar(slug) || hasForbiddenChar(email)) {
    throw new Error('personViewer: slug or email carries a forbidden character')
  }
  if (email && !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('personViewer: malformed email')
  return { kind: 'person', slug, email, pi: args.pi } as Viewer
}

/** A SQL string literal. */
export function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

// ── SQL scanning ─────────────────────────────────────────────────────────────
//
// A small lexer, enough to find top-level keywords: it skips string literals,
// quoted identifiers, comments, and tracks parenthesis depth. It is not a
// parser; it never needs to understand an expression, only to know whether a
// keyword sits at depth 0 outside quotes.

interface Tok { word: string; start: number; end: number; depth: number }

function topLevelWords(sql: string): Tok[] {
  const out: Tok[] = []
  let depth = 0
  let i = 0
  const n = sql.length
  while (i < n) {
    const ch = sql[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch
      i++
      while (i < n) {
        if (sql[i] === q) {
          if (sql[i + 1] === q) { i += 2; continue }
          break
        }
        i++
      }
      i++
      continue
    }
    if (ch === '[') {
      const close = sql.indexOf(']', i + 1)
      i = close === -1 ? n : close + 1
      continue
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i)
      i = nl === -1 ? n : nl + 1
      continue
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i + 2)
      i = close === -1 ? n : close + 2
      continue
    }
    if (ch === '(') { depth++; i++; continue }
    if (ch === ')') { depth--; i++; continue }
    if (ch === ';') { out.push({ word: ';', start: i, end: i + 1, depth }); i++; continue }
    if (/[A-Za-z_]/.test(ch)) {
      const start = i
      while (i < n && /[A-Za-z0-9_$]/.test(sql[i])) i++
      out.push({ word: sql.slice(start, i).toLowerCase(), start, end: i, depth })
      continue
    }
    i++
  }
  return out
}

// `main.` / `temp.` in any quoting ("main". [main]. `temp`.), the schema
// tables, pragma, attach/detach.
const FORBIDDEN_SQL = /(?:\b|["`[])(main|temp)["`\]]?\s*\.|\bsqlite_(master|schema|temp_master)\b|\bpragma\b|\battach\b|\bdetach\b/i

export class ScopeRefused extends Error {}

/**
 * Rewrite one statement for a scoped viewer. `active` maps each scoped table
 * this viewer is restricted on to its predicate. Exported for tests.
 */
export function scopeSql(sql: string, active: ReadonlyMap<ScopedTable, string>): string {
  if (active.size === 0) return sql
  const lower = sql.toLowerCase()
  // Only the tables this statement names (as a word), plus what their rules read.
  const named = new Set<ScopedTable>()
  for (const t of active.keys()) {
    if (new RegExp(`\\b${t}\\b`).test(lower)) named.add(t)
  }
  if (named.size === 0) return sql
  if (FORBIDDEN_SQL.test(sql)) {
    throw new ScopeRefused('viewer-db: SQL that names main./temp./sqlite_/pragma/attach is refused for a scoped viewer')
  }
  // A quoted identifier naming a scoped table ("meetings", [meetings],
  // `meetings`) is refused rather than reasoned about: no route writes one,
  // and the rewriter below only reads bare words.
  for (const t of named) {
    if (new RegExp(`["\`[]${t}["\`\\]]`, 'i').test(sql)) {
      throw new ScopeRefused(`viewer-db: a quoted identifier naming scoped table ${t} is refused for a scoped viewer`)
    }
  }
  const scanned = topLevelWords(sql)
  const semi = scanned.findIndex((w) => w.word === ';' && w.depth === 0)
  if (semi !== -1 && scanned.slice(semi + 1).some((w) => w.word !== ';')) {
    throw new ScopeRefused('viewer-db: more than one statement in one prepare() is refused for a scoped viewer')
  }
  for (const t of [...named]) {
    const s = TABLE_SCOPE[t]
    if (s.kind === 'scoped') for (const d of s.dependsOn) if (active.has(d)) named.add(d)
  }
  // Dependencies first: a CTE may read an earlier one (activity_log reads meetings).
  const ordered = [...active.keys()].filter((t) => named.has(t))
  ordered.sort((a, b) => depRank(a) - depRank(b))
  const ctes = ordered
    .map((t) => `${t} AS NOT MATERIALIZED (SELECT * FROM main.${t} AS ${t} WHERE ${active.get(t)})`)
    .join(', ')

  const words = topLevelWords(sql)
  const first = words[0]
  if (!first) throw new ScopeRefused('viewer-db: empty statement')
  if (first.word === 'with') {
    // Splice ours in front of the route's own CTEs; keep RECURSIVE first.
    const second = words[1]
    const recursive = second?.word === 'recursive'
    const afterKw = recursive ? second.end : first.end
    const head = sql.slice(0, afterKw)
    return applyDmlRestriction(`${head} ${ctes},${sql.slice(afterKw)}`, active, named)
  }
  if (!['select', 'insert', 'update', 'delete', 'replace', 'values'].includes(first.word)) {
    throw new ScopeRefused(`viewer-db: statement kind "${first.word}" is refused for a scoped viewer`)
  }
  return applyDmlRestriction(`${sql.slice(0, first.start)}WITH ${ctes} ${sql.slice(first.start)}`, active, named)
}

function depRank(t: ScopedTable): number {
  const s = TABLE_SCOPE[t]
  return s.kind === 'scoped' ? s.dependsOn.length : 0
}

// UPDATE / DELETE whose target is a scoped table: AND `<key> IN (SELECT <key>
// FROM <table>)` into the top-level WHERE (or add one), so a row the viewer
// cannot read cannot be changed either. The subquery reads the CTE.
function applyDmlRestriction(sql: string, active: ReadonlyMap<ScopedTable, string>, named: Set<ScopedTable>): string {
  const words = topLevelWords(sql)
  // Skip a leading WITH .. clause: the DML keyword is the first top-level
  // update/delete/insert/replace/select after it.
  const verbIdx = words.findIndex((w) => w.depth === 0 && ['select', 'insert', 'update', 'delete', 'replace', 'values'].includes(w.word))
  if (verbIdx === -1) return sql
  const verb = words[verbIdx]
  const scopedTarget = (t: Tok | undefined) => !!t && named.has(t.word as ScopedTable) && active.has(t.word as ScopedTable)
  // INSERT / REPLACE: an INSERT that only adds a row is the handler's to
  // guard (parent check). One that can REPLACE or UPDATE an existing row
  // reaches a row the viewer may not see, so it is refused on a scoped table.
  if (verb.word === 'insert' || verb.word === 'replace') {
    let j = verbIdx + 1
    let replaces = verb.word === 'replace'
    if (words[j]?.word === 'or') { replaces = replaces || words[j + 1]?.word === 'replace'; j += 2 }
    if (words[j]?.word === 'into') j += 1
    const target = words[j]
    if (!scopedTarget(target)) return sql
    const tail = words.slice(j + 1).filter((w) => w.depth === 0)
    const upserts = tail.some((w, k) => w.word === 'do' && tail[k + 1]?.word === 'update')
    if (replaces || upserts) {
      throw new ScopeRefused(`viewer-db: REPLACE / ON CONFLICT DO UPDATE on scoped table ${target!.word} is refused for a scoped viewer`)
    }
    return sql
  }
  let target: Tok | undefined
  if (verb.word === 'update') {
    let j = verbIdx + 1
    if (words[j]?.word === 'or') j += 2
    target = words[j]
  } else if (verb.word === 'delete') {
    if (words[verbIdx + 1]?.word === 'from') target = words[verbIdx + 2]
  } else {
    return sql
  }
  if (!target) return sql
  const table = target.word as ScopedTable
  if (!named.has(table) || !active.has(table)) return sql
  // The guard names the target by its table name, so an alias (UPDATE
  // meetings AS m / DELETE FROM meetings m) would leave it pointing at the
  // CTE. No route aliases a DML target; refuse rather than guess.
  const next = words.find((w) => w.start >= target!.end && w.depth === 0)
  const allowedNext = verb.word === 'update' ? ['set', 'indexed', 'not'] : ['where', 'returning', 'order', 'limit', 'indexed', 'not', ';']
  if (next && !allowedNext.includes(next.word)) {
    throw new ScopeRefused(`viewer-db: an aliased ${verb.word.toUpperCase()} target (${table} ${next.word}) is refused for a scoped viewer`)
  }
  const scope = TABLE_SCOPE[table]
  if (scope.kind !== 'scoped') return sql
  const rest = words.slice(verbIdx + 1).filter((w) => w.depth === 0)
  const where = rest.find((w) => w.word === 'where' && w.start > target!.end)
  const guard = `${table}.${scope.key} IN (SELECT ${scope.key} FROM ${table})`
  const tailKw = (from: number) => rest.find((w, k) =>
    w.start > from && (w.word === 'returning' || w.word === 'limit'
      || (w.word === 'order' && rest[k + 1]?.word === 'by')))
  if (where) {
    const tail = tailKw(where.end)
    const endAt = tail ? tail.start : trimmedEnd(sql)
    return `${sql.slice(0, where.end)} ${guard} AND (${sql.slice(where.end, endAt)})${tail ? ' ' : ''}${sql.slice(endAt)}`
  }
  const tail = tailKw(target.end)
  const endAt = tail ? tail.start : trimmedEnd(sql)
  return `${sql.slice(0, endAt)} WHERE ${guard}${tail ? ' ' : ''}${sql.slice(endAt)}`
}

function trimmedEnd(sql: string): number {
  let e = sql.length
  while (e > 0 && /[\s;]/.test(sql[e - 1])) e--
  return e
}

/** The predicates this viewer is restricted by, keyed by table. Empty = unscoped. */
export function activeScopes(viewer: Viewer): Map<ScopedTable, string> {
  const out = new Map<ScopedTable, string>()
  if (viewer.kind === 'service') return out
  for (const [t, s] of Object.entries(TABLE_SCOPE) as [ScopedTable, (typeof TABLE_SCOPE)[ScopedTable]][]) {
    if (s.kind !== 'scoped') continue
    const where = s.where(viewer)
    if (where !== null) out.set(t, where)
  }
  return out
}

/**
 * The handle a request runs on. Service, and a person with no restricted
 * table, get `raw` itself. Everyone else gets a wrapper whose prepare()
 * scopes the SQL; bind/first/all/run and batch() are D1's own, so the bind
 * positions, the batch transaction and the error shapes are unchanged.
 */
export function viewerDb(raw: D1Database, viewer: Viewer): D1Database {
  const active = activeScopes(viewer)
  if (active.size === 0) return raw
  const refuse = (what: string) => () => {
    throw new ScopeRefused(`viewer-db: ${what} is not available on a scoped handle`)
  }
  const scoped = {
    prepare: (sql: string) => raw.prepare(scopeSql(sql, active)),
    // Statements were built by this handle's prepare(), so they are scoped already.
    batch: (stmts: D1PreparedStatement[]) => raw.batch(stmts),
    exec: refuse('exec'),
    dump: refuse('dump'),
    withSession: refuse('withSession'),
  }
  return scoped as unknown as D1Database
}
