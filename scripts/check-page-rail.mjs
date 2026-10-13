#!/usr/bin/env node
// check-page-rail.mjs -- main + rail layout ratchet (s79, 2026-10-12).
//
// Today, Project and Member each hand-built the same main-column + rail grid
// with their own stack point (1024, 1200, a 12-col grid). Nick picked ONE
// component, src/components/PageWithRail.tsx, whose CSS lives in index.css
// ("PageWithRail"). This gate stops a fourth copy: it counts, per file, the
// lines that put the rail token into a grid template
// (`grid-template-columns` / `gridTemplateColumns` / a Tailwind `grid-cols-[...]`
// holding `--col-rail`), and compares the counts to a committed baseline.
//
//   - a file whose count rises, or a new file with any count, FAILS and prints
//     each file:line;
//   - a count that falls passes with a note to run --update;
//   - --update rewrites the baseline but REFUSES to raise a count.
//
// The baseline holds index.css (the component's own two rules) and
// TodayPage.tsx (the reference page, deliberately not ported: medium-high
// risk, s79 note). Port Today and the baseline entry goes to zero.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { walk } from './check-color-jobs.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
export const BASELINE_PATH = path.join(__dirname, 'check-page-rail.baseline.json')
export const RAIL_GRID = /(?:grid-template-columns|gridTemplateColumns|grid-cols-\[)[^;\n]*--col-rail/

/** Lines in one file that build a rail grid by hand. */
export function findRailGrids(text) {
  const out = []
  text.split('\n').forEach((src, i) => {
    if (RAIL_GRID.test(src)) out.push({ line: i + 1, src: src.trim().slice(0, 140) })
  })
  return out
}

export function scan(root = ROOT) {
  const found = {}
  for (const abs of walk(path.join(root, 'src'))) {
    if (!/\.(tsx?|css)$/.test(abs)) continue
    const rel = path.relative(root, abs).split(path.sep).join('/')
    const hits = findRailGrids(fs.readFileSync(abs, 'utf8'))
    if (hits.length) found[rel] = hits
  }
  return found
}

export function compare(found, baseline) {
  const rises = []
  const falls = []
  for (const [file, hits] of Object.entries(found)) {
    const was = baseline[file] ?? 0
    if (hits.length > was) rises.push({ file, was, now: hits.length, hits })
    else if (hits.length < was) falls.push({ file, was, now: hits.length })
  }
  for (const [file, was] of Object.entries(baseline)) {
    if (!found[file] && was > 0) falls.push({ file, was, now: 0 })
  }
  return { rises, falls }
}

function main() {
  const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : {}
  const found = scan()
  const { rises, falls } = compare(found, baseline)
  if (process.argv.includes('--update')) {
    if (rises.length) {
      console.error('[page-rail] --update refuses to raise a count:', rises.map((r) => r.file).join(', '))
      process.exit(1)
    }
    const next = Object.fromEntries(Object.entries(found).map(([f, h]) => [f, h.length]).sort())
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
    console.log('[page-rail] baseline written')
    return
  }
  if (rises.length) {
    console.error('[page-rail] FAIL: a main + rail grid is hand-built outside <PageWithRail> (src/components/PageWithRail.tsx):')
    for (const r of rises) for (const h of r.hits) console.error(`  ${r.file}:${h.line}  ${h.src}`)
    console.error('Use <PageWithRail> (slots: head, railTop, children, rail; side, railHidden) instead of a new grid.')
    process.exit(1)
  }
  if (falls.length) console.log(`[page-rail] ok; ${falls.map((f) => `${f.file} ${f.was}->${f.now}`).join(', ')} fell: run --update to lock it in`)
  else console.log('[page-rail] ok')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
