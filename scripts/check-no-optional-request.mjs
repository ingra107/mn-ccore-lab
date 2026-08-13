#!/usr/bin/env node
// check-no-optional-request.mjs — Z5.2
//
// Codex P3-amended: ban `request?: Request` in api/routes/*.ts handler
// signatures. The optional-request shape is the type hole that left
// handleInboxEvents and handleRegulatoryIcs fail-closeable-but-not-by-type.
// Z1.6 removed those two; this lint prevents regression.
//
// Baseline-aware: if a baseline file exists, only NEW violations (not in
// baseline) cause exit 1. A site earns a place in the baseline only when
// the code path fails CLOSED on a missing request (403, or a documented
// restrictive fallback) -- see check-no-optional-request.baseline.json for
// each site's reason and file:line. A site that fails OPEN on a missing
// request (returns unscoped data) is a real defect and must NOT be
// baselined; it stays a reported violation until the handler is fixed.
// When a grandfathered site is migrated to a required `request: Request`,
// shrink the baseline and the lint automatically enforces the tighter
// contract.
//
// Usage:
//   node scripts/check-no-optional-request.mjs
//
// Exit 0 — no new violations (baseline-only or none at all).
// Exit 1 — new violations found (not in baseline).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ROUTES = path.join(ROOT, 'api/routes')
const BASELINE_PATH = path.join(__dirname, 'check-no-optional-request.baseline.json')

// Match: `request?: Request` (with optional whitespace around the colon).
// Also catches: `req?: Request`, `r?: Request`, etc. — any identifier followed
// by `?: Request`. Excludes `.test.ts` files (test scaffolding may need the shape).
const RE = /\b(\w+)\?\s*:\s*Request\b/g

const findings = []
for (const file of fs.readdirSync(ROUTES)) {
  if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue
  const fp = path.join(ROUTES, file)
  const content = fs.readFileSync(fp, 'utf8')
  RE.lastIndex = 0
  let m
  while ((m = RE.exec(content)) !== null) {
    const line = content.slice(0, m.index).split('\n').length
    findings.push({ file: `api/routes/${file}`, line, sample: m[0] })
  }
}

// Signature for dedup and baseline comparison.
const sig = (f) => `${f.file}:${f.line}:${f.sample}`

// Deduplicate (safety net — RE shouldn't double-match, but guard anyway).
const seen = new Set()
const deduped = findings.filter(f => {
  const k = sig(f)
  if (seen.has(k)) return false
  seen.add(k)
  return true
})
deduped.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

if (!fs.existsSync(BASELINE_PATH)) {
  // First run: write the baseline and explain what was found.
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(deduped, null, 2) + '\n')
  if (deduped.length === 0) {
    console.log('check-no-optional-request: OK (0 optional-Request handlers). Baseline written (empty).')
  } else {
    console.log(`check-no-optional-request: baseline written with ${deduped.length} grandfathered site(s):`)
    for (const f of deduped) console.log(`  ${f.file}:${f.line}  ${f.sample}`)
    console.log('These sites are grandfathered (cron dual-invoke pattern). New sites will fail lint.')
    console.log('To remove a site from the baseline, fix it then delete its entry from')
    console.log(`  ${path.relative(ROOT, BASELINE_PATH)}`)
  }
  process.exit(0)
}

// Subsequent runs: compare against baseline.
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
const baselineSigs = new Set(baseline.map(sig))
const newViolations = deduped.filter(f => !baselineSigs.has(sig(f)))

if (newViolations.length > 0) {
  console.error('check-no-optional-request: NEW optional Request parameter found (not in baseline):')
  for (const f of newViolations) console.error(`  ${f.file}:${f.line}  ${f.sample}`)
  console.error('')
  console.error('Fix: make request required; use typed wrappers from api/lib/typed-request.ts.')
  console.error('See: docs/superpowers/plans/2026-05-28-primitive-enforcement-plan.md Z1.5/Z1.6.')
  process.exit(1)
}

const grandCount = deduped.filter(f => baselineSigs.has(sig(f))).length
const resolvedCount = baseline.length - grandCount
if (grandCount === 0) {
  console.log('check-no-optional-request: OK (0 optional-Request handlers). All baseline sites resolved.')
} else {
  console.log(`check-no-optional-request: OK — ${grandCount} grandfathered site(s), 0 new.` +
    (resolvedCount > 0 ? ` (${resolvedCount} baseline site(s) resolved — update baseline to shrink it.)` : ''))
}
