#!/usr/bin/env node
// gen-session-header.mjs — regenerate the AUTO-GENERATED current-state block at the
// top of SESSION-HANDOFF.md from canonical sources (git + prod D1). Part of the
// 2026-06-15 "shrink + generate the session handoff" plan
// (docs/superpowers/plans/2026-06-15-session-handoff-shrink-generate.md).
//
// PRINCIPLE: state is GENERATED from queries, never typed from memory. (A query is
// not infallible — it can fail, hit the wrong env, or return a bad shape — so this
// script FAILS LOUD/CLOSED rather than emit a clean-looking-but-wrong header.) The
// block is DESCRIPTIVE only (HEAD, counts, next_action); it never asserts "all
// clean / tests green" — a generated success claim is the failure mode we avoid.
//
// STATUS: tested 2026-06-15 — `--check` produced a correct header from git+D1 and
// correctly failed the 1291-line file over the 80-line cap. Hardened per codex
// plan-audit (fail-closed D1 parse, atomic write, hard-fail on missing project row,
// objective updated_at-vs-HEAD stale check). D1 reads go through `scripts/wrangler-d1`
// (mandatory wrapper per CLAUDE.md — strips the Pages token that shadows D1 OAuth).

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SLUG = 'mn-ccore-lab-hub';
const HANDOFF = 'SESSION-HANDOFF.md';
const BEGIN = '<!-- BEGIN GENERATED STATE -->';
const END = '<!-- END GENERATED STATE -->';
const MAX_LINES = 80; // length cap. NOTE: only a real primitive when also enforced
                      // in .githooks/pre-commit + CI; bumping this constant = a policy change.

// Pin to bash: the wrangler-d1 wrapper is a bash script, and git --pretty formats
// behave consistently. (node-from-cmd would default to cmd.exe.)
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', shell: 'bash' }).trim();

// ONE wrangler/bash spawn for N statements (minimize MSYS fork exposure). --json
// returns one block per ;-separated statement: [{results:[...]}, ...]. FAIL CLOSED:
// throw on any unexpected shape or block-count mismatch rather than return [] (a
// silent [] would render a clean header with wrong/zero values).
function d1batch(sqls) {
  const out = sh(`bash scripts/wrangler-d1 d1 execute mnccore-lab --remote --json --command ${JSON.stringify(sqls.join('; '))}`);
  let json;
  try { json = JSON.parse(out); } catch { throw new Error(`D1 returned non-JSON:\n${out.slice(0, 500)}`); }
  const blocks = Array.isArray(json) ? json : [json];
  if (blocks.length !== sqls.length) {
    throw new Error(`D1 returned ${blocks.length} result blocks, expected ${sqls.length} — shape changed; refusing to emit a header.`);
  }
  return blocks.map((b, i) => {
    const r = b?.results ?? b?.result?.[0]?.results;
    if (!Array.isArray(r)) throw new Error(`D1 block ${i} has no results array — refusing to emit a header.`);
    return r;
  });
}

function gitFacts() {
  // ONE bash spawn for all git facts. rev-parse emits head + branch on two lines;
  // log emits ISO-date<TAB>hash subject per commit (TAB + newline split are both
  // safe against commit-subject content). HEAD commit date drives the stale check.
  const raw = sh('git rev-parse --short HEAD --abbrev-ref HEAD; git log -5 --pretty=format:%cI%x09%h%x20%s');
  const lines = raw.split('\n');
  const head = lines[0]?.trim();
  const branch = lines[1]?.trim();
  const logLines = lines.slice(2).filter(Boolean);
  if (!head || !branch || logLines.length === 0) throw new Error('git facts unparseable — refusing to emit a header.');
  const headDateISO = logLines[0].split('\t')[0];
  const commits = logLines.map((l) => `  - ${l.split('\t')[1] ?? l}`).join('\n');
  return { head, branch, headDateISO, commits };
}

function d1Facts() {
  // 3 statements, ONE spawn.
  const [projRows, taskRows, tableRows] = d1batch([
    `SELECT status, stage, next_action, updated_at FROM projects WHERE slug='${SLUG}' LIMIT 1`,
    `SELECT t.status, COUNT(*) n FROM tasks t JOIN projects p ON p.id=t.project_id WHERE p.slug='${SLUG}' AND t.deleted_at IS NULL GROUP BY t.status`,
    `SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`,
  ]);
  return {
    proj: projRows[0] || null,                       // null (not {}) → buildBlock fails closed
    todo: taskRows.find((t) => t.status === 'todo')?.n ?? 0,
    tableCount: tableRows[0]?.n,
  };
}

// Advisory staleness signals (NOT a hard gate). (a) past-tense words; (b) objective:
// the project row hasn't been touched since the latest commit.
function staleNextAction(nextAction, updatedAt, headDateISO) {
  if (!nextAction) return 'next_action is EMPTY';
  if (/\b(DONE|SHIPPED|DEPLOYED|COMPLETED?|MERGED)\b/i.test(nextAction)) {
    return 'next_action reads PAST-TENSE — likely describes finished work, not a next step';
  }
  if (updatedAt && headDateISO && new Date(updatedAt) < new Date(headDateISO)) {
    return `next_action may be stale — project untouched (updated ${String(updatedAt).slice(0, 10)}) since the latest commit (${headDateISO.slice(0, 10)})`;
  }
  return null;
}

function buildBlock() {
  const g = gitFacts();
  const d = d1Facts();
  if (!d.proj) throw new Error(`project '${SLUG}' not found in D1 — refusing to emit a fabricated header.`);
  const stale = staleNextAction(d.proj.next_action, d.proj.updated_at, g.headDateISO);
  const stamp = new Date().toISOString();
  return [
    BEGIN,
    `<!-- Auto-generated by scripts/gen-session-header.mjs — do NOT hand-edit. Re-run to refresh. -->`,
    `# ▶ Current state — generated ${stamp}`,
    ``,
    `- **Branch / HEAD:** \`${g.branch}\` @ \`${g.head}\``,
    `- **Project:** ${SLUG} — status \`${d.proj.status ?? '?'}\`, stage \`${d.proj.stage ?? '?'}\``,
    `- **Next action:** ${d.proj.next_action ?? '(none set)'}${stale ? `  \n  ⚠ ${stale}` : ''}`,
    `- **Open work:** ${d.todo} todo task(s) on TODAY · ${d.tableCount ?? '?'} D1 tables`,
    `- **Last 5 commits:**`,
    g.commits,
    END,
  ].join('\n');
}

// Replace the BEGIN..END span. Validate sentinel sanity (fail closed on malformed).
function replaceBlock(content, block) {
  const i = content.indexOf(BEGIN);
  const j = content.indexOf(END);
  if (i === -1 && j === -1) return `${block}\n\n${content}`; // first run: prepend
  if (i === -1 || j === -1 || j < i) {
    throw new Error('SESSION-HANDOFF.md has malformed/incomplete generated-state sentinels — fix by hand before regenerating.');
  }
  return content.slice(0, i) + block + content.slice(j + END.length);
}

const check = process.argv.includes('--check');
const block = buildBlock();
const current = (() => { try { return readFileSync(HANDOFF, 'utf8'); } catch { return ''; } })();
const next = replaceBlock(current, block);
const lineCount = next.split('\n').length;

if (check) {
  console.log(block);
  console.log(`\n[check] resulting ${HANDOFF} = ${lineCount} lines (cap ${MAX_LINES})`);
  if (lineCount > MAX_LINES) {
    console.error(`[FAIL] over cap — move history to CHANGELOG.md, keep only the in-flight pointers.`);
    process.exit(1);
  }
  process.exit(0);
}

// ATOMIC-ish: reject BEFORE writing, so a failed run never leaves an over-cap file.
if (lineCount > MAX_LINES) {
  console.error(`[FAIL] ${HANDOFF} would be ${lineCount} > ${MAX_LINES} lines — NOT written. Trim to the in-flight pointers (history → CHANGELOG.md).`);
  process.exit(1);
}
writeFileSync(HANDOFF, next);
console.log(`[ok] regenerated ${HANDOFF} header (${lineCount} lines).`);
