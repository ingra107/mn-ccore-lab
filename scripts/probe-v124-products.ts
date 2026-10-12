#!/usr/bin/env tsx
/**
 * Probe for schema-v124-products.sql on LOCAL D1 (workerd/Miniflare, the same
 * engine wrangler dev uses). Never touches test or prod D1.
 *
 * Usage:  npx tsx scripts/probe-v124-products.ts [--keep]
 *
 * It builds its own local D1 in .wrangler/probe-v124 (HUB_LOCAL_D1_PERSIST, so
 * the dev database is untouched) by running scripts/local-db-bootstrap.ts,
 * which replays bootstrap-schema.sql + every api/schema-v*.sql, v124 included.
 *
 * Part (a): seeds a small fixture, then attempts every wrong state v124 claims
 *   to refuse, one wrangler invocation per attempt, and records D1's refusal
 *   text. Each wrong attempt is paired with a read that proves the wrong row
 *   is absent afterwards. Positive controls prove the refusals are not blanket.
 * Part (b): the Level-1 question for the task/product guard. A composite FK
 *   tasks(project_id, product_id) -> products(project_id, id) needs a rebuild
 *   of tasks. Each variant seeds tasks with task_subtasks / task_handoffs /
 *   task_files children (the three ON DELETE CASCADE children of tasks at
 *   v124; task_updates was dropped by schema-v78) and counts them before and
 *   after the rebuild.
 *
 * Exit 1 if any wrong state is accepted or a control is refused. Part (b) is a
 * measurement, not a pass/fail: it prints what each rebuild form does.
 */

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { orphanProjectTasksSql } from '../api/routes/mutations'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PERSIST = '.wrangler/probe-v124'
const TMP = join(REPO_ROOT, '.wrangler', '_probe-v124-sql')
const CONFIG = join(REPO_ROOT, 'wrangler.local.toml').replace(/\\/g, '/')

function env(): NodeJS.ProcessEnv {
  const e = { ...process.env, HUB_LOCAL_D1_PERSIST: PERSIST }
  delete e.CLOUDFLARE_API_TOKEN
  delete e.CLOUDFLARE_ACCOUNT_ID
  return e
}

let n = 0
type Outcome = { ok: true; rows: Record<string, unknown>[] } | { ok: false; error: string }

/** Run SQL on the probe's local D1. Returns the last statement's rows, or D1's error text. */
function d1(sql: string): Outcome {
  mkdirSync(TMP, { recursive: true })
  const file = join(TMP, `q${++n}.sql`)
  writeFileSync(file, sql, 'utf8')
  const cmd = `npx wrangler d1 execute mnccore-lab --local --config="${CONFIG}" --persist-to="${PERSIST}" --file="${file.replace(/\\/g, '/')}" --json` // wrangler-d1-allowed: --local Miniflare, no cloud auth
  try {
    const out = execSync(cmd, { cwd: REPO_ROOT, env: env(), stdio: ['ignore', 'pipe', 'pipe'] }).toString()
    const parsed = JSON.parse(out) as { results: Record<string, unknown>[] }[]
    return { ok: true, rows: parsed.length ? parsed[parsed.length - 1].results ?? [] : [] }
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string }
    const text = `${err.stdout?.toString() ?? ''}\n${err.stderr?.toString() ?? ''}`
    let msg = ''
    try {
      const j = JSON.parse(err.stdout?.toString() ?? '') as { error?: { text?: string; notes?: { text: string }[] } }
      msg = [j.error?.text, ...(j.error?.notes ?? []).map((x) => x.text)].filter(Boolean).join(' | ')
    } catch { /* noqa: total fallback on the next line -- not JSON, use the raw text */ }
    if (!msg) msg = text.split('\n').filter((l) => /error|constraint|failed|not authorized|no such/i.test(l)).join(' ').trim() || (err.message ?? 'unknown')
    return { ok: false, error: msg.replace(/\s+/g, ' ').slice(0, 220) }
  }
}

function count(sql: string): number {
  const r = d1(sql)
  if (!r.ok) throw new Error(`count query failed: ${sql}: ${r.error}`)
  return Number(Object.values(r.rows[0] ?? { n: -1 })[0])
}

// ── bootstrap ────────────────────────────────────────────────────────────────
console.log('[probe-v124] bootstrapping local D1 at', PERSIST)
execSync('npx tsx scripts/local-db-bootstrap.ts', { cwd: REPO_ROOT, env: env(), stdio: ['ignore', 'pipe', 'inherit'] })
const v = count("SELECT MAX(version) AS n FROM schema_migrations")
console.log(`[probe-v124] schema_migrations max version = ${v}`)

// ── part (a) ─────────────────────────────────────────────────────────────────
const FIXTURE = `
INSERT INTO projects (id, slug, title, category, status, stage) VALUES
  ('proj_PA', 'pa', 'PA', 'MNCCORE', 'active', 'idea'),
  ('proj_PB', 'pb', 'PB', 'MNCCORE', 'active', 'idea'),
  ('proj_PC', 'pc', 'PC', 'MNCCORE', 'active', 'idea');
INSERT INTO products (id, project_id, kind, stage) VALUES
  ('prd_PA1', 'proj_PA', 'manuscript', 'writing'),
  ('prd_PB1', 'proj_PB', 'award', 'active'),
  ('prd_PB2', 'proj_PB', 'grant_application', 'funded'),
  ('prd_PC1', 'proj_PC', 'trial_ops', 'enrolling');
INSERT INTO products (id, project_id, kind, stage, grew_from_id, grew_from_rank, lineage_rank) VALUES
  ('prd_PA2', 'proj_PA', 'manuscript', 'idea', 'prd_PA1', 0, 1);
INSERT INTO tasks (id, project_id, product_id, title, assignee) VALUES
  ('task_P1', 'proj_PA', 'prd_PA1', 'probe task', 'nobody');
`
const fx = d1(FIXTURE)
if (!fx.ok) { console.error('[probe-v124] fixture failed:', fx.error); process.exit(1) }

type Case = { name: string; sql: string; absent: string; control?: boolean }
const cases: Case[] = [
  { name: 'stage not on its kind ladder (manuscript/enrolling)', sql: "INSERT INTO products (id, project_id, kind, stage) VALUES ('prd_X1', 'proj_PA', 'manuscript', 'enrolling')", absent: "SELECT COUNT(*) AS n FROM products WHERE id = 'prd_X1'" },
  { name: 'stage edit off the ladder', sql: "UPDATE products SET stage = 'scored' WHERE id = 'prd_PA1'", absent: "SELECT COUNT(*) AS n FROM products WHERE id = 'prd_PA1' AND stage = 'scored'" },
  { name: 'product of a product (owner = prd_PA1)', sql: "INSERT INTO products (id, project_id, kind, stage) VALUES ('prd_X2', 'prd_PA1', 'manuscript', 'writing')", absent: "SELECT COUNT(*) AS n FROM products WHERE id = 'prd_X2'" },
  { name: 'funded by a non-funding kind (grant_application)', sql: "INSERT INTO product_funding (id, product_id, funder_id, funder_kind) VALUES ('pf_X1', 'prd_PA1', 'prd_PB2', 'grant_application')", absent: "SELECT COUNT(*) AS n FROM product_funding WHERE id = 'pf_X1'" },
  { name: 'funded by, funder kind mislabelled as award', sql: "INSERT INTO product_funding (id, product_id, funder_id, funder_kind) VALUES ('pf_X2', 'prd_PA1', 'prd_PB2', 'award')", absent: "SELECT COUNT(*) AS n FROM product_funding WHERE id = 'pf_X2'" },
  { name: 'CONTROL: funded by an award', control: true, sql: "INSERT INTO product_funding (id, product_id, funder_id, funder_kind) VALUES ('pf_OK', 'prd_PA1', 'prd_PB1', 'award')", absent: "SELECT 1 - COUNT(*) AS n FROM product_funding WHERE id = 'pf_OK'" },
  { name: 'funder kind changed to manuscript under an edge', sql: "UPDATE products SET kind = 'manuscript', stage = 'writing' WHERE id = 'prd_PB1'", absent: "SELECT COUNT(*) AS n FROM products WHERE id = 'prd_PB1' AND kind = 'manuscript'" },
  { name: 'task product from another project (insert)', sql: "INSERT INTO tasks (id, project_id, product_id, title, assignee) VALUES ('task_X1', 'proj_PA', 'prd_PB1', 'x', 'nobody')", absent: "SELECT COUNT(*) AS n FROM tasks WHERE id = 'task_X1'" },
  { name: 'task moved away from its product project (update)', sql: "UPDATE tasks SET project_id = 'proj_PB' WHERE id = 'task_P1'", absent: "SELECT COUNT(*) AS n FROM tasks WHERE id = 'task_P1' AND project_id = 'proj_PB'" },
  { name: 'task with product but no project', sql: "INSERT INTO tasks (id, project_id, product_id, title, assignee) VALUES ('task_X2', NULL, 'prd_PA1', 'x', 'nobody')", absent: "SELECT COUNT(*) AS n FROM tasks WHERE id = 'task_X2'" },
  { name: 'last live product soft-deleted', sql: "UPDATE products SET deleted_at = datetime('now') WHERE id = 'prd_PC1'", absent: "SELECT COUNT(*) AS n FROM products WHERE id = 'prd_PC1' AND deleted_at IS NOT NULL" },
  { name: 'last live product hard-deleted', sql: "DELETE FROM products WHERE id = 'prd_PC1'", absent: "SELECT 1 - COUNT(*) AS n FROM products WHERE id = 'prd_PC1'" },
  { name: 'product project_id moved', sql: "UPDATE products SET project_id = 'proj_PB' WHERE id = 'prd_PA1'", absent: "SELECT COUNT(*) AS n FROM products WHERE id = 'prd_PA1' AND project_id = 'proj_PB'" },
  { name: 'grew_from cycle (PA1 grew from PA2, which grew from PA1)', sql: "UPDATE products SET grew_from_id = 'prd_PA2', grew_from_rank = 1, lineage_rank = 2 WHERE id = 'prd_PA1'", absent: "SELECT COUNT(*) AS n FROM products WHERE id = 'prd_PA1' AND grew_from_id IS NOT NULL" },
  { name: 'grew_from cycle, rank left unchanged', sql: "UPDATE products SET grew_from_id = 'prd_PA2', grew_from_rank = 1 WHERE id = 'prd_PA1'", absent: "SELECT COUNT(*) AS n FROM products WHERE id = 'prd_PA1' AND grew_from_id IS NOT NULL" },
  { name: 'grew_from self-link', sql: "UPDATE products SET grew_from_id = 'prd_PA2', grew_from_rank = 1, lineage_rank = 2 WHERE id = 'prd_PA2'", absent: "SELECT COUNT(*) AS n FROM products WHERE id = 'prd_PA2' AND grew_from_id = 'prd_PA2'" },
  { name: 'grew_from across umbrellas', sql: "INSERT INTO products (id, project_id, kind, stage, grew_from_id, grew_from_rank, lineage_rank) VALUES ('prd_X3', 'proj_PB', 'manuscript', 'idea', 'prd_PA1', 0, 1)", absent: "SELECT COUNT(*) AS n FROM products WHERE id = 'prd_X3'" },
  { name: 'CONTROL: award moves to no-cost extension (Nick, build rulings)', control: true, sql: "UPDATE products SET stage = 'no_cost_extension' WHERE id = 'prd_PB1'", absent: "SELECT 1 - COUNT(*) AS n FROM products WHERE id = 'prd_PB1' AND stage = 'no_cost_extension'" },
  { name: 'CONTROL: trial ops reaches closed past closeout', control: true, sql: "UPDATE products SET stage = 'closeout' WHERE id = 'prd_PC1'; UPDATE products SET stage = 'closed' WHERE id = 'prd_PC1'", absent: "SELECT 1 - COUNT(*) AS n FROM products WHERE id = 'prd_PC1' AND stage = 'closed'" },
  { name: 'CONTROL: award and trial_ops are terminal only at closed (read)', control: true, sql: "SELECT 1", absent: "SELECT COUNT(*) AS n FROM product_stages WHERE kind IN ('award', 'trial_ops') AND ((is_terminal = 1) <> (stage = 'closed'))" },
  { name: 'project soft-delete cascade without clearing product_id (the pre-step-5 statement)', sql: "UPDATE tasks SET project_id = NULL, updated_at = datetime('now') WHERE project_id = 'proj_PA' AND deleted_at IS NULL", absent: "SELECT COUNT(*) AS n FROM tasks WHERE id = 'task_P1' AND project_id IS NULL" },
  // The statement the Worker ships (api/routes/mutations.ts orphanProjectTasksSql,
  // gated into the project soft-delete batch), bound to proj_PA.
  { name: 'CONTROL: the shipped cascade statement clears product_id with project_id', control: true, sql: orphanProjectTasksSql().replace('?', "'proj_PA'"), absent: "SELECT COUNT(*) AS n FROM tasks WHERE id = 'task_P1' AND (project_id IS NOT NULL OR product_id IS NOT NULL)" },
  { name: 'CONTROL: second product, then delete one of two', control: true, sql: "INSERT INTO products (id, project_id, kind, stage) VALUES ('prd_PC2', 'proj_PC', 'infrastructure', 'running'); UPDATE products SET deleted_at = datetime('now') WHERE id = 'prd_PC1'", absent: "SELECT COUNT(*) AS n FROM products WHERE id = 'prd_PC1' AND deleted_at IS NULL" },
]

let failures = 0
const rows: string[] = ['| # | attempt | expected | outcome | D1 text |', '|---|---|---|---|---|']
cases.forEach((c, i) => {
  const r = d1(c.sql)
  const stateOk = count(c.absent) === 0
  const expected = c.control ? 'accepted' : 'refused'
  const got = r.ok ? 'accepted' : 'refused'
  const pass = got === expected && stateOk
  if (!pass) failures++
  rows.push(`| ${i + 1} | ${c.name} | ${expected} | ${pass ? 'PASS' : 'FAIL'} (${got}) | ${r.ok ? '-' : r.error.replace(/\|/g, '/')} |`)
})
console.log('\n## Part (a): wrong states on local D1\n')
console.log(rows.join('\n'))

// ── part (b) ─────────────────────────────────────────────────────────────────
const tasksDdl = d1("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")
if (!tasksDdl.ok) throw new Error(tasksDdl.error)
const ddl = String(tasksDdl.rows[0].sql)
const withFk = (name: string) => ddl
  .replace(/^CREATE TABLE "?tasks"?/, `CREATE TABLE ${name}`)
  .replace(/\)\s*$/, ', FOREIGN KEY (project_id, product_id) REFERENCES products(project_id, id))')

function seedChildren(tag: string): string {
  return `
INSERT INTO tasks (id, project_id, product_id, title, assignee) VALUES ('task_${tag}', 'proj_PA', 'prd_PA1', 'rebuild probe', 'nobody');
INSERT INTO task_subtasks (id, task_id, title) VALUES ('st_${tag}', 'task_${tag}', 's');
INSERT INTO task_handoffs (id, task_id, from_slug, to_slug, situation) VALUES ('th_${tag}', 'task_${tag}', 'a', 'b', 's');
INSERT INTO task_files (id, task_id, filename, url) VALUES ('tf_${tag}', 'task_${tag}', 'f', 'u');`
}
const CHILDREN = "SELECT (SELECT COUNT(*) FROM task_subtasks) + (SELECT COUNT(*) FROM task_handoffs) + (SELECT COUNT(*) FROM task_files) AS n"

type Variant = { name: string; sql: string }
const variants: Variant[] = [
  { name: 'control: no pragma, CREATE new / copy / DROP tasks / RENAME', sql: `
${withFk('tasks_new')};
INSERT INTO tasks_new SELECT * FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;` },
  { name: 'PRAGMA defer_foreign_keys = on, same rebuild', sql: `
PRAGMA defer_foreign_keys = on;
${withFk('tasks_new')};
INSERT INTO tasks_new SELECT * FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;` },
  { name: 'PRAGMA foreign_keys = off, same rebuild', sql: `
PRAGMA foreign_keys = off;
${withFk('tasks_new')};
INSERT INTO tasks_new SELECT * FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
PRAGMA foreign_keys = on;` },
  { name: 'PRAGMA legacy_alter_table = on: RENAME old aside, CREATE tasks, copy, DROP old', sql: `
PRAGMA defer_foreign_keys = on;
PRAGMA legacy_alter_table = on;
ALTER TABLE tasks RENAME TO tasks_old;
${withFk('tasks')};
INSERT INTO tasks SELECT * FROM tasks_old;
DROP TABLE tasks_old;
PRAGMA legacy_alter_table = off;` },
  { name: 'children copied aside, defer_foreign_keys rebuild, children restored', sql: `
PRAGMA defer_foreign_keys = on;
CREATE TABLE _keep_subtasks AS SELECT * FROM task_subtasks;
CREATE TABLE _keep_handoffs AS SELECT * FROM task_handoffs;
CREATE TABLE _keep_files AS SELECT * FROM task_files;
${withFk('tasks_new')};
INSERT INTO tasks_new SELECT * FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
INSERT INTO task_subtasks SELECT * FROM _keep_subtasks;
INSERT INTO task_handoffs SELECT * FROM _keep_handoffs;
INSERT INTO task_files SELECT * FROM _keep_files;
DROP TABLE _keep_subtasks;
DROP TABLE _keep_handoffs;
DROP TABLE _keep_files;` },
]

const brows: string[] = ['| variant | children before | children after | tasks before | tasks after | FK on tasks after | D1 text |', '|---|---|---|---|---|---|---|']
variants.forEach((vt, i) => {
  // Fresh database per variant: a variant that fails half-way must not leak into the next.
  execSync('npx tsx scripts/local-db-bootstrap.ts', { cwd: REPO_ROOT, env: env(), stdio: ['ignore', 'pipe', 'inherit'] })
  const s = d1(FIXTURE + seedChildren(`B${i}`))
  if (!s.ok) throw new Error(`part (b) seed failed: ${s.error}`)
  const cb = count(CHILDREN)
  const tb = count('SELECT COUNT(*) AS n FROM tasks')
  const r = d1(vt.sql)
  const ca = count(CHILDREN)
  const ta = count('SELECT COUNT(*) AS n FROM tasks')
  const fk = d1("SELECT COUNT(*) AS n FROM pragma_foreign_key_list('tasks') WHERE \"table\" = 'products'")
  const fkn = fk.ok ? Number(Object.values(fk.rows[0])[0]) : -1
  brows.push(`| ${vt.name} | ${cb} | ${ca} | ${tb} | ${ta} | ${fkn > 0 ? 'composite FK present' : 'absent'} | ${r.ok ? 'ok' : r.error.replace(/\|/g, '/')} |`)
})
console.log('\n## Part (b): tasks rebuild under each pragma, local D1\n')
console.log(brows.join('\n'))

if (!process.argv.includes('--keep')) rmSync(TMP, { recursive: true, force: true })
console.log(`\n[probe-v124] part (a): ${cases.length - failures}/${cases.length} as expected`)
process.exit(failures === 0 ? 0 : 1)
