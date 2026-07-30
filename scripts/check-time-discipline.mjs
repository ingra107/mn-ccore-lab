// scripts/check-time-discipline.mjs — Hub-local R20/R21 mirror (Increment 1A).
// Bans raw `new Date().toISOString()` (R20) and `.toISOString().split|slice`
// (R21) in src/ + api/ outside the allowlist. WARN mode by default (exit 0);
// CI runs in ERROR mode — Plan 1B migration complete (2026-05-25), all sites
// use canonical helpers; any new R20/R21 hit hard-fails the build.
//
// This is a Hub-LOCAL stdlib mirror so the CI lint actually runs against the
// Hub tree without depending on a Peripheral-Brain checkout (the schema-drift
// workflow checks out ONLY this repo — a `python ../Peripheral-Brain/...`
// invocation would be a silent file-not-found no-op). The PB-side
// check_sync_antipatterns.py R22/R23 (Python sync writers) stay PB-side.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ENFORCE = process.env.TIME_LINT_MODE === 'enforce';
const ALLOW = new Set(['src/lib/time.ts', 'api/lib/time.ts', 'api/lib/ct-date.ts']);
const R20 = /new Date\(\)\.toISOString\(\)/;
const R21 = /\.toISOString\(\)\.(?:split|slice)\s*\(/;

// Per-line escape hatch, mirroring the PB-side convention this file claims to
// mirror (scripts/db/check_sync_antipatterns.py: "any line/file with
// `# anti-pattern-allowed: <reason>` (or // / -- variants) within 8 lines
// above the hit"). Until 2026-07-30 the Hub copy had NO marker support at all
// — only the 3-file ALLOW set above — so a correct, already-justified site had
// no way to pass. Two such sites existed (api/routes/hermes.ts:103 and its
// test): pure all-UTC civil-date arithmetic anchored at T00:00:00Z, each
// carrying a reasoned marker its author had every reason to think was honoured.
// Nobody saw the contradiction because this step had not RUN since 2026-07-22
// — the drift diff failed first and skipped it. Fixing the diff is what made
// this visible.
// A file-level ALLOW entry was the alternative and is worse: it blinds the
// rule for the whole file, so a genuinely wrong future toISOString() in the
// same route goes unreported. The marker is line-scoped and states its reason.
const MARKER = /anti-pattern-allowed:/;
const FILE_MARKER = /anti-pattern-allowed-file:/;
const MARKER_LOOKBACK = 8;
const hits = [];
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (!/node_modules|dist|\.git/.test(p)) walk(p); continue; }
    if (!/\.(ts|tsx)$/.test(p)) continue;
    const rel = p.replace(/\\/g, '/').replace(/^\.\//, '');
    if ([...ALLOW].some(a => rel.endsWith(a))) continue;
    const text = readFileSync(p, 'utf8');
    if (FILE_MARKER.test(text)) continue;
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const t = line.trimStart();
      if (t.startsWith('//') || t.startsWith('*')) return;
      if (!R20.test(line) && !R21.test(line)) return;
      // marker on the hit line itself, or on any of the 8 lines above it
      const from = Math.max(0, i - MARKER_LOOKBACK);
      if (lines.slice(from, i + 1).some(l => MARKER.test(l))) return;
      if (R20.test(line)) hits.push(`R20 ${rel}:${i + 1}: ${line.trim()}`);
      if (R21.test(line)) hits.push(`R21 ${rel}:${i + 1}: ${line.trim()}`);
    });
  }
}
['src', 'api'].forEach(d => { try { walk(d); } catch {} });
if (hits.length) {
  console.error(`[time-discipline] ${hits.length} hit(s):\n` + hits.join('\n'));
  process.exit(ENFORCE ? 1 : 0);
}
console.log('[time-discipline] OK');
