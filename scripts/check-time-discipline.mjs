// scripts/check-time-discipline.mjs — Hub-local R20/R21 mirror (Increment 1A).
// Bans raw `new Date().toISOString()` (R20) and `.toISOString().split|slice`
// (R21) in src/ + api/ outside src/lib/time.ts. WARN mode by default (exit 0);
// CI flips to ERROR after the 1B display-site migration clears the backlog.
//
// This is a Hub-LOCAL stdlib mirror so the CI lint actually runs against the
// Hub tree without depending on a Peripheral-Brain checkout (the schema-drift
// workflow checks out ONLY this repo — a `python ../Peripheral-Brain/...`
// invocation would be a silent file-not-found no-op). The PB-side
// check_sync_antipatterns.py R22/R23 (Python sync writers) stay PB-side.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ENFORCE = process.env.TIME_LINT_MODE === 'enforce';
const ALLOW = new Set(['src/lib/time.ts']);
const R20 = /new Date\(\)\.toISOString\(\)/;
const R21 = /\.toISOString\(\)\.(?:split|slice)\s*\(/;
const hits = [];
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (!/node_modules|dist|\.git/.test(p)) walk(p); continue; }
    if (!/\.(ts|tsx)$/.test(p)) continue;
    const rel = p.replace(/\\/g, '/').replace(/^\.\//, '');
    if ([...ALLOW].some(a => rel.endsWith(a))) continue;
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      const t = line.trimStart();
      if (t.startsWith('//') || t.startsWith('*')) return;
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
