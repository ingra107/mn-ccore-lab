#!/usr/bin/env node
// scripts/check-api-test-fixtures.mjs — #8862: API tests stand on the migrated
// schema, not on a database someone modelled by hand.
//
// On 2026-09-24 a Hub mutation fix wrote NULL into
// processed_mutations.original_response_json, which is TEXT NOT NULL in prod.
// 1432 tests passed: they ran on a hand-rolled fixture whose column was
// nullable, and every prod update and delete would have rolled back. The fix
// was api/test-support/prod-schema-db.ts, a database built from the real
// migration chain. This check keeps new tests on it.
//
// It refuses, in any api/**/*.test.ts outside api/test-support/:
//   ddl          a CREATE TABLE in the test (a hand-modelled schema)
//   engine       any mention of 'better-sqlite3' other than an `import type`
//                line (static import, require, await import) or `new
//                Database(`: a local engine the test builds and shapes itself;
//                prodSchemaDb() is the one constructor
//   seqbatch     withSequentialBatch / boundSetValue (the adapters that let a
//                regex stub pretend to be D1's batch)
//   interpWrite  a stub that branches on write SQL text (startsWith('UPDATE'),
//                /^INSERT/.test(sql), verb === 'DELETE', case 'INSERT', ...):
//                it simulates what a write does. Not applied to a file that
//                imports test-support/prod-schema-db, which may read write SQL
//                off d1Adapter's onExec log to assert on what really ran.
//   stubBatch    a hand-written `batch:` on a stub (D1 batch is the atomic
//                write path; a stub cannot roll back)
//
// EXCEPTIONS names every file that matched when this check landed, each with
// its reason. The list only shrinks: an entry whose file no longer matches (it
// was converted) or no longer exists fails the check until the entry is
// deleted. Adding an entry is a reviewed choice, visible in the diff.
//
// What it cannot see (a Level-2 text scan, not a construction):
//   - a fake that accepts every write without reading its SQL and without a
//     `batch:` property (`run: async () => ({ meta: { changes: 1 } })` behind
//     a vi.fn prepare), or one whose batch is object shorthand `{ prepare,
//     batch }`;
//   - write SQL tested through a regex held in a variable, or SQL assembled
//     from fragments;
//   - a SQL-branching stub inside a file that also imports prod-schema-db
//     (the interpWrite exemption above);
//   - an engine reached without naming the module (a re-export from another
//     helper outside api/test-support).
//
// Runs inside `npm run test:api` via api/test-support/fixture-gate.test.ts
// (CI .github/workflows/vitest.yml, and .githooks/pre-commit when api/ is
// staged). Standalone: `node scripts/check-api-test-fixtures.mjs` (exit 1 on a
// violation; `--list` prints every match with its shapes).

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export const SHAPES = {
  ddl: /\bCREATE\s+(?:VIRTUAL\s+|TEMP(?:ORARY)?\s+)?TABLE\b/i,
  // Any mention of the module outside an `import type` line (classify strips
  // those first): static value import, require(), await import(), or a
  // `new Database(` from a name imported some other way.
  engine: /['"`]better-sqlite3['"`]|\bnew\s+Database\s*\(/,
  seqbatch: /\b(?:withSequentialBatch|boundSetValue)\b/,
  interpWrite: new RegExp(
    [
      // startsWith('UPDATE'), includes("INSERT INTO x"), match(/^DELETE/), indexOf(`UPDATE`)
      /\b(?:startsWith|endsWith|includes|match|test|indexOf|search)\s*\(\s*(?:['"`]|\/)[^)\n]*\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/.source,
      // /^\s*UPDATE .../i.test(sql)
      /\/\^?(?:\\s\*)?\(?(?:\?:)?(?:INSERT|UPDATE|DELETE|REPLACE)[^/\n]*\/[a-z]*\.test\(/.source,
      // verb === 'UPDATE', sql.slice(0, 6) == "INSERT", case 'DELETE':
      /(?:===?|!==?)\s*['"`](?:INSERT|UPDATE|DELETE|REPLACE)\b|\bcase\s+['"`](?:INSERT|UPDATE|DELETE|REPLACE)\b/.source,
    ].join('|'),
    'i',
  ),
  stubBatch: /\bbatch\s*:\s*(?:async\b|\(|vi\.fn|function\b)/,
}

/** Shape names that match a test file's source. Pure. */
export function classify(source) {
  // `import type Database from 'better-sqlite3'` is how a test names the
  // fixture's return type; it builds nothing.
  const src = source.replace(/^\s*import\s+type\b[^;\n]*from\s+['"]better-sqlite3['"];?[ \t]*$/gm, '')
  // A file on the migrated fixture may branch on write SQL text to assert on
  // what the real engine ran (d1Adapter's onExec log); that is observation,
  // not simulation. Its other shapes (a stub batch, a local engine, DDL, the
  // sequential-batch adapter) are still refused.
  const onFixture = /from\s+['"][^'"]*test-support\/prod-schema-db['"]/.test(src)
  return Object.entries(SHAPES)
    .filter(([k, re]) => !(k === 'interpWrite' && onFixture) && re.test(src))
    .map(([k]) => k)
}

// Every file that matched when #8862 landed (2026-09-30). Reason first, then
// what converting it needs. Delete an entry when its file stops matching.
const UNCONVERTED = 'unconverted write-path fake: move onto prodSchemaDb()/d1Adapter and assert stored rows + receipts'
export const EXCEPTIONS = new Map([
  ['api/lib/activity-entry.test.ts', UNCONVERTED],
  ['api/lib/artifact-link-mirror.test.ts', UNCONVERTED],
  ['api/lib/field-authority.contract.test.ts', 'stub batch around a field-authority contract; convert with the mutation suites'],
  ['api/routes/mutations.dependency-failed-recovery.test.ts', UNCONVERTED],
  ['api/routes/mutations.fix7-integration.test.ts', UNCONVERTED],
  ['api/routes/mutations.infra-error.test.ts', 'fault injection around the batch; d1Adapter failSql/beforeBatch hooks can carry it'],
  ['api/routes/mutations.partial-batch.test.ts', 'fault injection around the batch; d1Adapter failSql/beforeBatch hooks can carry it'],
  ['api/routes/mutations.tombstone-cascade.test.ts', UNCONVERTED],
  ['api/schema-v98-tasks-completion-triad-guard.test.ts', 'migration test: applies the v98 file to a pre-v98 table on purpose; the migrated fixture already carries the guard, so this subject cannot use it'],
])

function walk(dir, out) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue
    const p = join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (ent.name.endsWith('.test.ts')) out.push(p)
  }
  return out
}

/** Scan api/ under `root`. Returns { scanned, matches, violations, stale }. */
export function checkApiTestFixtures(root = REPO_ROOT, exceptions = EXCEPTIONS) {
  const files = walk(join(root, 'api'), [])
    .map((p) => relative(root, p).split(sep).join('/'))
    .filter((f) => !f.startsWith('api/test-support/'))
    .sort()
  const matches = []
  const violations = []
  for (const f of files) {
    const shapes = classify(readFileSync(join(root, f), 'utf8'))
    if (shapes.length === 0) continue
    matches.push({ file: f, shapes })
    if (!exceptions.has(f)) violations.push({ file: f, shapes })
  }
  const matched = new Set(matches.map((m) => m.file))
  const stale = [...exceptions.keys()].filter((f) => !matched.has(f)).map((f) => ({
    file: f, why: existsSync(join(root, f)) ? 'no longer matches (converted?)' : 'file does not exist',
  }))
  return { scanned: files.length, matches, violations, stale }
}

function main() {
  const r = checkApiTestFixtures()
  if (process.argv.includes('--list')) {
    for (const m of r.matches) console.log(`${m.file}\t${m.shapes.join(',')}`)
  }
  console.log(`[check-api-test-fixtures] scanned ${r.scanned} api test files; ${r.matches.length} match a fake-DB shape; ${EXCEPTIONS.size} excepted`)
  for (const v of r.violations) {
    console.error(`NEW FAKE DB: ${v.file} [${v.shapes.join(', ')}] -- build on api/test-support/prod-schema-db.ts (prodSchemaDb + d1Adapter)`)
  }
  for (const s of r.stale) {
    console.error(`STALE EXCEPTION: ${s.file} ${s.why} -- delete its EXCEPTIONS entry in scripts/check-api-test-fixtures.mjs`)
  }
  process.exit(r.violations.length || r.stale.length ? 1 : 0)
}

// Entry check by file NAME, not full path: a full-path comparison misfires
// through the C:\Users\ingra107 -> C:\Users\ingra junction (the reason
// scripts/schema-chain.ts was split out), and a misfire here would exit 0
// having checked nothing.
if (/check-api-test-fixtures\.mjs$/.test(process.argv[1] ?? '')) main()
