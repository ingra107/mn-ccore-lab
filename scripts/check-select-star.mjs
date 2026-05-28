#!/usr/bin/env node
// check-select-star.mjs — Z3.4
//
// Warn on every `SELECT * FROM <table>` inside api/routes/*.ts UNLESS:
//   (a) the route module calls safeRow() or safeTaskRow() (stripping private
//       cols before the response leaves the handler), OR
//   (b) every defineRoute() registration from this module in api/index.ts
//       has auth: 'pi' (PI-only routes are exempt — the caller is already Nick).
//
// Only tables registered in TABLE_PRIVATE_COLS are checked. A SELECT * on
// a table with no private columns is harmless and not flagged.
//
// TABLE_PRIVATE_COLS (from api/lib/task-cols.ts, Z3.1):
//   tasks          → { notes }
//   email_drafts   → { body_text, body_html, thread_id }
//   inbox_events   → { raw_payload_json, notes }
//   regulatory_items → { notes }
//
// Heuristic granularity: per-file, not per-query. If the file has ANY
// SELECT * FROM a private-table AND lacks the safeRow exception, the whole
// file is flagged. This is intentionally coarse — the fix is to add safeRow
// to the file's read paths. Finer per-query analysis is over-engineered for
// this round.
//
// Baseline-aware (same pattern as check-color-string-concat.mjs / Z5.1):
//   - First run writes scripts/check-select-star.baseline.json.
//   - Subsequent runs compare findings vs baseline; only NEW findings print.
//   - Exit non-zero ONLY when --enforce flag is passed.
//   - Default: warn-on-new (exit 0 even when new findings appear, but prints).
//
// Fix guidance: wrap rows in safeRow(table, row) from api/lib/task-cols.ts
// before passing to json({ data: ... }). For tasks specifically, safeTaskRow()
// from api/helpers.ts is also accepted.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ROUTES_DIR = path.join(ROOT, 'api', 'routes')
const INDEX_TS = path.join(ROOT, 'api', 'index.ts')
const BASELINE = path.join(__dirname, 'check-select-star.baseline.json')

const enforce = process.argv.includes('--enforce')

// ── Private-table registry ────────────────────────────────────────────────────
// Mirrors TABLE_PRIVATE_COLS in api/lib/task-cols.ts. When a new table is added
// there, add it here too. (The lint does not import TS source at runtime — keep
// in sync manually; the Z3.1 test catches drift via the test suite.)
const PRIVATE_TABLES = new Set([
  'tasks',
  'email_drafts',
  'inbox_events',
  'regulatory_items',
])

// ── PI-module detection ───────────────────────────────────────────────────────
// Read api/index.ts once; parse defineRoute({...}) blocks; build a map of
// moduleName → [auth levels used]. A module is "PI-only" when every
// defineRoute registration that references one of its exported functions
// carries auth: 'pi'.
//
// Strategy: for each route module file, enumerate its exported function/const
// names, then search index.ts for defineRoute blocks containing those names.
// If at least one non-'pi' registration exists, the module is NOT PI-only.
// If no registrations are found (e.g. an internal-only helper module), the
// module is treated as NOT PI-only (conservative / defaults to checking it).

let indexContent = ''
try {
  indexContent = fs.readFileSync(INDEX_TS, 'utf8')
} catch {
  // Index missing — treat all modules as non-PI.
}

/**
 * Extract top-level exported function/const names from a TypeScript route file.
 * This is a regex heuristic — it catches `export async function foo` and
 * `export const foo = `. Enough for the route modules in this codebase.
 */
function getExportedNames(content) {
  const names = []
  const re = /^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm
  let m
  while ((m = re.exec(content)) !== null) {
    names.push(m[1])
  }
  return names
}

/**
 * Given a handler name that appears in a defineRoute({...handler: (c) => name...})
 * block, return the auth level declared for that block, or null if not found.
 */
function getRouteAuth(handlerName) {
  // Match a defineRoute block that references handlerName anywhere in it.
  // The block is bounded by defineRoute({ ... }); — we look for the closing
  // }); and take everything between the opening ( and it.
  // Simplified: find "handlerName" near a defineRoute context and extract auth.
  const re = new RegExp(
    `defineRoute\\(\\{([^}]|\\{[^}]*\\})*?${handlerName}[\\s\\S]*?\\}\\)`,
    'g',
  )
  const auths = []
  let m
  while ((m = re.exec(indexContent)) !== null) {
    const block = m[0]
    const authMatch = block.match(/auth:\s*['"](\w+)['"]/)
    if (authMatch) auths.push(authMatch[1])
  }
  return auths
}

/**
 * Determine if every defineRoute registration for the given module is PI-only.
 * Returns true only when at least one registration is found AND all are 'pi'.
 */
function isModulePiOnly(routeFilePath) {
  const content = fs.readFileSync(routeFilePath, 'utf8')
  const names = getExportedNames(content)
  if (names.length === 0) return false

  const allAuths = []
  for (const name of names) {
    const auths = getRouteAuth(name)
    allAuths.push(...auths)
  }

  // No registrations found → conservative: not PI-only.
  if (allAuths.length === 0) return false

  // All registrations are 'pi' → PI-only.
  return allAuths.every(a => a === 'pi')
}

/**
 * Return true if the file has a safeRow() or safeTaskRow() call.
 * safeRow strips private cols via TABLE_PRIVATE_COLS registry.
 * safeTaskRow is the tasks-specific predecessor (still accepted).
 */
function usesSafeRowGuard(content) {
  return /\bsafeRow\s*\(/.test(content) || /\bsafeTaskRow\s*\(/.test(content)
}

// ── Main scan ─────────────────────────────────────────────────────────────────
// SELECT * FROM <table> — case-insensitive, allows whitespace between tokens.
const SELECT_STAR_RE = /\bSELECT\s+\*\s+FROM\s+(\w+)/gi

const findings = []

let routeFiles
try {
  routeFiles = fs.readdirSync(ROUTES_DIR)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
} catch {
  console.error(`check-select-star: cannot read ${ROUTES_DIR}`)
  process.exit(1)
}

for (const file of routeFiles) {
  const fp = path.join(ROUTES_DIR, file)
  let content
  try {
    content = fs.readFileSync(fp, 'utf8')
  } catch {
    continue
  }

  // Exception (b): all handlers are PI-only → skip.
  if (isModulePiOnly(fp)) continue

  // Exception (a): file already uses safeRow / safeTaskRow → skip.
  if (usesSafeRowGuard(content)) continue

  // Scan for SELECT * FROM <private_table>.
  SELECT_STAR_RE.lastIndex = 0
  let m
  while ((m = SELECT_STAR_RE.exec(content)) !== null) {
    const table = m[1]
    if (!PRIVATE_TABLES.has(table)) continue
    const line = content.slice(0, m.index).split('\n').length
    findings.push({
      file: `api/routes/${file}`,
      line,
      table,
      sample: m[0].slice(0, 80),
    })
  }
}

// Stable sort for deterministic baseline diffs.
findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

// ── Baseline compare / write ──────────────────────────────────────────────────
const sig = (f) => `${f.file}:${f.line}:${f.table}`

if (fs.existsSync(BASELINE)) {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  const baselineSigs = new Set(baseline.map(sig))
  const newFindings = findings.filter(f => !baselineSigs.has(sig(f)))

  if (newFindings.length > 0) {
    console.error('check-select-star: NEW offenders detected (not in baseline):')
    for (const f of newFindings) {
      console.error(`  ${f.file}:${f.line}  [${f.table}]  ${f.sample}`)
    }
    console.error('')
    console.error('Fix: wrap the row in safeRow(table, row) from api/lib/task-cols.ts')
    console.error('  before passing to json({ data: ... }). For the tasks table,')
    console.error('  safeTaskRow() from api/helpers.ts is also accepted.')
    console.error('')
    console.error('Alternatively, if the route is PI-only, set auth: "pi" on')
    console.error('  every defineRoute({ ... }) registration in api/index.ts.')
    if (enforce) {
      process.exit(1)
    } else {
      console.error('(warn-only mode; pass --enforce to fail CI)')
    }
  } else {
    const knownCount = findings.length
    const baselineCount = baseline.length
    const resolved = Math.max(0, baselineCount - knownCount)
    if (resolved > 0) {
      console.log(`check-select-star: ${resolved} offender(s) resolved. ${knownCount} remaining in baseline.`)
    } else {
      console.log(`check-select-star: ${knownCount} known offender(s), 0 new.`)
    }
  }
} else {
  // First run — write baseline.
  fs.writeFileSync(BASELINE, JSON.stringify(findings, null, 2) + '\n')
  console.log(`check-select-star: baseline created with ${findings.length} entries.`)
  if (findings.length > 0) {
    console.log('Known offenders by table:')
    const byTable = {}
    for (const f of findings) byTable[f.table] = (byTable[f.table] || 0) + 1
    for (const [t, n] of Object.entries(byTable).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${t}`)
    }
    console.log('')
    console.log('These are existing violations — new ones beyond this baseline will')
    console.log('be flagged on subsequent runs. Fix by wrapping rows in safeRow().')
  }
}
