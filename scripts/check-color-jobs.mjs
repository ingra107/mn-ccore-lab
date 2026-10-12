#!/usr/bin/env node
// check-color-jobs.mjs -- color-job ratchet (2026-10-11).
//
// Nick's color rule (PB Context/Topics/rules-ui-design.md, principle 21): each
// hue has ONE job. Red = overdue, and its second job "something's wrong"
// (errors, destructive actions: --job-danger), gold = wants you now (and the
// hard milestone date), teal = the one accent, orange = going stale;
// everything else is the gray ramp. The public site keeps gold as its brand
// color and maroon as its link color. The jobs are tokens in src/index.css:
// --job-overdue, --job-danger, --job-wants, --job-milestone, --job-accent,
// --job-stale, --job-brand, --job-link.
//
// The strip pass of 6451d2d1 fixed the sites someone looked at and missed the
// rest of the class: raw var(--gold) / var(--teal) / ACCENT_GOLD sat in ~190
// files. This gate counts every RAW hue use under src/ (a use that names the
// hue instead of its job) per file, against a committed baseline:
//
//   - a file whose count rises, or a new file with any count, FAILS, printing
//     each file:line so the author can see what they added;
//   - a count that falls passes, with a note to run --update and lock it in;
//   - --update rewrites the baseline but REFUSES to raise any file's count.
//     The baseline only goes down.
//
//   - --init writes the first baseline and refuses when one exists.
//
// Counted: raw hue tokens, ACCENT_* constants, color literals (hex, rgb(),
// hsl(), oklch()) that carry real chroma, and var(--job-brand) outside the
// public files (it is gold wherever .portal-shell does not reach), and
// var(--job-link) the same way (maroon outside .portal-shell).
// Not counted: the other var(--job-*) tokens, the gray ramp, comments, import lines, and the
// custom-property declarations inside the theme token blocks (`:root` /
// `.dark`) of a .css file, which is where the job tokens are defined from the
// raw palette. ALLOW lists the per-file exceptions whose raw hue IS the job;
// keep it tiny and convert to a job token instead where you can.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { codeOnly } from './check-raw-wrangler-d1.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
export const BASELINE_PATH = path.join(__dirname, 'check-color-jobs.baseline.json')

// Each raw hue, by family. A match is one raw use. Color LITERALS (hex,
// rgb()/rgba(), hsl(), oklch()) are counted too, by the hue they draw: a
// pattern list of known palette values let rgba(122,0,25,0.1) and #dc2626
// straight through (cold review, 2026-10-11). A literal with no real chroma
// (white, black, the slate grays) is not a hue and is not counted.
export const FAMILIES = {
  gold: [
    /var\(--(?:sk-)?gold(?:-[\w-]+)?\)/g,
    /var\(--(?:task-)?accent-gold\)/g,
    /\bACCENT_GOLD\b/g,
  ],
  teal: [
    /var\(--teal(?:-[\w-]+)?\)/g,
    /var\(--sk-ac(?!-fg\))(?:-[\w-]+)?\)/g, // --sk-ac-fg is text ON the fill, not a hue
    /var\(--(?:task-)?accent-teal\)/g,
    /\bACCENT_TEAL\b/g,
  ],
  red: [
    /var\(--(?:maroon|red)(?:-[\w-]+)?\)/g,
    /var\(--sk-od(?:-[\w-]+)?\)/g,
    /var\(--(?:task-)?accent-coral\)/g,
    /\bACCENT_CORAL\b/g,
  ],
  green: [
    /var\(--green(?:-[\w-]+)?\)/g,
    /var\(--(?:task-)?accent-green\)/g,
    /\bACCENT_GREEN\b/g,
  ],
  orange: [
    /var\(--orange(?:-[\w-]+)?\)/g,
    /var\(--sk-urg(?:-[\w-]+)?\)/g,
    /var\(--(?:task-)?accent-orange\)/g,
    /\bACCENT_ORANGE\b/g,
  ],
  blue: [/var\(--(?:task-)?accent-blue\)/g, /\bACCENT_BLUE\b/g],
  purple: [],
  // The public brand token renders gold everywhere outside .portal-shell
  // (sign-in screen, body-level portals), so it is a raw gold outside the
  // public files: counted unless the file is allowed the 'brand' family.
  brand: [/var\(--job-brand\)/g, /var\(--job-link(?:-hover)?\)/g],
}

// Literal color syntaxes. Each match is classified by hue (literalFamily).
const LITERALS = [
  /(?<![&\w])#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/gi,
  /\brgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi,
  /\bhsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/gi,
  /\boklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/gi,
]

function rgbFamily(r, g, b) {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  if (mx - mn <= 48) return null // gray ramp, white, black, slate
  const d = mx - mn
  let h
  if (mx === r) h = ((g - b) / d) % 6
  else if (mx === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = (h * 60 + 360) % 360
  if (h < 15 || h >= 330) return 'red'
  if (h < 40) return 'orange'
  if (h < 70) return 'gold'
  if (h < 165) return 'green'
  if (h < 200) return 'teal'
  if (h < 260) return 'blue'
  return 'purple'
}

/** The hue family a color literal draws, or null for a neutral. */
export function literalFamily(text) {
  let m
  if ((m = /^#([0-9a-f]+)$/i.exec(text))) {
    let hex = m[1]
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
    return rgbFamily(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16))
  }
  if ((m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(text))) return rgbFamily(+m[1], +m[2], +m[3])
  if ((m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(text))) {
    const [h, s, l] = [+m[1], +m[2] / 100, +m[3] / 100]
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
    const k = l - c / 2
    return rgbFamily((r1 + k) * 255, (g1 + k) * 255, (b1 + k) * 255)
  }
  if ((m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i.exec(text))) {
    const [chroma, h] = [+m[2], +m[3]]
    if (chroma <= 0.04) return null
    if (h < 35 || h >= 350) return 'red'
    if (h < 65) return 'orange'
    if (h < 110) return 'gold'
    if (h < 165) return 'green'
    if (h < 215) return 'teal'
    if (h < 275) return 'blue'
    return 'purple'
  }
  return null
}

// Per-file exceptions: the families whose raw use in that file IS its job.
// The public site (/, /team, /publications, /nick, /nate, /network, /contact,
// /join, /pulse, the public Layout and LabPageLayout, and the components only
// those pages render) keeps gold as its BRAND color: 'gold' (raw) and 'brand'
// (var(--job-brand)). Prefer --job-brand there: inside .portal-shell it
// resolves to gray, so a component shared with the portal goes gray on its own.
const PUBLIC_BRAND = 'public site: gold is the brand color'
const PUB = ['gold', 'brand']
export const ALLOW = {
  // public pages
  'src/pages/Home.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/pages/Team.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/pages/NickLab.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/pages/NateLab.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/pages/Publications.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/pages/PublicationDetail.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/pages/Network.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/pages/Contact.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/pages/JoinPage.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/pages/NotFound.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/pages/Pulse.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/pages/MemberPage.tsx': { families: ['brand'], why: 'shared /team/:slug + portal member page: --job-brand is gold public, gray in .portal-shell' },
  // components rendered only by the public pages above (importers checked 2026-10-11)
  'src/components/Layout.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/LabPageLayout.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/FeaturedResearch.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/LatestDigest.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/RecentActivity.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/ResearchImpact.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/UpcomingMeetingBanner.tsx': { families: PUB, why: PUBLIC_BRAND + ' (Home only)' },
  'src/components/PublicationLibrary.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/PublicationSearch.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/PublicationFilters.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/PublicationTimeline.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/NetworkFilters.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/NetworkBackground.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/CLIFMap.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/pulse/PulseMetric.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/pulse/PulseScene.tsx': { families: PUB, why: PUBLIC_BRAND },
  'src/components/pulse/PulseSparkline.tsx': { families: PUB, why: PUBLIC_BRAND },
  // The /network graph draws on <canvas> (no CSS variables there); its node
  // categories (MN-CCORE gold, CLIF teal/blue) and the sidebar dots that match
  // them stay literal.
  'src/components/CollaborationGraph.tsx': { families: [...PUB, 'teal', 'blue'], why: 'public /network canvas graph categories' },
  'src/components/CollaborationNetwork.tsx': { families: [...PUB, 'teal', 'blue'], why: 'public Home canvas graph categories' },
  'src/components/NetworkSidebar.tsx': { families: [...PUB, 'teal', 'blue'], why: 'public /network legend dots matching the canvas graph' },
  // The sign-in splash renders on a FIXED dark surface whatever the theme, so
  // its brand palette is literal on purpose; JoinSteps renders inside it.
  'src/components/RequireAuth.tsx': { families: [...PUB, 'teal'], why: 'fixed-dark sign-in splash (public front door)' },
  'src/components/JoinSteps.tsx': { families: [...PUB, 'teal'], why: 'public /join + the fixed-dark sign-in splash' },
  // Shared by public and portal; --job-brand is gray inside .portal-shell.
  'src/components/PublicationCard.tsx': { families: ['brand'], why: 'public publication card; gray in .portal-shell' },
  'src/components/MemberFeaturedPublications.tsx': { families: ['brand'], why: 'public member page Featured head; gray in .portal-shell' },
  'src/components/ui/Button.tsx': { families: ['brand'], why: "the 'gold' variant: public brand button, gray in .portal-shell" },
  // The .portal-shell rule that turns --job-brand gray, and the public-site rules that read it.
  'src/index.css': { families: ['brand'], why: 'defines .portal-shell --job-brand and the public classes that read it' },
  // Color-back pick (Nick 2026-10-11): the heartbeat line under page titles.
  'src/components/HeartbeatLine.tsx': { families: ['gold'], why: 'color-back pick: the heartbeat line' },
}

const SKIP_DIR = /^(node_modules|dist|\.cache|__pycache__|coverage|__tests__)$/
const SKIP_FILE = /\.(test|spec)\.(ts|tsx)$/

export function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, f.name)
    if (f.isDirectory()) {
      if (!SKIP_DIR.test(f.name)) walk(fp, out)
    } else if (/\.(ts|tsx|css)$/.test(f.name) && !SKIP_FILE.test(f.name)) {
      out.push(fp)
    }
  }
  return out
}

function blankRange(chars, from, to) {
  for (let i = from; i < to && i < chars.length; i++) if (chars[i] !== '\n') chars[i] = ' '
}

/** CSS: blank block comments only (a `//` in url() is not a comment). */
function stripCss(text) {
  const c = [...text]
  let i = 0
  while (i < c.length) {
    if (c[i] === '/' && c[i + 1] === '*') {
      const s = i
      i += 2
      while (i < c.length && !(c[i] === '*' && c[i + 1] === '/')) i++
      i += 2
      blankRange(c, s, i)
      continue
    }
    i++
  }
  return c.join('')
}

/** Blank import and re-export declarations: naming ACCENT_GOLD there is not a use. */
function stripImports(text) {
  return text.replace(/^\s*(?:import|export)\s[^;]*?from\s*['"][^'"]+['"];?/gms, (m) => m.replace(/[^\n]/g, ' '))
}

/**
 * True when the match at `idx` sits in a custom-property declaration inside a
 * theme token block (`:root`, `.dark`, `html.dark`, `:root:not(.dark)`):
 * that is where a token is DEFINED from the raw palette, not a use.
 */
function inTokenDefinition(code, idx) {
  const open = code.lastIndexOf('{', idx)
  if (open < 0 || code.lastIndexOf('}', idx) > open) return false
  // The selector starts after the previous rule, at-rule (`@import ...;`) or block.
  const prevEnd = Math.max(code.lastIndexOf('}', open - 1), code.lastIndexOf(';', open - 1), code.lastIndexOf('{', open - 1))
  const selector = code.slice(prevEnd + 1, open).trim()
  if (!/^(?::root|\.dark|html\.dark)(?::not\([^)]*\))?$/.test(selector)) return false
  const declStart = Math.max(code.lastIndexOf(';', idx), open) + 1
  return /^\s*--[\w-]+\s*:/.test(code.slice(declStart, idx + 1))
}

/** Every raw hue use in one file: [{ line, family, text }]. */
export function findLeaks(relPath, text) {
  const isCss = relPath.endsWith('.css')
  const code = isCss ? stripCss(text) : stripImports(codeOnly(relPath, text))
  const allowed = new Set(ALLOW[relPath]?.families ?? [])
  const lines = text.split('\n')
  const out = []
  const push = (idx, family, text) => {
    const line = code.slice(0, idx).split('\n').length
    out.push({ line, family, text, src: lines[line - 1]?.trim().slice(0, 140) ?? '' })
  }
  for (const [family, patterns] of Object.entries(FAMILIES)) {
    if (allowed.has(family)) continue
    for (const re of patterns) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(code)) !== null) {
        if (isCss && inTokenDefinition(code, m.index)) continue
        push(m.index, family, m[0])
      }
    }
  }
  for (const re of LITERALS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(code)) !== null) {
      const family = literalFamily(m[0])
      if (!family || allowed.has(family)) continue
      if (isCss && inTokenDefinition(code, m.index)) continue
      push(m.index, family, m[0])
    }
  }
  return out.sort((a, b) => a.line - b.line)
}

/** Count leaks per file for every scanned file under src/. */
export function scan(root = ROOT) {
  const counts = {}
  const leaks = {}
  for (const fp of walk(path.join(root, 'src'))) {
    const rel = path.relative(root, fp).replace(/\\/g, '/')
    const found = findLeaks(rel, fs.readFileSync(fp, 'utf8'))
    if (found.length) {
      counts[rel] = found.length
      leaks[rel] = found
    }
  }
  return { counts, leaks }
}

/** Compare counts to a baseline. Returns { rose: [{file, was, now}], fell: [...] }. */
export function compare(counts, baseline) {
  const rose = []
  const fell = []
  for (const [file, now] of Object.entries(counts)) {
    const was = baseline[file] ?? 0
    if (now > was) rose.push({ file, was, now })
    else if (now < was) fell.push({ file, was, now })
  }
  for (const [file, was] of Object.entries(baseline)) {
    if (!(file in counts) && was > 0) fell.push({ file, was, now: 0 })
  }
  return { rose, fell }
}

/** The baseline only goes down: a lowered copy, or an error naming the rises. */
export function lowerBaseline(counts, baseline) {
  const { rose } = compare(counts, baseline)
  if (rose.length) {
    return { error: rose.map((r) => `${r.file}: ${r.was} -> ${r.now}`) }
  }
  const next = {}
  for (const file of Object.keys(counts).sort()) next[file] = counts[file]
  return { baseline: next }
}

function main() {
  const args = process.argv.slice(2)
  const update = args.includes('--update')
  const init = args.includes('--init')
  const { counts, leaks } = scan()
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  if (init || !fs.existsSync(BASELINE_PATH)) {
    if (!init) {
      console.error('check-color-jobs: no baseline at scripts/check-color-jobs.baseline.json; run with --init once.')
      process.exit(1)
    }
    // --init writes a FIRST baseline only. Over an existing one it would be a
    // one-flag way to raise any count, so it refuses; --update only lowers.
    if (fs.existsSync(BASELINE_PATH)) {
      console.error('check-color-jobs: --init refuses: a baseline already exists. Use --update (it only lowers).')
      process.exit(1)
    }
    const sorted = Object.fromEntries(Object.keys(counts).sort().map((f) => [f, counts[f]]))
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + '\n')
    console.log(`check-color-jobs: baseline written, ${total} raw hue use(s) in ${Object.keys(counts).length} file(s).`)
    return
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))

  if (update) {
    const r = lowerBaseline(counts, baseline)
    if (r.error) {
      console.error('check-color-jobs: --update refuses to RAISE the baseline. These files gained raw hue uses:')
      for (const e of r.error) console.error(`  ${e}`)
      console.error('Route each new use through a --job-* token or the gray ramp first.')
      process.exit(1)
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(r.baseline, null, 2) + '\n')
    console.log(`check-color-jobs: baseline lowered to ${total} use(s) in ${Object.keys(counts).length} file(s).`)
    return
  }

  const { rose, fell } = compare(counts, baseline)
  if (rose.length) {
    console.error('check-color-jobs: raw hue uses ROSE. Each color has one job (rules-ui-design principle 21):')
    console.error('  red = --job-overdue / --job-danger (errors, destructive actions),')
    console.error('  gold = --job-wants / --job-milestone, teal = --job-accent,')
    console.error('  orange = --job-stale, public-site gold = --job-brand; everything else the gray ramp')
    console.error('  (--sk-t1 / --sk-t2 / --sk-t3). Decide each site by its JOB; if it has none, it goes gray.')
    console.error('')
    for (const r of rose) {
      console.error(`  ${r.file}: ${r.was} -> ${r.now}`)
      for (const l of leaks[r.file]) console.error(`    ${r.file}:${l.line}  [${l.family}] ${l.text}   ${l.src}`)
    }
    process.exit(1)
  }
  const note = fell.length ? `; ${fell.length} file(s) went down, run \`node scripts/check-color-jobs.mjs --update\` to lock it in` : ''
  console.log(`check-color-jobs: ${total} raw hue use(s), none new${note}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
