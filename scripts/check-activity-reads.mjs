#!/usr/bin/env node
// check-activity-reads.mjs — the hidden-thread read gate (Hermes wave, Phase 1).
//
// WHY THIS EXISTS: `activity_entries` gains a per-thread `hidden_at` (dismiss =
// hide-from-frontend-but-retain). A missed read site leaks a dismissed thread
// into a feed, a search result, a badge, a PB /process queue, or a health score
// — silently, with no error anywhere. Rules do not prevent that class; an
// executable check plus a shared predicate does (codex ethos #4; the repo
// already does this for time discipline via check-time-discipline.mjs and for
// wrangler-d1 via the pre-commit hook).
//
// TWO ENUMERATIONS ALREADY UNDERCOUNTED THIS TABLE before the checker existed:
// the plan's hand-written §2.5 said 25, an independent survey said 36, and the
// real grep is ~40+ SELECT reads including three sites (activity-entry.ts write-
// path read-backs) neither had listed. That is the whole argument for driving
// the retrofit off THIS script's output, not off any prose list.
//
// THE GATE (per statement that reads FROM/JOIN activity_entries):
//   pass  ⇔  it carries the `activityHiddenClause` marker comment exemption,
//            OR every read-reference is matched by a hidden guard.
//   A hidden guard is `hidden_at IS NULL` OR an interpolated `activityHiddenClause(`
//   call (the sanctioned primitive — its include=true branch returns 1=1 for the
//   "show hidden" affordance, and trusting the helper is the point of having one).
//
// ⚠️ It deliberately does NOT accept the bare substring `hidden_at`: every feed
// also SELECTs the column to render the dismiss affordance, so a substring check
// would green-light a read that selects the column and never filters on it — a
// checker that passes while the leak is live is worse than none. It matches the
// PREDICATE, and it counts guards-vs-reads so a guarded main query with an
// unguarded reply_count subquery in the SAME literal still fails.
//
// Writes (DELETE / INSERT / UPDATE, incl. INSERT ... RETURNING *) never leak a
// hidden row and are skipped.
//
// EXEMPT a read with a marker comment on one of its lines:
//   // activity-hidden-exempt: <reason>
// Legitimate exemptions are auth-only lookups, Hermes-internal routing, write-
// path read-backs, and the dispatchHermes transcript (owner requirement: Hermes
// must still see dismissed threads or "remember this morning" breaks).
//
// Usage:
//   node scripts/check-activity-reads.mjs           # gate: exit 1 if any unguarded read
//   node scripts/check-activity-reads.mjs --list     # enumerate every read site + verdict
//
// PROVE THE GATE BEFORE TRUSTING IT (ethos #4): plant an unguarded read, confirm
// this FAILS, revert, confirm it PASSES. A gate never observed failing is an
// assumption, not a control.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'api');
const MARKER = 'activity-hidden-exempt:';

/** Walk api/ for .ts files, excluding *.test.ts. */
function collectFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...collectFiles(p));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/**
 * Extract every string / template literal in `src` that mentions
 * activity_entries, returning { text, startLine, endLine }. Handles ' " and `
 * literals, escapes, and `${…}` interpolations (brace-depth skip so an inner
 * quote inside an interpolation can't prematurely close the template).
 */
function extractSqlLiterals(src) {
  const lits = [];
  let i = 0;
  const n = src.length;
  const lineAt = (idx) => {
    // 1-based line for a char offset. Cheap; called only on hits.
    let line = 1;
    for (let k = 0; k < idx && k < n; k++) if (src[k] === '\n') line++;
    return line;
  };
  while (i < n) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      const start = i;
      i++;
      let buf = '';
      while (i < n) {
        const c = src[i];
        if (c === '\\') { buf += src[i + 1] ?? ''; i += 2; continue; }
        if (quote === '`' && c === '$' && src[i + 1] === '{') {
          // Skip the interpolation body by brace depth; keep a space so tokens
          // on either side don't fuse when flattened.
          buf += ' ';
          i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            if (depth > 0) buf += src[i];
            i++;
          }
          continue;
        }
        if (c === quote) { i++; break; }
        buf += c;
        i += 1;
      }
      if (/activity_entries/i.test(buf)) {
        lits.push({ text: buf, startLine: lineAt(start), endLine: lineAt(i) });
      }
    } else {
      i++;
    }
  }
  return lits;
}

const flatten = (s) => s.replace(/\s+/g, ' ').trim();

/** Count read-references: activity_entries after FROM or JOIN, EXCLUDING
 *  `DELETE FROM activity_entries` (a delete removes a row, it cannot leak a
 *  hidden one). INSERT uses INTO, not FROM, so it never matches here. A DELETE
 *  whose WHERE has an activity_entries SUBQUERY still counts that subquery read
 *  (the subquery FROM is not preceded by DELETE). */
function countReadRefs(flat) {
  const all = (flat.match(/\b(?:FROM|JOIN)\s+activity_entries\b/gi) || []).length;
  const del = (flat.match(/\bDELETE\s+FROM\s+activity_entries\b/gi) || []).length;
  return all - del;
}

/** Count hidden guards: `hidden_at IS NULL` + interpolated helper calls. */
function countGuards(flat) {
  const direct = (flat.match(/hidden_at\s+IS\s+NULL/gi) || []).length;
  const helper = (flat.match(/activityHiddenClause\s*\(/g) || []).length;
  return direct + helper;
}

function verdictFor(lit, fileLines) {
  const flat = flatten(lit.text);
  const reads = countReadRefs(flat);
  if (reads === 0) return { kind: 'write-or-nonread', reads, guards: 0 };
  // Exemption marker on any line the statement spans (or the line just above the
  // opening quote — writers often put the reason immediately before).
  for (let ln = Math.max(1, lit.startLine - 1); ln <= lit.endLine; ln++) {
    if ((fileLines[ln - 1] || '').includes(MARKER)) {
      return { kind: 'exempt', reads, guards: 0 };
    }
  }
  const guards = countGuards(flat);
  return { kind: guards >= reads ? 'guarded' : 'UNGUARDED', reads, guards };
}

const list = process.argv.includes('--list');
const files = collectFiles(API_DIR);
const rows = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const fileLines = src.split('\n');
  for (const lit of extractSqlLiterals(src)) {
    const v = verdictFor(lit, fileLines);
    if (v.kind === 'write-or-nonread') continue;
    rows.push({
      site: `${file.replace(/\\/g, '/').replace(/.*\/api\//, 'api/')}:${lit.startLine}`,
      ...v,
    });
  }
}

const unguarded = rows.filter((r) => r.kind === 'UNGUARDED');

if (list || unguarded.length) {
  const shown = list ? rows : unguarded;
  const label = list ? 'ALL activity_entries reads' : 'UNGUARDED activity_entries reads';
  console.log(`\n[check-activity-reads] ${label} (${shown.length}):\n`);
  for (const r of shown.sort((a, b) => a.site.localeCompare(b.site))) {
    const tag =
      r.kind === 'UNGUARDED' ? 'LEAK  ' : r.kind === 'exempt' ? 'exempt' : 'ok    ';
    console.log(`  ${tag} ${r.site}   reads=${r.reads} guards=${r.guards}`);
  }
}

const reads = rows.length;
const guarded = rows.filter((r) => r.kind === 'guarded').length;
const exempt = rows.filter((r) => r.kind === 'exempt').length;
console.log(
  `\n[check-activity-reads] ${reads} read statement(s): ${guarded} guarded, ${exempt} exempt, ${unguarded.length} UNGUARDED.`
);

if (unguarded.length) {
  console.error(
    `\n✖ ${unguarded.length} activity_entries read(s) neither carry \`hidden_at IS NULL\`/` +
      `activityHiddenClause(...) nor a \`${MARKER} <reason>\` marker. A dismissed thread ` +
      `would leak here. Add the predicate or the marker.\n`
  );
  process.exit(1);
}
console.log('✓ every activity_entries read is guarded or exempt.\n');
