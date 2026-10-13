#!/usr/bin/env node
// check-page-rail.mjs -- main + rail layout ratchet (s79, 2026-10-12).
//
// Today, Project and Member each hand-built the same main-column + rail grid
// with their own stack point (1024, 1200, a 12-col grid). Nick picked ONE
// component, src/components/PageWithRail.tsx, whose CSS lives in index.css
// ("PageWithRail"). This gate stops a fourth copy. Per file it counts marks of
// a hand-built main + rail layout and compares the counts to a committed
// baseline. Three shapes:
//   rail-token  any use of `var(--col-rail)` (a grid track, a flex basis, a
//               width, a Tailwind `w-[var(--col-rail)]`). The token's own
//               definition and the --page-width calc are not uses.
//   px-grid     a grid template, in CSS, an inline style or a Tailwind
//               `grid-cols-[...]`, that pairs a fractional track with a
//               280-400px literal track (`1fr 320px`, `320px 1fr`,
//               `lg:grid-cols-[1fr_320px]`), on one line or across several.
//   col-span    a file with `grid-cols-12` and two or more `col-span-N`
//               classes (the 4 + 8 main + aside pair the member page used).
//
// Scope, stated plainly: this is a text scan. It cannot see a rail built from
// a width computed in JS, a percentage grid (`2fr 1fr`), or a layout with no
// grid and no token at all; those need a reviewer. It can also flag a
// non-page use of the same shapes, which is why a baseline exists.
//
//   - a file whose count rises, or a new file with any count, FAILS and prints
//     each file:line and shape;
//   - a count that falls passes with a note to run --update;
//   - --update rewrites the baseline but REFUSES to raise a count.
//
// The baseline holds index.css (the component's own rules), TodayPage.tsx
// (the reference page, deliberately not ported: medium-high risk, s79 note)
// and whatever else the first run of this wider scan found (see the JSON).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { walk } from './check-color-jobs.mjs'
import { codeOnly } from './check-raw-wrangler-d1.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
export const BASELINE_PATH = path.join(__dirname, 'check-page-rail.baseline.json')

const RAIL_TOKEN = /var\(\s*--col-rail\b/g
const PX_TRACK = '(?:2[89]\\d|3\\d\\d|400)(?:\\.\\d+)?px'
// A grid template: a declaration (CSS or an inline-style string), or a Tailwind arbitrary value.
const GRID_DECL = /(?:grid-template-columns|gridTemplateColumns)\s*[:=]\s*[^;{}]*/g
const GRID_TW = /grid-cols-\[[^\]\s]*\]/g
const FR = /\d*\.?\d*fr(?![a-z])/
const PX = new RegExp(`(?:^|[\\s_,(])${PX_TRACK}`)

function stripComments(file, text) {
  if (file.endsWith('.css')) return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  return codeOnly(file, text)
}

function lineOf(code, index) {
  return code.slice(0, index).split('\n').length
}

/** Hand-built main + rail marks in one file: [{ shape, line, src }]. */
export function findRailMarks(file, text) {
  const code = stripComments(file, text)
  const lines = text.split('\n')
  const out = []
  const add = (shape, index) => {
    const line = lineOf(code, index)
    out.push({ shape, line, src: (lines[line - 1] ?? '').trim().slice(0, 140) })
  }
  let m
  RAIL_TOKEN.lastIndex = 0
  while ((m = RAIL_TOKEN.exec(code)) !== null) {
    const before = code.slice(code.lastIndexOf('\n', m.index) + 1, m.index)
    if (/--page-width\s*:/.test(before)) continue // the token's own width calc
    add('rail-token', m.index)
  }
  for (const re of [GRID_DECL, GRID_TW]) {
    re.lastIndex = 0
    while ((m = re.exec(code)) !== null) {
      // rail-token counts itself; a repeat() card grid is not a rail
      if (/--col-rail/.test(m[0]) || /repeat\(/.test(m[0])) continue
      if (FR.test(m[0]) && PX.test(m[0])) add('px-grid', m.index)
    }
  }
  if (/\bgrid-cols-12\b/.test(code)) {
    const spans = code.match(/\bcol-span-\d+\b/g) ?? []
    if (spans.length >= 2) add('col-span', code.search(/\bgrid-cols-12\b/))
  }
  return out
}

export function scan(root = ROOT) {
  const found = {}
  for (const abs of walk(path.join(root, 'src'))) {
    if (!/\.(tsx?|css)$/.test(abs)) continue
    const rel = path.relative(root, abs).split(path.sep).join('/')
    const hits = findRailMarks(rel, fs.readFileSync(abs, 'utf8'))
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
  const write = () => {
    const next = Object.fromEntries(Object.entries(found).map(([f, h]) => [f, h.length]).sort())
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
    console.log('[page-rail] baseline written')
  }
  if (process.argv.includes('--update')) {
    if (rises.length) {
      console.error('[page-rail] --update refuses to raise a count:', rises.map((r) => r.file).join(', '))
      process.exit(1)
    }
    write()
    return
  }
  if (rises.length) {
    console.error('[page-rail] FAIL: a main + rail layout is hand-built outside <PageWithRail> (src/components/PageWithRail.tsx):')
    for (const r of rises) for (const h of r.hits) console.error(`  ${r.file}:${h.line}  [${h.shape}] ${h.src}`)
    console.error('Use <PageWithRail> (slots: head, railTop, children, rail; side, railHidden, railFirst) instead of a new grid.')
    process.exit(1)
  }
  if (falls.length) console.log(`[page-rail] ok; ${falls.map((f) => `${f.file} ${f.was}->${f.now}`).join(', ')} fell: run --update to lock it in`)
  else console.log('[page-rail] ok')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
