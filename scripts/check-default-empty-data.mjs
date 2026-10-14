#!/usr/bin/env node
// check-default-empty-data.mjs -- false-empty ratchet (2026-10-14).
//
// The class: `const { data: items = [] } = useSomething()` turns "not loaded
// yet" into "loaded, and empty". Anything rendered from `items` before the
// request returns then says "No open tasks", "0 overdue", "No activity yet" for
// the half second the data is in flight, and the screen changes again when it
// arrives. Nick, 2026-10-14: "no glitches". Measured: Today showed 0 overdue /
// 0 planned / 0 done for ~0.4 s and ProjectDetail showed "No open tasks. Add
// one." before 5 tasks landed. 144 such defaults sat in src/ at that point.
//
// A default-[] on query data is allowed only when the SAME destructure also
// reads a loading flag (isLoading / isPending / isFetched / isSuccess / status),
// which is the sign the author handled the gap, or when the line says why the
// empty array is the right reading while loading:
//
//     const { data: team = [] } = useTeam() // empty-data-ok: label lookup only, nothing renders from it
//
// Everything else is counted per file against a committed baseline:
//   - a file whose count rises, or a new file with any count, FAILS, printing
//     each file:line;
//   - a count that falls passes, with a note to run --update to lock it in;
//   - --update rewrites the baseline but REFUSES to raise any file's count
//     (the baseline only goes down);
//   - --init writes the first baseline and refuses when one exists.
//
// This is Level 2 (a gate). The fix at a site is one of: read isPending and
// show a skeleton or a dash; or mark the line empty-data-ok with the reason.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { codeOnly } from './check-raw-wrangler-d1.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
export const BASELINE_PATH = path.join(__dirname, 'check-default-empty-data.baseline.json')
export const OK_MARKER = 'empty-data-ok:'

// `data: name = []` inside a destructure.
const DEFAULT_EMPTY = /\bdata\s*:\s*[A-Za-z_$][\w$]*\s*=\s*\[\s*\]/
// A loading read in the same destructure.
const LOADING_READ = /\b(?:isLoading|isPending|isFetched|isSuccess|status)\b/
// `const { ... } = ` (the body may span lines; no nested braces in these).
const DESTRUCTURE = /\b(?:const|let)\s*\{([^{}]*)\}\s*=/g

/** Sites in one file's text: [{ line, text }] for each unguarded default-[] on data. */
export function findDefaultEmptyData(filePath, text) {
  const orig = text.split('\n')
  const code = codeOnly(filePath, text)
  const hits = []
  for (const m of code.matchAll(DESTRUCTURE)) {
    const body = m[1]
    const at = body.search(DEFAULT_EMPTY)
    if (at < 0) continue
    if (LOADING_READ.test(body)) continue
    // Line of the `data: x = []` property.
    const offset = m.index + m[0].indexOf('{') + 1 + at
    const line = code.slice(0, offset).split('\n').length
    const lineText = orig[line - 1] ?? ''
    if (lineText.includes(OK_MARKER)) continue
    hits.push({ line, text: lineText.trim() })
  }
  return hits
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

export function scan() {
  const files = {}
  const detail = {}
  for (const abs of walk(path.join(ROOT, 'src'))) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/')
    const hits = findDefaultEmptyData(rel, fs.readFileSync(abs, 'utf8'))
    if (hits.length) { files[rel] = hits.length; detail[rel] = hits }
  }
  return { files, detail }
}

function main() {
  const mode = process.argv[2]
  const { files, detail } = scan()
  const total = Object.values(files).reduce((a, b) => a + b, 0)
  const exists = fs.existsSync(BASELINE_PATH)

  if (mode === '--init') {
    if (exists) { console.error('baseline exists; use --update'); process.exit(2) }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(sorted(files), null, 2) + '\n')
    console.log(`baseline written: ${total} site(s) in ${Object.keys(files).length} file(s)`)
    return
  }
  if (!exists) { console.error('no baseline; run with --init'); process.exit(2) }
  const base = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))

  if (mode === '--update') {
    for (const [f, n] of Object.entries(files)) {
      if (n > (base[f] ?? 0)) {
        console.error(`refusing to raise ${f}: ${base[f] ?? 0} -> ${n}. Read isPending, or mark the line ${OK_MARKER} <why>.`)
        process.exit(1)
      }
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(sorted(files), null, 2) + '\n')
    console.log(`baseline updated: ${total} site(s) in ${Object.keys(files).length} file(s)`)
    return
  }

  let failed = false
  for (const [f, n] of Object.entries(files)) {
    if (n > (base[f] ?? 0)) {
      failed = true
      console.error(`\n${f}: ${base[f] ?? 0} -> ${n} default-[] on query data without a loading read`)
      for (const h of detail[f]) console.error(`  ${f}:${h.line}: ${h.text}`)
    }
  }
  if (failed) {
    console.error(`\nA default [] makes "not loaded yet" read as "empty": the screen says "No X" / "0 X" until the data lands.`)
    console.error(`Read isPending (or isLoading) from the same query and show a skeleton or a dash,`)
    console.error(`or mark the line "// ${OK_MARKER} <why an empty list is right while loading>".`)
    process.exit(1)
  }
  const lowered = Object.keys(base).some((f) => (files[f] ?? 0) < base[f])
  console.log(`default-empty-data: ${total} site(s), no rise${lowered ? ' (some fell: run --update to lock it in)' : ''}`)
}

function sorted(o) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
