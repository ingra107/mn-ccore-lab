// Phase 3.1 detection invariant (2026-05-04):
// Prevents raw INSERT/UPDATE/DELETE on tasks or projects in route files.
// All writes must go through applyMutation() in mutations.ts.
//
// This test is a grep guard — it fails CI if any route file re-introduces
// a direct SQL write to the domain tables, closing the class of bugs that
// Phase 3.1 was designed to eliminate (conflict-semantics bypass).
//
// Exemptions built in:
//  - Lines starting with // or * (comments)
//  - Strings containing 'applyMutation' (the approved path)
//  - handleBatchUpdateTasks body (hub-internal multi-row IN-clause batch path;
//    not routable through single-row applyMutation)
//
// Maintenance: if you add a new route file that writes tasks/projects, add it
// to routeFiles below AND route through applyMutation().
// Note: handleSyncBulkTasks deleted 2026-05-12 (codex audit #8); exemption removed.
//       handleAcknowledgeTask exemption removed 2026-06-14 — HUB-7 routed it
//       through applyMutation, so it no longer does a raw write; the invariant
//       now guards it like any other function.

import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, it, expect } from 'vitest'

const routeFiles = [
  'api/routes/tasks.ts',
  'api/routes/projects.ts',
  'api/routes/pb-sector.ts',
]

// Raw write patterns that are BANNED outside mutations.ts.
const BANNED_PATTERNS = [
  /INSERT\s+INTO\s+tasks\b/i,
  /INSERT\s+INTO\s+projects\b/i,
  /UPDATE\s+tasks\s+SET/i,
  /UPDATE\s+projects\s+SET/i,
  /DELETE\s+FROM\s+tasks\s+WHERE/i,
  /DELETE\s+FROM\s+projects\s+WHERE/i,
]

describe('Phase 3.1 invariant: no raw writes outside mutations.ts', () => {
  for (const file of routeFiles) {
    it(`${file} has no banned raw writes on tasks or projects`, () => {
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')

      // Track whether we're inside a batch/bulk function body that is
      // explicitly exempted from the invariant:
      //   - handleBatchUpdateTasks: multi-row IN-clause batch path; per-row
      //     applyMutation conversion deferred (post-Phase-3.1 task).
      // (handleSyncBulkTasks deleted 2026-05-12; exemption removed.
      //  handleAcknowledgeTask exemption removed 2026-06-14 — HUB-7 routed it
      //  through applyMutation, so the invariant guards it now.)
      let insideBulkHandler = false
      let braceDepth = 0

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()

        // Detect entry into exempted bulk/batch handlers
        if (
          trimmed.includes('async function handleBatchUpdateTasks')
        ) {
          insideBulkHandler = true
          braceDepth = 0
        }

        if (insideBulkHandler) {
          // Track brace depth to know when the function ends.
          for (const ch of line) {
            if (ch === '{') braceDepth++
            else if (ch === '}') {
              braceDepth--
              if (braceDepth <= 0) {
                insideBulkHandler = false
                break
              }
            }
          }
          if (insideBulkHandler) continue // skip lines inside bulk handler
        }

        // Skip comment lines
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

        // Exempt: cascade FK-nullification (project cascade-clean NULLs tasks.project_id).
        // This is a multi-row dereference, not a content mutation — not routable
        // through single-row applyMutation. Documented in handleDeleteProject.
        if (trimmed.includes('project_id = NULL')) continue

        // Check each banned pattern
        for (const re of BANNED_PATTERNS) {
          if (re.test(line)) {
            throw new Error(
              `${file}:${i + 1} contains banned raw write (Phase 3.1 invariant violated):\n  ${line.trim()}\n` +
              'Use applyMutation() instead. If this is a legitimate migration path, gate behind HUB_BULK_MIGRATION_MODE=1.'
            )
          }
        }
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Single-door invariant for mutations.ts (2026-09-24, after Hub a94c50fb).
//
// a94c50fb made commitRowWrite the one door for a mutation's row write: the
// UPDATE / soft-delete, its dependents and its processed_mutations receipt go
// in ONE D1 batch with a compare-and-swap on the row the verdict was read
// from. Nothing held that shape but a reader's eye: a new
// `env.DB.prepare('UPDATE tasks ...').run()` in a decide function would put a
// write back outside the transaction and every test would stay green.
//
// This parses mutations.ts with the TypeScript compiler, so a comment or a
// docstring is never read as code, and holds two rules:
//   1. A statement is EXECUTED (`.run()`, `.batch()`, `.exec()`) only inside a
//      function named in EXECUTORS.
//   2. A write-shaped SQL string (INSERT / REPLACE / UPDATE ... SET / DELETE
//      FROM) appears only in an EXECUTOR, against a table listed for it, or in
//      a BUILDER. A builder assembles SQL for commitRowWrite and may execute
//      nothing (rule 1 holds that).
// A new write outside the door fails here and names the function. Allowing it
// means adding a row below, with its reason, in review.
//
// The EXECUTORS other than commitRowWrite and recordProcessedAtomic are the
// ledger of domain writes that do NOT ride the receipt batch. Also outside it,
// and outside this file's reach: the imported helpers logActivity and
// emitLifecycleActivity, which write activity rows after the commit.

const MUTATIONS_FILE = 'api/routes/mutations.ts'

/**
 * function -> how many statements it executes (exact: one more is a new write
 * site and comes back here for review), the tables it may write ('*' = the
 * mutation's own `${mut.table}`), and why.
 */
const EXECUTORS: Record<string, { runs: number; tables: string[]; reason: string }> = {
  commitRowWrite: {
    runs: 2,
    tables: ['*', 'processed_mutations'],
    reason: 'THE door: row write + dependents + receipt in one CAS-guarded D1 batch, then the receipt body fill',
  },
  recordProcessedAtomic: {
    runs: 2,
    tables: ['processed_mutations'],
    reason: 'receipt-only verdicts (error / conflict / dedup) that write no domain row',
  },
  applyInsert: {
    runs: 1,
    tables: ['*'],
    reason: 'LEDGER. INSERT path: a new row has no prior version for a CAS term; ON CONFLICT DO NOTHING or idempotent upsert, receipt written after',
  },
  meetingDedupAccepted: {
    runs: 1,
    tables: ['tasks'],
    reason: 'LEDGER. PB #8352 declined->pending reset of the dedup winner; its WHERE is its own compare-and-swap',
  },
  advanceProjectMovement: {
    runs: 1,
    tables: ['projects'],
    reason: 'LEDGER. forward-only last_meaningful_movement stamp on the parent project after a task completes (MAX semantics)',
  },
  advanceProjectOwnMovement: {
    runs: 1,
    tables: ['projects'],
    reason: 'LEDGER. the same stamp for a project that itself completed',
  },
  decideAndCommitUpdate: {
    runs: 1,
    tables: ['*'],
    reason: 'LEDGER. upsert-on-miss (UPSERT_ON_MISS_TABLES): the row is absent, so there is no version for a CAS term; the receipt is written after, the pre-a94c50fb shape. The UPDATE of an existing row goes through commitRowWrite',
  },
}

/** Functions that build write SQL for commitRowWrite and must never execute it. */
const BUILDERS: Record<string, string> = {
  applyPatch: 'builds the `UPDATE <table> SET ...` (no WHERE) that commitRowWrite completes and runs',
  decideAndCommitDelete: 'builds the soft-delete SET clause and the gated child-cascade dependents for commitRowWrite',
}

const WRITE_SQL = /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|REPLACE\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM)\b/i
const TARGET = /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM)\s+([\w$.{}]+)/i
const EXEC_METHODS = new Set(['run', 'batch', 'exec'])

/** The outermost named function declaration around a node. */
function enclosingFunction(node: ts.Node): string {
  let cur: ts.Node | undefined = node
  let name = '<module>'
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name) name = cur.name.text
    cur = cur.parent
  }
  return name
}

/** The table a write statement names; '*' for `${mut.table}`. ON CONFLICT ... DO UPDATE SET is part of the INSERT. */
function targetTable(sqlText: string): string | null {
  const m = sqlText.match(TARGET)
  if (!m) return null
  return m[1].includes('mut.table') ? '*' : m[1]
}

function scanMutations(source: string) {
  const sf = ts.createSourceFile(MUTATIONS_FILE, source, ts.ScriptTarget.Latest, true)
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  const execs: Array<{ fn: string; line: number }> = []
  const writes: Array<{ fn: string; line: number; table: string | null; text: string }> = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && EXEC_METHODS.has(node.expression.name.text)) {
      execs.push({ fn: enclosingFunction(node), line: lineOf(node) })
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const text = node.getText(sf)
      if (WRITE_SQL.test(text)) {
        writes.push({ fn: enclosingFunction(node), line: lineOf(node), table: targetTable(text), text: text.replace(/\s+/g, ' ').slice(0, 100) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { execs, writes }
}

function violations(source: string): string[] {
  const { execs, writes } = scanMutations(source)
  const out: string[] = []
  const runsIn = new Map<string, number[]>()
  for (const e of execs) runsIn.set(e.fn, [...(runsIn.get(e.fn) ?? []), e.line])
  for (const [fn, lines] of runsIn) {
    const ex = EXECUTORS[fn]
    if (!ex) out.push(`${MUTATIONS_FILE}:${lines.join(',')} executes a statement in ${fn}(), which is not an allowed executor`)
    else if (lines.length !== ex.runs) out.push(`${MUTATIONS_FILE}:${lines.join(',')} ${fn}() executes ${lines.length} statements, allowed ${ex.runs}: a new write site needs review`)
  }
  for (const w of writes) {
    if (BUILDERS[w.fn]) continue
    const ex = EXECUTORS[w.fn]
    if (!ex) {
      out.push(`${MUTATIONS_FILE}:${w.line} write SQL in ${w.fn}(), outside commitRowWrite and the allowlist: ${w.text}`)
    } else if (w.table === null || !ex.tables.includes(w.table)) {
      out.push(`${MUTATIONS_FILE}:${w.line} ${w.fn}() writes ${w.table ?? '<unparsed table>'}, allowed only ${ex.tables.join(', ')}: ${w.text}`)
    }
  }
  return out
}

/** Insert `line` as the first statement of the named function in `source`. */
function plantIn(source: string, fn: string, line: string): string {
  const sf = ts.createSourceFile(MUTATIONS_FILE, source, ts.ScriptTarget.Latest, true)
  const decl = sf.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === fn)
  if (!decl?.body) throw new Error(`plant target ${fn} not found`)
  const brace = decl.body.getStart(sf)
  return source.slice(0, brace + 1) + `\n  ${line}\n` + source.slice(brace + 1)
}

describe('single door: mutations.ts writes rows only through commitRowWrite', () => {
  const source = readFileSync(MUTATIONS_FILE, 'utf-8')

  it('every executed statement and every write-shaped SQL string is in commitRowWrite or the named allowlist', () => {
    expect(violations(source)).toEqual([])
  })

  it('the scan sees the door itself (a scanner that finds nothing proves nothing)', () => {
    const { execs, writes } = scanMutations(source)
    expect(execs.some((e) => e.fn === 'commitRowWrite')).toBe(true)
    expect(writes.some((w) => w.fn === 'applyPatch' && w.table === '*')).toBe(true)
    expect(writes.some((w) => w.fn === 'decideAndCommitDelete' && w.table === 'activity_entries')).toBe(true)
  })

  it('refuses a raw domain write added to a decide function', () => {
    const planted = plantIn(source, 'decideAndCommitUpdate',
      `await env.DB.prepare("UPDATE tasks SET title = 'x' WHERE id = ?").bind(mut.record_id).run();`)
    const v = violations(planted)
    expect(v.some((s) => s.includes('decideAndCommitUpdate() executes 2 statements, allowed 1'))).toBe(true)
    expect(v.some((s) => s.includes('decideAndCommitUpdate() writes tasks'))).toBe(true)
  })

  it('refuses an allowed executor writing a table it was not allowed', () => {
    const planted = plantIn(source, 'meetingDedupAccepted',
      `await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(winnerId).run();`)
    expect(violations(planted).some((s) => s.includes('meetingDedupAccepted() writes projects'))).toBe(true)
  })

  it('refuses a raw write in a function with no allowance at all', () => {
    const planted = plantIn(source, 'readCanonical',
      `await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind('x').run();`)
    const v = violations(planted)
    expect(v.some((s) => s.includes('readCanonical') && s.includes('not an allowed executor'))).toBe(true)
    expect(v.some((s) => s.includes('readCanonical') && s.includes('write SQL'))).toBe(true)
  })

  it('refuses a builder that executes what it builds', () => {
    const planted = plantIn(source, 'applyPatch', `await env.DB.prepare('SELECT 1').run();`)
    expect(violations(planted).some((s) => s.includes('applyPatch') && s.includes('not an allowed executor'))).toBe(true)
  })

  it('does not read a write verb inside a comment', () => {
    const planted = plantIn(source, 'decideAndCommitUpdate', '// an UPDATE tasks SET x = 1 described in prose is not a write')
    expect(violations(planted)).toEqual([])
  })

  it('every allowlist entry is still live (a stale exemption is removed, not kept)', () => {
    const { execs, writes } = scanMutations(source)
    for (const fn of Object.keys(EXECUTORS)) {
      expect(execs.some((e) => e.fn === fn), `${fn} no longer executes anything; drop it from EXECUTORS`).toBe(true)
    }
    for (const fn of Object.keys(BUILDERS)) {
      expect(writes.some((w) => w.fn === fn), `${fn} no longer builds write SQL; drop it from BUILDERS`).toBe(true)
    }
  })
})
