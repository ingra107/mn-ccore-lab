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
import { execFileSync } from 'node:child_process'
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

const SRC_FILE = /^src\/.*\.(ts|tsx)$/
const SKIP = /(^|\/)__tests__\/|\.(test|spec)\.(ts|tsx)$|\.d\.ts$/

function git(args, input) {
  return execFileSync('git', args, { cwd: ROOT, input, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] })
}

/** The paths under src/ and their text: the working tree, or with `staged` the
 *  INDEX blobs (what the commit will contain, not what is on disk). */
function sourceFiles(staged) {
  if (!staged) {
    const out = []
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules') continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else {
          const rel = path.relative(ROOT, p).split(path.sep).join('/')
          if (SRC_FILE.test(rel) && !SKIP.test(rel)) out.push([rel, fs.readFileSync(p, 'utf8')])
        }
      }
    }
    walk(path.join(ROOT, 'src'))
    return out
  }
  const paths = git(['ls-files', '--cached', '--', 'src']).split('\n').filter((f) => SRC_FILE.test(f) && !SKIP.test(f))
  const out = []
  for (const f of paths) out.push([f, git(['show', ':' + f])])
  return out
}

export function scan({ staged = false } = {}) {
  const files = {}
  const detail = {}
  for (const [rel, text] of sourceFiles(staged)) {
    const hits = findDefaultEmptyData(rel, text)
    if (hits.length) { files[rel] = hits.length; detail[rel] = hits }
  }
  return { files, detail }
}

/** { newPath: oldPath } for files git sees as renamed in the index. */
export function stagedRenames() {
  const map = {}
  try {
    for (const line of git(['diff', '--cached', '-M', '--name-status', '--diff-filter=R']).split('\n')) {
      const [, from, to] = line.split('\t')
      if (from && to) map[to] = from
    }
  } catch { /* no repo: no renames */ }
  return map
}

/** The baseline the CHECK compares against: HEAD's committed one, so a baseline
 *  raised by hand in the working tree or the index cannot excuse its own rise.
 *  Before the first commit of the baseline, the file on disk. */
export function committedBaseline() {
  try {
    return JSON.parse(git(['show', 'HEAD:scripts/check-default-empty-data.baseline.json']))
  } catch {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
  }
}

function main() {
  const args = process.argv.slice(2)
  const staged = args.includes('--staged')
  const mode = args.find((a) => a === '--init' || a === '--update')
  const { files, detail } = scan({ staged })
  const total = Object.values(files).reduce((a, b) => a + b, 0)
  const exists = fs.existsSync(BASELINE_PATH)
  const renames = stagedRenames()
  // A renamed file carries its old path's allowance.
  const allowed = (base, f) => base[f] ?? base[renames[f]] ?? 0

  if (mode === '--init') {
    if (exists) { console.error('baseline exists; use --update'); process.exit(2) }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(sorted(files), null, 2) + '\n')
    console.log(`baseline written: ${total} site(s) in ${Object.keys(files).length} file(s)`)
    return
  }
  if (!exists) { console.error('no baseline; run with --init'); process.exit(2) }

  if (mode === '--update') {
    const base = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    for (const [f, n] of Object.entries(files)) {
      if (n > allowed(base, f)) {
        console.error(`refusing to raise ${f}: ${allowed(base, f)} -> ${n}. Read isPending, or mark the line ${OK_MARKER} <why>.`)
        process.exit(1)
      }
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(sorted(files), null, 2) + '\n')
    console.log(`baseline updated: ${total} site(s) in ${Object.keys(files).length} file(s)`)
    return
  }

  const base = committedBaseline()
  let failed = false
  for (const [f, n] of Object.entries(files)) {
    if (n > allowed(base, f)) {
      failed = true
      console.error(`\n${f}: ${allowed(base, f)} -> ${n} default-[] on query data without a loading read`)
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
