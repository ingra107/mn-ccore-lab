#!/usr/bin/env node
// check-raw-wrangler-d1.mjs -- the raw `wrangler d1` pre-commit gate.
//
// Every programmatic D1 call goes through the sanctioned entry point
// (scripts/wrangler-d1 shell shim or scripts/wrangler_d1.py), which unsets
// CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID so OAuth (which has D1 scope)
// is used -- the fix for the recurring OAuth-shadow auth failure. This gate
// refuses a staged raw `wrangler d1 execute|export`.
//
// Until 2026-09-24 it lived inline in .githooks/pre-commit as a grep over the
// WHOLE staged file, comments included (PB backlog #2300). Two false blocks
// followed from that:
//   * a comment or docstring that DESCRIBES the command blocked the commit
//     (#2231's fix was refused for two prose lines in check-project-identity-gate.py
//     and its test; instance five of the "scanner reads prose as evidence" class);
//   * touching any line of a file that already carried such a comment -- e.g. the
//     `-- Run with: wrangler d1 execute ...` header on ~20 old api/schema-v*.sql
//     files -- blocked the commit for a line the author never wrote.
// Now it reads only the ADDED lines of the staged diff, and in source files it
// blanks comments and docstrings first, so it counts the token in CODE only.
// A raw call inside a string (a shell command a script runs) is still code and
// still blocks. Markdown and other docs are scanned whole-line: a doc that
// shows the raw form teaches it, so it still needs the marker.
//
// Escape hatch, unchanged: a line carrying `wrangler-d1-allowed` passes.
// Exempt paths, unchanged: .github/workflows/ (CI uses a D1-scoped secret),
// and the wrapper itself.
//
// Usage: node scripts/check-raw-wrangler-d1.mjs   (reads the staged index)
// Exit 0 = clean, 1 = raw call found, 2 = could not read the staged diff.

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const RAW_D1 = /(npx )?wrangler d1 (execute|export)/
const WRAPPER_NAME = /wrangler-d1|wrangler_d1/
const ALLOW_MARKER = 'wrangler-d1-allowed'

export function isExempt(path) {
  return path.startsWith('.github/workflows/') || path === 'scripts/wrangler-d1' || path === 'scripts/wrangler_d1.py'
}

function ext(path) {
  const m = path.match(/\.([A-Za-z0-9]+)$/)
  return m ? m[1].toLowerCase() : ''
}

/** Replace every non-newline char in [from, to) with a space, keeping line numbers. */
function blank(chars, from, to) {
  for (let i = from; i < to && i < chars.length; i++) if (chars[i] !== '\n') chars[i] = ' '
}

/** C-family (TS/JS): blank // and /* *\/ comments, string- and template-aware. */
function stripCFamily(text) {
  const c = [...text]
  let i = 0
  while (i < c.length) {
    const ch = c[i]
    const nx = c[i + 1]
    if (ch === '/' && nx === '/') {
      const s = i
      while (i < c.length && c[i] !== '\n') i++
      blank(c, s, i)
      continue
    }
    if (ch === '/' && nx === '*') {
      const s = i
      i += 2
      while (i < c.length && !(c[i] === '*' && c[i + 1] === '/')) i++
      i += 2
      blank(c, s, i)
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      i++
      while (i < c.length && c[i] !== ch) {
        if (c[i] === '\\') i++
        else if (ch !== '`' && c[i] === '\n') break
        i++
      }
      i++
      continue
    }
    i++
  }
  return c.join('')
}

/** SQL: blank -- and /* *\/ comments outside single-quoted strings. */
function stripSql(text) {
  const c = [...text]
  let i = 0
  while (i < c.length) {
    if (c[i] === '-' && c[i + 1] === '-') {
      const s = i
      while (i < c.length && c[i] !== '\n') i++
      blank(c, s, i)
      continue
    }
    if (c[i] === '/' && c[i + 1] === '*') {
      const s = i
      i += 2
      while (i < c.length && !(c[i] === '*' && c[i + 1] === '/')) i++
      i += 2
      blank(c, s, i)
      continue
    }
    if (c[i] === "'") {
      i++
      while (i < c.length && !(c[i] === "'" && c[i + 1] !== "'")) i += c[i] === "'" ? 2 : 1
      i++
      continue
    }
    i++
  }
  return c.join('')
}

/**
 * Python: blank # comments and DOCSTRINGS (a string literal that STARTS a
 * logical line: first token on its physical line, outside any bracket, and
 * the previous line did not end in a backslash). Any other string is code --
 * a subprocess command string, including one continued inside parentheses,
 * is exactly what this gate must still see.
 */
function stripPython(text) {
  const c = [...text]
  let i = 0
  let lineStart = true // only whitespace seen since the last logical-line break
  let depth = 0 // ( [ { nesting: a newline inside brackets does not end the line
  let lastSig = '\n' // last significant char, to see a trailing backslash
  while (i < c.length) {
    const ch = c[i]
    if (ch === '\n') { lineStart = depth === 0 && lastSig !== '\\'; lastSig = '\n'; i++; continue }
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue }
    if (ch === '#') {
      const s = i
      while (i < c.length && c[i] !== '\n') i++
      blank(c, s, i)
      continue
    }
    // optional string prefix (r, b, u, f, rb, ...)
    let j = i
    while (j < c.length && /[rRbBuUfF]/.test(c[j]) && j - i < 2) j++
    const q = c[j]
    if (q === "'" || q === '"') {
      const triple = c[j + 1] === q && c[j + 2] === q
      const isDoc = lineStart
      const s = i
      let k = j + (triple ? 3 : 1)
      while (k < c.length) {
        if (c[k] === '\\') { k += 2; continue }
        if (triple ? (c[k] === q && c[k + 1] === q && c[k + 2] === q) : c[k] === q) { k += triple ? 3 : 1; break }
        if (!triple && c[k] === '\n') break
        k++
      }
      if (isDoc) blank(c, s, k)
      i = k
      lineStart = false
      lastSig = q
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if ((ch === ')' || ch === ']' || ch === '}') && depth > 0) depth--
    lineStart = false
    lastSig = ch
    i++
  }
  return c.join('')
}

/** Shell / YAML / PowerShell: blank full-line `#` comments. */
function stripHashLines(text) {
  return text.split('\n').map((l) => (/^\s*#/.test(l) ? ' '.repeat(l.length) : l)).join('\n')
}

const C_FAMILY = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'])
const HASH = new Set(['sh', 'bash', 'ps1', 'psm1', 'yml', 'yaml', 'toml'])

/** The file's text with comments / docstrings blanked; same line count. Docs are returned unchanged. */
export function codeOnly(path, text) {
  const e = ext(path)
  if (C_FAMILY.has(e)) return stripCFamily(text)
  if (e === 'sql') return stripSql(text)
  if (e === 'py') return stripPython(text)
  if (HASH.has(e) || (e === '' && /^#!.*\b(ba)?sh\b/.test(text))) return stripHashLines(text)
  return text
}

/**
 * Raw-call hits on the given 1-based ADDED line numbers of one file.
 * Returns `path:line: <original line>` strings.
 */
export function findRawCalls(path, text, addedLines) {
  if (isExempt(path)) return []
  const orig = text.split('\n')
  const code = codeOnly(path, text).split('\n')
  const hits = []
  for (const n of addedLines) {
    const line = orig[n - 1]
    if (line === undefined || line.includes(ALLOW_MARKER) || WRAPPER_NAME.test(line)) continue
    if (RAW_D1.test(code[n - 1] ?? '')) hits.push(`${path}:${n}: ${line.trim()}`)
  }
  return hits
}

/**
 * Parse `git diff -U0 --src-prefix=a/ --dst-prefix=b/` output into
 * { path -> added line numbers }. A `+++` header it cannot read THROWS: a
 * silently skipped file is a gate that passes without looking.
 */
export function addedLinesByFile(diff) {
  const out = new Map()
  let cur = null
  for (const raw of diff.split('\n')) {
    const l = raw.replace(/\r$/, '')
    if (l.startsWith('+++ ')) {
      // git appends a TAB after a name containing a space, and C-quotes a
      // name with special characters: "b/odd\tname".
      let name = l.slice(4).replace(/\t$/, '')
      if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1)
      if (name === '/dev/null') { cur = null; continue }
      if (!name.startsWith('b/')) throw new Error(`unreadable diff header: ${JSON.stringify(l)}`)
      cur = name.slice(2)
      if (!out.has(cur)) out.set(cur, [])
      continue
    }
    const m = cur && l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (m) {
      const start = Number(m[1])
      const count = m[2] === undefined ? 1 : Number(m[2])
      for (let k = 0; k < count; k++) out.get(cur).push(start + k)
    }
  }
  return out
}

function main() {
  let diff
  try {
    // Explicit prefixes: a user's diff.noprefix / diff.mnemonicPrefix would
    // otherwise change the `+++ b/` header this parses. Submodules are left out:
    // a gitlink (e.g. the pb-schema pointer) has no staged blob to read, so
    // `git show :pb-schema` fails and the gate would refuse every pointer bump.
    diff = execFileSync('git', [
      '-c', 'core.quotePath=false', 'diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--no-renames',
      '--ignore-submodules=all',
      '--src-prefix=a/', '--dst-prefix=b/', '--diff-filter=AM',
    ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  } catch (e) {
    console.error(`check-raw-wrangler-d1: could not read the staged diff: ${e.message}`)
    process.exit(2)
  }
  let byFile
  try {
    byFile = addedLinesByFile(diff)
  } catch (e) {
    console.error(`check-raw-wrangler-d1: ${e.message}`)
    process.exit(2)
  }
  const hits = []
  for (const [path, lines] of byFile) {
    if (lines.length === 0 || isExempt(path)) continue
    let text
    try {
      text = execFileSync('git', ['show', `:${path}`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    } catch (e) {
      // An added/modified path whose staged blob cannot be read is a gate that
      // would pass without looking: refuse, loudly.
      console.error(`check-raw-wrangler-d1: could not read staged ${path}: ${e.message}`)
      process.exit(2)
    }
    hits.push(...findRawCalls(path, text, lines))
  }
  if (hits.length === 0) process.exit(0)
  console.log('')
  console.log("BLOCKED: raw 'wrangler d1' call(s) found -- route through the sanctioned")
  console.log('entry point (scripts/wrangler-d1 shell shim OR scripts/wrangler_d1.py).')
  console.log('These strip CLOUDFLARE_API_TOKEN/ACCOUNT_ID so OAuth (which has D1 scope)')
  console.log("is used. See CLAUDE.md 'Wrangler / D1 auth' + feedback_wrangler-home-auth-works.md.")
  console.log('')
  for (const h of hits) console.log(h)
  console.log('')
  console.log('Only added CODE lines are checked; comments and docstrings are not.')
  console.log(`If a raw form is genuinely required (CI, docs), add '${ALLOW_MARKER}'`)
  console.log('on the line, or place it under .github/workflows/.')
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
