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
const counts = new Map()
for (const line of raw.split(/\r?\n/)) {
  const m = RE.exec(line.trim())
  if (!m) continue
  const [, file, , , code, message] = m
  // Normalize the path separator so a Windows run and a CI run agree.
  const sig = `${file.replace(/\\/g, '/')}|${code}|${message.slice(0, 80)}`
  counts.set(sig, (counts.get(sig) || 0) + 1)
}

if (update) {
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
