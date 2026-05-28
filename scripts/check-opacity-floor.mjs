// scripts/check-opacity-floor.mjs — Phase 7 design ethos lint.
//
// Scans src/**/*.{ts,tsx,css} for `opacity: 0.30..0.84` on text-bearing
// elements. WARN mode by default (exit 0); CI/enforce mode flips when
// the worst-offender backlog is migrated.
//
// Rule: dark-mode (and gold-on-white) text below 0.85 opacity tends to
// fail axe AA contrast checks (~3:1 instead of 4.5:1). Use 0.85 as the
// floor for secondary text; reserve 0.30-0.70 for decorative chrome
// (borders, inactive dots, divider lines, watermark glyphs). See
// docs/design-system.md "Opacity policy" + CLAUDE.md rules section.
//
// T2.9 STATUS (2026-05-28): the lint surfaces 331 text-bearing sub-0.85
// sites across ~80 files. Flipping the default to ENFORCE today would block
// every npm run lint:opacity invocation immediately. Cleanup of 331 sites
// is a multi-session backlog (each site needs visual verification — some
// are decorative-on-text borderlines the heuristic can't resolve). DEFERRED
// the ENFORCE-default flip until the backlog is migrated below ~10. Until
// then: ENFORCE remains opt-in via `OPACITY_LINT_MODE=enforce npm run
// lint:opacity` so reviewers can spot-check their own diffs.
//
// Migration plan: chunk the 331 hits by file (top offenders:
// pages/TrajectoryPage.tsx=14, pages/portal/PersonalPage.tsx=12,
// components/RevisionTracker.tsx=9, pages/MemberPage.tsx=9,
// pages/MyItems.tsx=8, pages/portal/IdeasPage.tsx=8), then sweep file-by-
// file in a future commit. Each fix: bump to 0.85 OR rewrite as color (e.g.
// `color: var(--muted)`). Once the backlog drops below ~10, flip the
// default and clean up the rest in the same commit.
//
// Heuristic — text-bearing if any of:
//   - inline style block on the SAME element also sets `color:` (the
//     opacity dims the text)
//   - className/tag suggests text (span, p, h1-h6, label, button,
//     "title", "label", "text-")
// Decorative — flagged but lower-confidence:
//   - borderColor, backgroundColor, dot/dash glyphs (▾ ▸ • ·),
//     standalone svg without text children
//
// Output: WARN list grouped by file:line + opacity value. Hit count.
// Exit 0 in WARN mode; exit 1 in ENFORCE mode if any hits remain.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ENFORCE = process.env.OPACITY_LINT_MODE === 'enforce';
const SKIP_DIRS = /node_modules|dist|\.git|\.cache|coverage|__pycache__/;

// Matches:  opacity: 0.42   |   opacity={0.55}  |  style={{ opacity: 0.7 ... }}
// Captures the numeric value. Range filter applied after.
const OPACITY_RE = /opacity\s*[:=]\s*\{?\s*(0?\.\d+|0|1(?:\.0+)?)\s*\}?/g;

const FLOOR_MIN = 0.30;
const FLOOR_MAX = 0.84;

const TEXT_HINT = /(?:<(?:span|p|h[1-6]|label|button|a|li|td|th|div)\b)|(?:className=["'`][^"'`]*\b(?:text-|font-|title|label|heading|metric|caption)[^"'`]*["'`])|(?:color\s*:\s*)/;
const DECORATIVE_HINT = /(?:borderColor|background(?:Color)?|stroke|fill|boxShadow|outline)\s*[:=]|<svg|<path|<circle|<rect|<line|▾|▸|•|·|⋮|⋯/;

const hits = [];
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (!SKIP_DIRS.test(p)) walk(p);
      continue;
    }
    if (!/\.(ts|tsx|css)$/.test(p)) continue;
    const rel = p.replace(/\\/g, '/').replace(/^\.\//, '');
    if (rel.endsWith('check-opacity-floor.mjs')) continue;
    const text = readFileSync(p, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      // Look at ±3 lines of context to judge text vs decorative.
      const ctxStart = Math.max(0, i - 3);
      const ctxEnd = Math.min(lines.length, i + 4);
      const context = lines.slice(ctxStart, ctxEnd).join(' ');
      OPACITY_RE.lastIndex = 0;
      let m;
      while ((m = OPACITY_RE.exec(line)) !== null) {
        const val = parseFloat(m[1]);
        if (val < FLOOR_MIN || val > FLOOR_MAX) continue;
        // Bias: only flag if the surrounding context implies text. If
        // the line itself or nearby clearly says "borderColor/background/
        // svg/path/dot-glyph", treat as decorative and skip.
        const textish = TEXT_HINT.test(context);
        const decorish = DECORATIVE_HINT.test(line) || DECORATIVE_HINT.test(context);
        if (decorish && !textish) continue;
        if (!textish) continue;
        hits.push({ file: rel, line: i + 1, value: val, snippet: line.trim().slice(0, 140) });
      }
    }
  }
}

['src'].forEach(d => { try { walk(d); } catch {} });

if (hits.length) {
  // Group by file
  const byFile = new Map();
  for (const h of hits) {
    if (!byFile.has(h.file)) byFile.set(h.file, []);
    byFile.get(h.file).push(h);
  }
  console.error(`[opacity-floor] ${hits.length} text-bearing site(s) with opacity in [${FLOOR_MIN}, ${FLOOR_MAX}]:`);
  // Top 30 worst offenders (lowest opacity first)
  const worst = [...hits].sort((a, b) => a.value - b.value).slice(0, 30);
  for (const h of worst) {
    console.error(`  ${h.file}:${h.line}  opacity=${h.value}  ${h.snippet}`);
  }
  if (hits.length > 30) console.error(`  … and ${hits.length - 30} more`);
  console.error(`\n[opacity-floor] by-file count:`);
  const counts = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [f, list] of counts.slice(0, 20)) {
    console.error(`  ${list.length.toString().padStart(4)}  ${f}`);
  }
  if (counts.length > 20) console.error(`  … and ${counts.length - 20} more files`);
  process.exit(ENFORCE ? 1 : 0);
}
console.log('[opacity-floor] OK — no sub-0.85 opacity on text-bearing elements');
