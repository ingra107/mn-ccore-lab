#!/usr/bin/env node
// check-color-string-concat.mjs — Z5.1
//
// Codex P1-amended: flag the `${color}HH` / `var(--token)NN` / known-task-token
// rgba(...) literal patterns. The withAlpha() helper at src/lib/taskGrouping.ts:63
// is the canonical replacement (color-mix(in srgb, ...)).
//
// Anti-rec: do NOT ban all rgba(). Chrome/borders/shadows are legit.
// This lint flags ONLY:
//   1. `${COLOR_CONST}HH` — template-literal hex-alpha suffix on a named const
//   2. `<color-string-expr> + 'HH'` — string concat hex-alpha suffix
//   3. `var(--task-...)NN` — direct alpha suffix on a task-token CSS var
//   4. `rgba(<rgb of known task token>, ...)` — literal RGB matching a token
//
// Baseline-aware: first run writes check-color-string-concat.baseline.json.
// Subsequent runs compare findings vs baseline; only NEW findings cause output.
// Exit non-zero only when --enforce flag is passed. Default is warn-on-new.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const BASELINE = path.join(__dirname, 'check-color-string-concat.baseline.json')

const enforce = process.argv.includes('--enforce')

// Known task tokens whose RGB literals should funnel through withAlpha().
// These are the dark-mode hex values of the --task-* CSS vars (the ones
// hard-coded in src/lib/taskGrouping.ts constants + src/pages/MyTasks/constants.ts
// before the Phase 7 CSS-var migration). Add to this map when a new --task-*
// CSS var ships with a literal RGB.
//
// Anti-rec: do NOT add generic RGBs like 255,255,255 (white) or 0,0,0 (black) —
// those are legitimate chrome colors. Only add the task-surface token RGBs.
const TOKEN_RGB = {
  '--task-accent-gold':  '201, 168, 76',
  '--task-accent-teal':  '92, 188, 180',
  '--task-accent-coral': '240, 115, 126',
  '--task-page-bg':      '11, 16, 23',
  '--task-panel-bg':     '15, 25, 35',
}

// Pattern 1: ${SOMETHING}HH at the very end of a template-literal segment.
// Matches: `${ACCENT_GOLD}22` but not `${x}22px` or `${x}2` (must be exactly 2 hex chars).
const TEMPLATE_HEX_ALPHA = /\$\{[A-Z_][A-Z0-9_]*\}[0-9a-fA-F]{2}(?![0-9a-fA-F])/g

// Pattern 2: <expr> + 'HH' — string concat with exactly 2-char hex literal.
// Matches: c + '70', meta.color + '80', config.color + '14'
// Does NOT match: + '0px', + '15px' (would require hex-only 2-chars, which 'px' suffix breaks)
const CONCAT_HEX_ALPHA = /\+\s*['"][0-9a-fA-F]{2}['"](?![0-9a-fA-F])/g

// Pattern 3: var(--task-...)NN — direct alpha suffix on a task-token CSS var.
// Example: var(--task-accent-gold)22 — invalid CSS but someone might write it.
const CSS_VAR_ALPHA = /var\(--task-[a-z-]+\)[0-9a-fA-F]{2}(?![0-9a-fA-F])/g

const patterns = [
  { name: 'template-hex-alpha', re: TEMPLATE_HEX_ALPHA },
  { name: 'concat-hex-alpha',   re: CONCAT_HEX_ALPHA },
  { name: 'css-var-alpha',      re: CSS_VAR_ALPHA },
]

// Pattern 4: rgba(<known token RGB>, ...) — matches any of the known token RGBs
// with optional whitespace around commas. Generates a single combined regex.
const tokenRgbaPattern = new RegExp(
  `rgba\\(\\s*(?:${
    Object.values(TOKEN_RGB)
      .map(r => r.replace(/,\s*/g, ',\\s*').replace(/\s+/g, '\\s*'))
      .join('|')
  })\\s*,\\s*[\\d.]+\\s*\\)`,
  'g'
)

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, f.name)
    if (f.isDirectory()) {
      // Skip generated/vendor dirs that may end up under src
      if (/node_modules|dist|\.cache|__pycache__|coverage/.test(f.name)) continue
      walk(fp, out)
    } else if (/\.(ts|tsx|css)$/.test(f.name)) {
      out.push(fp)
    }
  }
  return out
}

const findings = []
for (const fp of walk(SRC)) {
  const content = fs.readFileSync(fp, 'utf8')
  const relPath = path.relative(ROOT, fp).replace(/\\/g, '/')

  for (const { name, re } of patterns) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(content)) !== null) {
      const line = content.slice(0, m.index).split('\n').length
      findings.push({ file: relPath, line, kind: name, sample: m[0].slice(0, 80) })
    }
  }

  tokenRgbaPattern.lastIndex = 0
  let m
  while ((m = tokenRgbaPattern.exec(content)) !== null) {
    const line = content.slice(0, m.index).split('\n').length
    findings.push({ file: relPath, line, kind: 'token-rgba-literal', sample: m[0].slice(0, 80) })
  }
}

// Deduplicate (same file:line:kind can match twice if both regex share state).
const seen = new Set()
const deduped = findings.filter(f => {
  const k = `${f.file}:${f.line}:${f.kind}:${f.sample}`
  if (seen.has(k)) return false
  seen.add(k)
  return true
})
deduped.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

const sig = (f) => `${f.file}:${f.line}:${f.kind}`

if (fs.existsSync(BASELINE)) {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  const baselineSigs = new Set(baseline.map(sig))
  const newFindings = deduped.filter(f => !baselineSigs.has(sig(f)))
  if (newFindings.length > 0) {
    console.error('check-color-string-concat: NEW offenders (not in baseline):')
    for (const f of newFindings) {
      console.error(`  ${f.file}:${f.line}  [${f.kind}]  ${f.sample}`)
    }
    console.error('')
    console.error('Fix: use withAlpha(token, pct) from src/lib/taskGrouping.ts.')
    console.error('  e.g.  withAlpha(ACCENT_GOLD, 13)  →  color-mix(in srgb, var(--task-accent-gold) 13%, transparent)')
    if (enforce) {
      process.exit(1)
    } else {
      console.error('(warn-only mode; pass --enforce to fail CI)')
    }
  } else {
    console.log(`check-color-string-concat: ${deduped.length} known site(s), 0 new.`)
  }
} else {
  fs.writeFileSync(BASELINE, JSON.stringify(deduped, null, 2) + '\n')
  console.log(`check-color-string-concat: baseline created with ${deduped.length} entries.`)
  if (deduped.length > 0) {
    console.log('Top offenders by kind:')
    const byKind = {}
    for (const f of deduped) byKind[f.kind] = (byKind[f.kind] || 0) + 1
    for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${k}`)
    }
  }
}
