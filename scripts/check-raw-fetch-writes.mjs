#!/usr/bin/env node
// check-raw-fetch-writes.mjs -- no raw fetch for a write (fable-audit-2 G15).
//
// WHY THIS EXISTS: the failed-write floor (src/components/UndoToast.tsx) watches
// the TanStack mutation cache, so a write that fails through useMutation always
// reaches the person. A raw `fetch(url, { method: 'POST' })` is invisible to it.
// A `.catch(() => {})` or a missing `res.ok` check then fails with no word on
// screen: the form clears, the text stays, nothing says why. The audit found nine
// of these on the task, project and meeting pages. A rule does not stop the tenth;
// this does.
//
// THE RULE: in src/, `fetch(` with a write method (POST, PUT, PATCH, DELETE, or a
// method it cannot read as GET) goes through `fetchApi` inside a mutation instead.
// src/lib/api.ts and src/hooks/mutations/ are where those live, so they are exempt.
//
// THE RATCHET: most pages predate this, so check-raw-fetch-writes.baseline.json
// holds each file's count. A count that rises, or a new file with any count, FAILS
// and prints each file:line. A count that falls passes with a note. --update
// rewrites the baseline but REFUSES to raise a count, so the list only shrinks.
//
// EXEMPT one site with a line comment on the line above it, or on its first line:
//   // raw-write-ok: <reason>
// For a write that is not an API call, or one the code proves it reports.
//
// SCOPE, stated plainly: this reads the fetch's own arguments. It cannot see a
// method held in a variable passed as the whole init (`fetch(url, opts)`); one in
// `{ method }` or `{ method: verb }` counts as a write.
//
// Usage:
//   node scripts/check-raw-fetch-writes.mjs            # the gate
//   node scripts/check-raw-fetch-writes.mjs --list     # every site
//   node scripts/check-raw-fetch-writes.mjs --update   # lock in a fall
//
// PROVE THE GATE BEFORE TRUSTING IT: api/raw-fetch-writes-gate.test.ts plants a
// new site and watches this script exit 1.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { walk } from './check-color-jobs.mjs'
import { codeOnly } from './check-raw-wrangler-d1.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
export const BASELINE_PATH = path.join(__dirname, 'check-raw-fetch-writes.baseline.json')

const EXEMPT_FILE = /^src\/(lib\/api\.ts$|hooks\/mutations\/)/
const MARKER = 'raw-write-ok:'
const FETCH_CALL = /(?<![\w.])(?:(?:window|globalThis)\.)?fetch\(/g
const METHOD = /\bmethod\b\s*(:\s*([^,}\n]+))?/

/** The text from an opening paren to its match, skipping strings. */
function argsOf(code, open) {
  let depth = 0
  for (let i = open; i < code.length; i++) {
    const c = code[i]
    if (c === "'" || c === '"' || c === '`') {
      const q = c
      i++
      while (i < code.length && code[i] !== q) {
        if (code[i] === '\\') i++
        i++
      }
      continue
    }
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) return code.slice(open + 1, i)
  }
  return code.slice(open + 1)
}

/** Raw write fetches in one file: [{ line, src }]. */
export function findRawWrites(file, text) {
  if (EXEMPT_FILE.test(file)) return []
  const code = codeOnly(file, text)
  const lines = text.split('\n')
  const out = []
  FETCH_CALL.lastIndex = 0
  let m
  while ((m = FETCH_CALL.exec(code)) !== null) {
    const method = argsOf(code, m.index + m[0].length - 1).match(METHOD)
    if (!method) continue
    if (method[2] && /^['"`]GET['"`]/i.test(method[2].trim())) continue
    const line = code.slice(0, m.index).split('\n').length
    if ((lines[line - 1] ?? '').includes(MARKER) || (lines[line - 2] ?? '').includes(MARKER)) continue
    out.push({ line, src: (lines[line - 1] ?? '').trim().slice(0, 120) })
  }
  return out
}

export function scan(root = ROOT) {
  const found = {}
  for (const abs of walk(path.join(root, 'src'))) {
    if (!/\.tsx?$/.test(abs)) continue
    const rel = path.relative(root, abs).split(path.sep).join('/')
    const hits = findRawWrites(rel, fs.readFileSync(abs, 'utf8'))
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
  if (process.argv.includes('--list')) {
    for (const [file, hits] of Object.entries(found).sort()) for (const h of hits) console.log(`${file}:${h.line}  ${h.src}`)
  }
  if (process.argv.includes('--update')) {
    if (rises.length && fs.existsSync(BASELINE_PATH)) {
      console.error('[raw-fetch-writes] --update refuses to raise a count:', rises.map((r) => r.file).join(', '))
      process.exit(1)
    }
    const next = Object.fromEntries(Object.entries(found).map(([f, h]) => [f, h.length]).sort())
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
    console.log('[raw-fetch-writes] baseline written')
    return
  }
  if (rises.length) {
    console.error('[raw-fetch-writes] FAIL: a raw fetch write, which the failed-write floor (UndoToast.tsx) cannot see:')
    for (const r of rises) for (const h of r.hits) console.error(`  ${r.file}:${h.line}  ${h.src}`)
    console.error('Use useMutation with fetchApi (src/lib/api.ts), or mark it: // raw-write-ok: <reason>')
    process.exit(1)
  }
  const total = Object.values(found).reduce((n, h) => n + h.length, 0)
  if (falls.length) console.log(`[raw-fetch-writes] ok, ${total} left; ${falls.map((f) => `${f.file} ${f.was}->${f.now}`).join(', ')} fell: run --update to lock it in`)
  else console.log(`[raw-fetch-writes] ok, ${total} left`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
