#!/usr/bin/env node
// check-legacy-look.mjs -- legacy-look ratchet (2026-10-12).
//
// Nick, 2026-10-12: "there are still parts of the hub that look like the prior
// version before the modern redesign the other day." The redesign (Today's
// skin: sentence-case section heads, the stepped --sk-* surfaces, hairline
// panels, faces as photo-or-initials) reached the pages someone looked at and
// missed the rest of the class. This gate counts the marks of the OLD look per
// file against a committed baseline, the way check-color-jobs.mjs does for
// color:
//
//   - a file whose count rises, or a new file with any count, FAILS, printing
//     each file:line so the author sees what they added;
//   - a count that falls passes, with a note to run --update and lock it in;
//   - --update rewrites the baseline but REFUSES to raise any count. The
//     baseline only goes down;
//   - --init writes the first baseline and refuses when one exists.
//
// Counted, per file (each is its own metric, so a drop in one cannot pay for a
// rise in another):
//   uppercase   the word `uppercase` in code or CSS: an uppercase label
//               (textTransform, the Tailwind class, text-transform). Section
//               heads and field labels are sentence case.
//   surface     var(--surface-N) / --surface-N: the pre-redesign gray tray
//               ramp. Panels step through --sk-panel / --sk-card.
//   box         a drawn box: an inline `border: '1px solid var(--border-*)'`
//               shorthand, or a rounded element carrying the bare Tailwind
//               `border` class. Panels are one material (.sk-mat, .detail-card,
//               .tk-card, ui/Modal); a box inside a box is the old look. Inputs
//               use --field-edge, dividers use --sk-line, and neither counts.
//               Counted from 2026-10-12 (wave 2); the baseline still holds
//               every pre-redesign box, including a few field outlines.
//   tabstrip    a hand-rolled underline tab strip: an active/inactive tab drawn
//               with a 2px bottom rule (`borderBottom: ... 2px solid ...
//               transparent`, or `border-b-2` beside `border-transparent`).
//               Tabs are SegmentedToggle (or FilterLinks); the underline strip
//               is the pre-redesign look. The public site nav (Layout.tsx) is
//               allowed (ALLOW below): its brand underline is deliberate. A
//               text-input underline is not a tab and does not match.
//               Counted from 2026-10-12 (wave 3).
//   initials    a hand-rolled initials disc: JSX that renders an `initials`
//               value as a child (`{x.initials}`, or the `) : ( x.initials )`
//               fallback arm of a photo ternary). Faces are FaceDisc (photo
//               when there is one, initials disc as the fallback).
//               Counted from 2026-10-12 (wave 3).
//   edge        a card drawn with an always-on 3px left stripe
//               (`borderLeft: '3px solid ...'` or the template-literal form).
//               The stripe was the old card's decoration: a neutral or
//               per-type color on every card. A rail that appears only in one
//               state (`borderLeft: overdue ? '3px solid var(--job-overdue)' :
//               undefined`) is the urgency channel (Hub Rule 76) and does not
//               match. Counted from 2026-10-14 (overnight audit: the member and
//               trajectory pages, where it was the last old-look mark).
//
// The old PageHeader `icon` prop, the `Avatar` component, `MetricCard`, the
// SectionHead `icon` prop, the bordered-pill SegmentedToggle skins and the
// uppercase `Field` label are not counted:
// they were deleted, so the old anatomy cannot be built (tsc fails first).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { codeOnly } from './check-raw-wrangler-d1.mjs'
import { walk } from './check-color-jobs.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
export const BASELINE_PATH = path.join(__dirname, 'check-legacy-look.baseline.json')

export const METRICS = {
  uppercase: [/(?<![\w-])uppercase(?![\w-])/g],
  surface: [/--surface-\d/g],
  box: [
    /(?<!\w)border:\s*['"`]1px solid var\(--border-(?:subtle|strong|light|default)\)/g,
    // Any string literal (className, cn(...), a ternary arm) holding a rounded-* and a bare `border`, either order.
    /(["'`])(?:(?!\1)[^\n])*?(?:\brounded(?:-\w+)*\b(?:(?!\1)[^\n])*?\bborder\b(?![-\w])|\bborder\b(?![-\w])(?:(?!\1)[^\n])*?\brounded(?:-\w+)*\b)(?:(?!\1)[^\n])*?\1/g,
  ],
  tabstrip: [
    // `borderBottom: cond ? '2px solid X' : '2px solid transparent'` and the template-literal form.
    /\bborderBottom:[^\n]*2px solid[^\n]*transparent/g,
    // A class string pairing `border-b-2` with `border-transparent` (the Tailwind tab idiom).
    /(["'`])(?:(?!\1)[^\n])*?\bborder-b-2\b(?:(?!\1)[^\n])*?\bborder-transparent\b(?:(?!\1)[^\n])*?\1/g,
  ],
  edge: [
    /\bborderLeft:\s*['"`]3px solid/g,
  ],
  initials: [
    // `{x.initials}` as a JSX child, inline or alone on its line.
    />[ \t]*\{[^{}\n]*\binitials\b[^{}\n]*\}[ \t]*</g,
    /^[ \t]*\{[^{}\n]*\binitials\b[^{}\n]*\}[ \t]*$/gm,
    // The fallback arm of a photo ternary: `) : (` newline `info.initials` newline `)`.
    /\)\s*:\s*\(\s*\n\s*[\w.?]+\binitials\s*\n\s*\)/g,
  ],
}

/** Files exempt from one metric: the mark IS the deliberate look there. */
export const ALLOW = {
  tabstrip: new Set(['src/components/Layout.tsx']), // public site nav: brand underline
  initials: new Set(['src/components/today/skin.tsx']), // FaceDisc itself draws the initials fallback
}

function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

/** Every legacy-look mark in one file: { metric: [{ line, text }] }. */
export function findMarks(relPath, text, table = METRICS) {
  const isCss = relPath.endsWith('.css')
  let code = isCss ? stripCssComments(text) : codeOnly(relPath, text)
  // An import or re-export line names a component; it is not a use.
  code = code.replace(/^\s*(?:import|export)\s[^;]*?from\s*['"][^'"]+['"];?/gms, (m) => m.replace(/[^\n]/g, ' '))
  const lines = text.split('\n')
  const out = {}
  for (const [metric, patterns] of Object.entries(table)) {
    if (ALLOW[metric]?.has(relPath)) continue
    for (const re of patterns) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(code)) !== null) {
        const line = code.slice(0, m.index).split('\n').length
        ;(out[metric] ??= []).push({ line, text: m[0], src: lines[line - 1]?.trim().slice(0, 140) ?? '' })
      }
    }
  }
  return out
}

/** Count marks per file for every scanned file under src/. */
export function scan(root = ROOT, table = METRICS) {
  const counts = {}
  const marks = {}
  for (const fp of walk(path.join(root, 'src'))) {
    const rel = path.relative(root, fp).replace(/\\/g, '/')
    const found = findMarks(rel, fs.readFileSync(fp, 'utf8'), table)
    const c = Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length]))
    if (Object.keys(c).length) {
      counts[rel] = c
      marks[rel] = found
    }
  }
  return { counts, marks }
}

/** Compare counts to a baseline, per file and per metric. */
export function compare(counts, baseline) {
  const rose = []
  const fell = []
  const files = new Set([...Object.keys(counts), ...Object.keys(baseline)])
  for (const file of files) {
    for (const metric of Object.keys(METRICS)) {
      const now = counts[file]?.[metric] ?? 0
      const was = baseline[file]?.[metric] ?? 0
      if (now > was) rose.push({ file, metric, was, now })
      else if (now < was) fell.push({ file, metric, was, now })
    }
  }
  return { rose, fell }
}

/** The baseline only goes down: a lowered copy, or an error naming the rises. */
export function lowerBaseline(counts, baseline) {
  const { rose } = compare(counts, baseline)
  if (rose.length) return { error: rose.map((r) => `${r.file} [${r.metric}]: ${r.was} -> ${r.now}`) }
  const next = {}
  for (const file of Object.keys(counts).sort()) next[file] = counts[file]
  return { baseline: next }
}

function totals(counts) {
  const t = Object.fromEntries(Object.keys(METRICS).map((m) => [m, 0]))
  for (const c of Object.values(counts)) for (const [m, n] of Object.entries(c)) t[m] += n
  return t
}
const fmt = (t) => Object.entries(t).map(([m, n]) => `${n} ${m}`).join(', ')

function main() {
  const args = process.argv.slice(2)
  const update = args.includes('--update')
  const init = args.includes('--init')
  const { counts, marks } = scan()
  const total = totals(counts)

  if (init || !fs.existsSync(BASELINE_PATH)) {
    if (!init) {
      console.error('check-legacy-look: no baseline at scripts/check-legacy-look.baseline.json; run with --init once.')
      process.exit(1)
    }
    if (fs.existsSync(BASELINE_PATH)) {
      console.error('check-legacy-look: --init refuses: a baseline already exists. Use --update (it only lowers).')
      process.exit(1)
    }
    const sorted = Object.fromEntries(Object.keys(counts).sort().map((f) => [f, counts[f]]))
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + '\n')
    console.log(`check-legacy-look: baseline written, ${fmt(total)} in ${Object.keys(counts).length} file(s).`)
    return
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))

  if (update) {
    const r = lowerBaseline(counts, baseline)
    if (r.error) {
      console.error('check-legacy-look: --update refuses to RAISE the baseline. These counts rose:')
      for (const e of r.error) console.error(`  ${e}`)
      process.exit(1)
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(r.baseline, null, 2) + '\n')
    console.log(`check-legacy-look: baseline lowered to ${fmt(total)} in ${Object.keys(counts).length} file(s).`)
    return
  }

  const { rose, fell } = compare(counts, baseline)
  if (rose.length) {
    console.error('check-legacy-look: legacy-look marks ROSE. The redesign look is: sentence-case labels,')
    console.error('  --sk-panel / --sk-card steps (not --surface-N), one material per panel (no box inside a box).')
    console.error('')
    for (const r of rose) {
      console.error(`  ${r.file} [${r.metric}]: ${r.was} -> ${r.now}`)
      for (const l of marks[r.file][r.metric]) console.error(`    ${r.file}:${l.line}  ${l.src}`)
    }
    process.exit(1)
  }
  const note = fell.length ? `; ${fell.length} count(s) went down, run \`node scripts/check-legacy-look.mjs --update\` to lock it in` : ''
  console.log(`check-legacy-look: ${fmt(total)}, none new${note}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
