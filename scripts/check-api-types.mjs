#!/usr/bin/env node
// check-api-types.mjs — typecheck the WORKER, failing only on NEW errors.
//
// WHY THIS EXISTS
// `tsc -b` covers tsconfig.app.json ("src") + vite.config.ts. The entire api/
// directory — every route handler, the mutation layer, the activity primitive —
// was typechecked by NOTHING in package.json. That is not theoretical: the #98
// reply endpoint shipped testing `actor.ok` on a `{ slug } | { error }` union
// (a plain TS2339), 500'd on every request in production, and was caught only
// by an end-to-end probe afterwards.
//
// WHY A BASELINE INSTEAD OF A CLEAN GATE
// Turning the check on cold reports ~149 pre-existing errors. Blocking on those
// would mean the gate never lands, and a permanently-red advisory check is one
// nobody reads — so it would not catch the next bug either. This fails only on
// errors NOT already in the baseline, which makes it useful from day one and
// ratchets: as debt is paid down, refresh with --update and the floor drops.
//
// Signatures deliberately EXCLUDE line/column so unrelated edits above an
// existing error don't churn the baseline; a repeat of the same error in the
// same file is tracked by count, so adding a second instance still fails.
//
// Usage:
//   node scripts/check-api-types.mjs            # verify (exit 1 on new errors)
//   node scripts/check-api-types.mjs --update    # rewrite the baseline

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const BASELINE = 'scripts/api-types-baseline.json'
const update = process.argv.includes('--update')

let raw = ''
try {
  execSync('npx tsc -p tsconfig.api.json', { encoding: 'utf8', stdio: 'pipe' })
} catch (e) {
  raw = (e.stdout || '') + (e.stderr || '')
}

// tsc line: `api/routes/x.ts(12,34): error TS2339: Message...`
const RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/
// Backlog #966 (2026-07-30): some diagnostics (e.g. a cross-file
// `import("...").Type` reference in an argument-type message) embed the
// ABSOLUTE path tsc resolved the module to, which bakes in the machine's
// home-directory username (Nick runs this repo from two machines, `ingra`
// and `ingra107`). Left raw, the SAME error produces a DIFFERENT signature
// per machine, so a baseline committed from one machine spuriously
// "regresses" the first time the other machine runs the check -- exactly
// the false-red that trains people to stop trusting a ratchet gate.
const normalizeMessage = (msg) =>
  msg.replace(/[A-Za-z]:[\\/]Users[\\/][^\\/]+[\\/]/g, '~/').replace(/\\/g, '/')
const counts = new Map()
for (const line of raw.split(/\r?\n/)) {
  const m = RE.exec(line.trim())
  if (!m) continue
  const [, file, , , code, message] = m
  // Normalize the path separator so a Windows run and a CI run agree.
  const sig = `${file.replace(/\\/g, '/')}|${code}|${normalizeMessage(message).slice(0, 80)}`
  counts.set(sig, (counts.get(sig) || 0) + 1)
}

// Backlog #966 (2026-07-30): a PROGRAM-level tsc error -- one that isn't tied
// to a single file/line/col, e.g. TS2688 "Cannot find type definition file
// for '@cloudflare/workers-types'" when the package is declared in
// package.json but missing from node_modules, or TS18003/TS5023 -- means the
// type program never built at all. RE above only matches per-file
// diagnostics, so a broken compile and a genuinely clean one are otherwise
// INDISTINGUISHABLE: both produce zero matches, so this script would report
// "PASS -- 0 errors" either way. That is exactly what happened here: this
// machine's node_modules was missing @cloudflare/workers-types, and every
// run silently reported a false PASS (once even "debt DROPPED 149 -> 0")
// while tsc had not actually checked a single file. Fail loud instead.
const GLOBAL_ERR_RE = /error (TS\d+):/
const unstructuredErrors = raw
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => GLOBAL_ERR_RE.test(l) && !RE.test(l))
if (unstructuredErrors.length > 0) {
  console.error('[check-api-types] tsc reported a PROGRAM-level error, not a per-file diagnostic:\n')
  for (const l of unstructuredErrors) console.error(`  ${l}`)
  console.error('\nThe type program never built, so the per-file scan below would see zero')
  console.error('matches regardless of whether api/ is actually clean -- refusing to report')
  console.error('PASS or write a baseline against an unbuilt program. Common cause: an ambient')
  console.error("types package (e.g. @cloudflare/workers-types) is declared in package.json")
  console.error('but missing from node_modules -- run `npm install` and re-run this check.')
  process.exit(1)
}

if (update) {
  // The ratchet must only turn one way. Without this the floor is enforced by
  // discipline alone: run --update after a refactor that ADDED errors and the
  // baseline silently rises, which converts the gate into a rubber stamp
  // exactly when it matters most.
  const priorRaw = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
  const priorTotal = Object.values(priorRaw).reduce((a, b) => a + b, 0)
  const newTotal = [...counts.values()].reduce((a, b) => a + b, 0)
  if (newTotal > priorTotal) {
    console.error(`[check-api-types] REFUSING --update: it would RAISE the floor ${priorTotal} -> ${newTotal}.`)
    console.error('Fix the new errors first. The baseline may go down or stay flat, never up.')
    process.exit(1)
  }
  const out = Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(BASELINE, JSON.stringify(out, null, 2) + '\n')
  console.log(`[check-api-types] baseline written: ${counts.size} signature(s), ${[...counts.values()].reduce((a, b) => a + b, 0)} error(s).`)
  process.exit(0)
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
const regressions = []
for (const [sig, n] of counts) {
  const allowed = baseline[sig] || 0
  if (n > allowed) regressions.push({ sig, n, allowed })
}

if (regressions.length > 0) {
  console.error('[check-api-types] NEW worker type error(s) — api/ is typechecked now:\n')
  for (const r of regressions) {
    const [file, code, message] = r.sig.split('|')
    console.error(`  ${file}\n    ${code}: ${message}${r.allowed ? `  (${r.n} occurrences, baseline allows ${r.allowed})` : ''}\n`)
  }
  console.error('Fix the error. Only run --update when you have deliberately')
  console.error('accepted a new baseline (it should normally go DOWN, not up).')
  process.exit(1)
}

const total = [...counts.values()].reduce((a, b) => a + b, 0)
const baseTotal = Object.values(baseline).reduce((a, b) => a + b, 0)
if (total < baseTotal) {
  console.log(`[check-api-types] PASS — and debt DROPPED ${baseTotal} -> ${total}. Run --update to lower the floor.`)
} else {
  console.log(`[check-api-types] PASS — 0 new errors (${total} known, unchanged).`)
}
