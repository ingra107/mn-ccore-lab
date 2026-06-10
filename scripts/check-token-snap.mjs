#!/usr/bin/env node
// check-token-snap.mjs — P1-8 (2026-06-09)
//
// Flags inline style-prop px literals that exactly match a spacing/radius
// design token, so they can be snapped to the token (`--sp-*` / `--radius-*`).
// Reads "almost-aligned everywhere" — this lint makes the snap enforceable
// without an eyeball pass.
//
// Scope (deliberately narrow — only props where a token cleanly applies):
//   • borderRadius: <Npx>        → --radius-{sm 4 / md 6 / lg 8 / xl 12 / 2xl 16}
//   • padding / paddingTop / …   → --sp-{xs 4 / sm 8 / md 12 / lg 16 / xl 24 / 2xl 32}
//   • margin / marginTop / …     → --sp-*
//   • gap / columnGap / rowGap   → --sp-*
//
// Only SINGLE-VALUE numeric px literals are flagged (e.g. `padding: 12` or
// `padding: '12px'`). Multi-value shorthands ('8px 16px'), calc(), clamp(),
// var(), env(), and %/rem/vw values are NOT flagged — a token rarely maps 1:1
// to those and forcing it causes churn/regression. Values with no exact token
// match (e.g. 13px, 7px, 10px, 20px) are NOT flagged here — they're spacing
// drift but snapping them changes the rendered value (out of scope; eyeball).
//
// Baseline-aware (mirrors check-color-string-concat.mjs): first run writes
// check-token-snap.baseline.json; later runs report only NEW offenders.
// WARN-mode by default; pass --enforce to fail CI on new offenders.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const BASELINE = path.join(__dirname, 'check-token-snap.baseline.json')

const enforce = process.argv.includes('--enforce')

// px value → token (exact matches only — no fuzzy snapping of rendered values).
const RADIUS_TOKENS = { 4: '--radius-sm', 6: '--radius-md', 8: '--radius-lg', 12: '--radius-xl', 16: '--radius-2xl' }
const SPACING_TOKENS = { 4: '--sp-xs', 8: '--sp-sm', 12: '--sp-md', 16: '--sp-lg', 24: '--sp-xl', 32: '--sp-2xl' }

// Props whose px values should funnel through a spacing token.
const SPACING_PROPS = [
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'gap', 'columnGap', 'rowGap',
]

// Match: `<prop>: <num>` or `<prop>: '<num>px'` or `<prop>: "<num>px"`.
// Capture group 2 = the numeric value. Negative lookahead avoids matching
// `paddingTop` when scanning for `padding` (word-boundary on the prop side via
// the explicit alternation list + a `:` immediately after the prop name).
function buildPropRegex(prop) {
  // value forms: 12   |   '12px'   |   "12px"
  return new RegExp(`\\b${prop}\\s*:\\s*(?:(\\d+)\\b(?!px)|['"](\\d+)px['"])`, 'g')
}

const spacingRegexes = SPACING_PROPS.map((p) => ({ prop: p, re: buildPropRegex(p) }))
const radiusRegex = buildPropRegex('borderRadius')

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, f.name)
    if (f.isDirectory()) {
      if (/node_modules|dist|\.cache|__pycache__|coverage/.test(f.name)) continue
      walk(fp, out)
    } else if (/\.(ts|tsx)$/.test(f.name)) {
      out.push(fp)
    }
  }
  return out
}

const findings = []
for (const fp of walk(SRC)) {
  const content = fs.readFileSync(fp, 'utf8')
  const relPath = path.relative(ROOT, fp).replace(/\\/g, '/')

  const scan = (regex, prop, tokenMap, kind) => {
    regex.lastIndex = 0
    let m
    while ((m = regex.exec(content)) !== null) {
      const num = Number(m[1] ?? m[2])
      const token = tokenMap[num]
      if (!token) continue // no exact token — not flagged (eyeball drift)
      const line = content.slice(0, m.index).split('\n').length
      findings.push({ file: relPath, line, kind, sample: `${prop}: ${num}px → var(${token})` })
    }
  }

  for (const { prop, re } of spacingRegexes) scan(re, prop, SPACING_TOKENS, 'spacing-px-literal')
  scan(radiusRegex, 'borderRadius', RADIUS_TOKENS, 'radius-px-literal')
}

// Dedupe (same file:line:kind:sample can appear twice if a prop matches twice).
const seen = new Set()
const deduped = findings.filter((f) => {
  const k = `${f.file}:${f.line}:${f.kind}:${f.sample}`
  if (seen.has(k)) return false
  seen.add(k)
  return true
})
deduped.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

const sig = (f) => `${f.file}:${f.line}:${f.kind}:${f.sample}`

if (fs.existsSync(BASELINE)) {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  const baselineSigs = new Set(baseline.map(sig))
  const newFindings = deduped.filter((f) => !baselineSigs.has(sig(f)))
  if (newFindings.length > 0) {
    console.error('check-token-snap: NEW px literals that match a design token (not in baseline):')
    for (const f of newFindings) {
      console.error(`  ${f.file}:${f.line}  [${f.kind}]  ${f.sample}`)
    }
    console.error('')
    console.error('Fix: replace the px literal with the matching token, e.g.')
    console.error("  padding: 12   →   padding: 'var(--sp-md)'")
    console.error("  borderRadius: 8   →   borderRadius: 'var(--radius-lg)'")
    if (enforce) process.exit(1)
    else console.error('(warn-only mode; pass --enforce to fail CI)')
  } else {
    console.log(`check-token-snap: ${deduped.length} known site(s), 0 new.`)
  }
} else {
  fs.writeFileSync(BASELINE, JSON.stringify(deduped, null, 2) + '\n')
  console.log(`check-token-snap: baseline created with ${deduped.length} entries.`)
  if (deduped.length > 0) {
    const byKind = {}
    for (const f of deduped) byKind[f.kind] = (byKind[f.kind] || 0) + 1
    console.log('By kind:')
    for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${k}`)
    }
  }
}
