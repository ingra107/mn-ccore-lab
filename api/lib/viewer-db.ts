// viewer-db.ts -- a D1 handle that can only see the caller's rows (#145).
//
// The access rule used to be a SQL fragment each route had to remember
// (pbTaskVisibilitySql, canSeePbProject, the canSeePb flag threaded through
// ~20 handlers; all deleted, the last on 2026-10-09). A route that forgot it leaked, silently, and #8842 R6 and
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
//     slug, email, `pi` flag and `allProjects` flag; a rule that returns null
//     leaves that table whole for that person. Projects, tasks and the rows
//     that hang off them follow project membership for EVERY person, a PI
//     included (Lane B, Nick 2026-10-08: "the default should always be only
//     projects that I'm on"). Meetings follow their own rule (owner,
//     attendee, lab audience, granted project; schema-v122) with no PI or
//     admin exemption, so every person is scoped on meetings. The PB-session
//     rule still exempts a PI.
//   - allProjects: the site admin's "show all projects" switch. Only
//     personViewer sets it, and only for SITE_ADMIN_SLUG with the PI flag;
//     for anyone else the request is ignored. It lifts the project rules,
//     nothing else (Nick, 2026-10-09: never the meeting rule). Off unless the
//     request asks.
//
// COST. For a scoped person, EVERY statement that names a scoped table is
// prefixed, not only meeting reads: activity_entries, activity_log,
// agenda_items, hub_decisions and file_attachments rules read the meetings
// CTE, so the activity feeds pay too. Measured on prod D1 for Casey (#145
// review, Lane A rules): `SELECT COUNT(*) FROM meetings` rows_read 73 -> 533;
// activity_log top 50 rows_read 50 -> 621. Since Lane B, Nick's own session
// is scoped too (projects and tasks) and pays the same kind of prefix; since
// schema-v122 "show all projects" keeps the meeting prefix too, so only the
// PB key gets the raw handle.
// Statements naming no scoped table are passed through unchanged.
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
      /** The site admin asked for every project on this request (see SITE_ADMIN_SLUG). */
      readonly allProjects: boolean
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

/**
 * The one person who may switch on "show all projects" (Nick, 2026-10-08:
 * "that should only be for me not for anybody else"; its purpose is cleaning
 * out projects of people who left). Keyed on the slug the server resolved from
 * the session's email AND the PI flag, so neither a client value nor a second
 * PI email reaches it. Not a role: no director, no other PI.
 */
export const SITE_ADMIN_SLUG = 'nick-ingraham'

/** The request header the Projects page's "show all projects" switch sends ('1' = on). */
export const ALL_PROJECTS_HEADER = 'X-Hub-All-Projects'

/** True when this signed-in caller may switch on "show all projects". */
export function isSiteAdmin(args: { slug: string; pi: boolean }): boolean {
  return args.pi && (args.slug ?? '').trim().toLowerCase() === SITE_ADMIN_SLUG
}

/**
 * A signed-in member. Throws on a slug or email no team_members row could hold.
 * `allProjects` is honoured only for the site admin; anyone else asking for it
 * gets an ordinary membership-scoped viewer.
 */
export function personViewer(args: { slug: string; email: string | null | undefined; pi: boolean; allProjects?: boolean }): Viewer {
  const slug = (args.slug ?? '').trim().toLowerCase()
  const email = (args.email ?? '').trim().toLowerCase()
  if (!slug || slug === 'anonymous') throw new Error('personViewer: a person needs a real slug')
  if (hasForbiddenChar(slug) || hasForbiddenChar(email)) {
    throw new Error('personViewer: slug or email carries a forbidden character')
  }
  if (email && !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('personViewer: malformed email')
  const allProjects = args.allProjects === true && isSiteAdmin({ slug, pi: args.pi })
  return { kind: 'person', slug, email, pi: args.pi, allProjects } as Viewer
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

// Keywords after which SQLite reads a TABLE name: FROM / JOIN / INTO / UPDATE /
// TABLE, and the conflict clauses that sit between UPDATE or INSERT and the
// name (UPDATE OR IGNORE "t", INSERT OR REPLACE INTO "t").
const TABLE_POSITION = new Set(['from', 'join', 'into', 'update', 'table', 'ignore', 'rollback', 'abort', 'fail', 'replace'])
// Keywords that end a FROM list at their depth (a comma after them is not a table position).
const ENDS_FROM_LIST = new Set(['where', 'group', 'order', 'limit', 'on', 'using', 'union', 'having', 'set', 'values', 'select', 'returning', 'window', 'except', 'intersect'])

/**
 * The scoped table a quoted identifier names in a table position, or null.
 * A quoted token ("x", 'x', `x`, [x]) is a table position when the token
 * before it, skipping whitespace and comments, is a TABLE_POSITION keyword,
 * or a comma inside a FROM list at the same parenthesis depth (FROM a, "t").
 * Exported for tests.
 */
export function quotedTableInTablePosition(sql: string, names: ReadonlySet<string>): string | null {
  let prev = ''
  let depth = 0
  const fromList = new Map<number, boolean>()
  let i = 0
  const n = sql.length
  while (i < n) {
    const ch = sql[i]
    if (ch === '-' && sql[i + 1] === '-') { const nl = sql.indexOf('\n', i); i = nl === -1 ? n : nl + 1; continue }
    if (ch === '/' && sql[i + 1] === '*') { const c = sql.indexOf('*/', i + 2); i = c === -1 ? n : c + 2; continue }
    if (/\s/.test(ch)) { i++; continue }
    if (ch === "'" || ch === '"' || ch === '`' || ch === '[') {
      const close = ch === '[' ? ']' : ch
      let j = i + 1
      let text = ''
      while (j < n) {
        if (sql[j] === close) {
          if (close !== ']' && sql[j + 1] === close) { text += close; j += 2; continue }
          break
        }
        text += sql[j]
        j++
      }
      const tablePos = TABLE_POSITION.has(prev) || (prev === ',' && fromList.get(depth) === true)
      if (tablePos && names.has(text.trim().toLowerCase())) return text.trim().toLowerCase()
      prev = 'quoted'
      i = j + 1
      continue
    }
    if (ch === '(') { depth++; fromList.set(depth, false); prev = '('; i++; continue }
    if (ch === ')') { fromList.delete(depth); depth--; prev = ')'; i++; continue }
    if (ch === ',') { prev = ','; i++; continue }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < n && /[A-Za-z0-9_$]/.test(sql[j])) j++
      const word = sql.slice(i, j).toLowerCase()
      if (word === 'from' || word === 'join') fromList.set(depth, true)
      else if (ENDS_FROM_LIST.has(word)) fromList.set(depth, false)
      prev = word
      i = j
      continue
    }
    prev = ch
    i++
  }
  return null
}

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
  // A quoted identifier naming a scoped table where SQLite reads a TABLE
  // name ("meetings", [meetings], `meetings`, and 'meetings': SQLite accepts
  // a single-quoted string as an identifier there, so `UPDATE 'meetings'`
  // reaches the real table past the guard) is refused rather than reasoned
  // about. A string VALUE that spells a table, like links.owner_table =
  // 'tasks', is data and passes (Lane B scopes both tasks and projects).
  // quotedTableInTablePosition decides by the token before the quoted name,
  // skipping whitespace and comments (see its comment). No route writes a
  // quoted table name; the compile sweep in viewer-db.test.ts pins that.
  const quoted = quotedTableInTablePosition(sql, named)
  if (quoted) {
    throw new ScopeRefused(`viewer-db: a quoted identifier naming scoped table ${quoted} is refused for a scoped viewer`)
  }
  const scanned = topLevelWords(sql)
  const semi = scanned.findIndex((w) => w.word === ';' && w.depth === 0)
  if (semi !== -1 && scanned.slice(semi + 1).some((w) => w.word !== ';')) {
    throw new ScopeRefused('viewer-db: more than one statement in one prepare() is refused for a scoped viewer')
  }
  // The full dependency closure, not one level: task_files reads tasks, which
  // reads projects. A dependency left out of the WITH clause would resolve to
  // the REAL table inside the CTE that names it, and read every row.
  const work = [...named]
  while (work.length > 0) {
    const s = TABLE_SCOPE[work.pop()!]
    if (s.kind !== 'scoped') continue
    for (const d of s.dependsOn) {
      if (active.has(d) && !named.has(d)) { named.add(d); work.push(d) }
    }
  }
  // Dependencies first: a CTE may read only an earlier one. Depth is the
  // longest dependency chain under the table, so every table sorts after
  // everything it reads.
  const ordered = [...active.keys()].filter((t) => named.has(t))
  ordered.sort((a, b) => depDepth(a) - depDepth(b))
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

const depthMemo = new Map<ScopedTable, number>()
/** Longest dependency chain under `t` (0 = reads no scoped table). Exported for tests. */
export function depDepth(t: ScopedTable, seen: ReadonlySet<ScopedTable> = new Set()): number {
  const memo = depthMemo.get(t)
  if (memo !== undefined) return memo
  if (seen.has(t)) throw new Error(`table-scope: dependency cycle through ${t}`)
  const s = TABLE_SCOPE[t]
  const next = new Set(seen).add(t)
  const d = s.kind === 'scoped' && s.dependsOn.length > 0
    ? 1 + Math.max(...s.dependsOn.map((x) => depDepth(x, next)))
    : 0
  depthMemo.set(t, d)
  return d
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
  const keys = typeof scope.key === 'string' ? [scope.key] : scope.key
  const guard = keys.length === 1
    ? `${table}.${keys[0]} IN (SELECT ${keys[0]} FROM ${table})`
    : `(${keys.map((k) => `${table}.${k}`).join(', ')}) IN (SELECT ${keys.join(', ')} FROM ${table})`
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
