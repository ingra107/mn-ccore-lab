/**
 * Phase A: Initial bulk load of brain.db tasks → D1.
 *
 * Reads tasks from brain.db, maps fields to D1 schema, generates SQL
 * for execution via: wrangler d1 execute mnccore-lab --file=scripts/sync-tasks.sql --remote
 *
 * Usage:
 *   npx tsx scripts/sync-brain-tasks.ts <brain-db-path> --dry-run       # report only
 *   npx tsx scripts/sync-brain-tasks.ts <brain-db-path> --active-only   # 19 active tasks
 *   npx tsx scripts/sync-brain-tasks.ts <brain-db-path> --all           # all 537 tasks
 *
 * brain.db path:
 *   Home:  C:\Users\ingra\Peripheral-Brain\data\brain.db
 *   Work:  C:\Users\ingra107\Peripheral-Brain\data\brain.db
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Helpers (from seed-d1.ts) ─────────────────────────────────────────────

function esc(value: string | null | undefined): string {
  if (value == null) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

function numOrNull(value: number | boolean | null | undefined): string {
  if (value == null) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

// ── Configuration ─────────────────────────────────────────────────────────

// brain.db slugs that differ from D1 original slugs
// Copied from sync_d1_push.py:95-104
const SLUG_REMAP: Record<string, string> = {
  'clif-p1-gender-disparities-ltv': 'p1-gender-disparities-low-tidal-volume',
  'clif-p2-volume-vs-pressure-control': 'volume-vs-pressure-control-mortality',
  'clif-p3-hypothermia-rewarming-rates': 'hypothermia-rewarming-rates',
  'clif-p4-icu-quality-metrics': 'p4-icu-quality-metrics',
  'clif-proning-incidence-severe-arf': 'proning-incidence-in-severe-arf',
  'clinical-implications-of-sepsis': 'clinical-implications-of-sepsis-definitions',
  'dnr-provider-variation-mesfin': 'dnr-provider-variation',
  'decision-making-styles-of-medical': 'decision-making-survey-gdms',
};

// Sanitize: strip local file paths (useless outside Nick's machine)
function sanitizeDescription(notes: string | null): string | null {
  if (!notes) return null;
  return notes.trim() || null;
}

// ── Types ─────────────────────────────────────────────────────────────────

interface BrainTask {
  id: string;
  name: string;
  project_id: string | null;
  project_name: string | null;
  due_date: string | null;
  status: string | null;
  completed: number;
  notes: string | null;
  assignee: string | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  blocked_by: string | null;
}

interface BrainProject {
  id: string;
  name: string;
  slug: string | null;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Parse args
  const dbPath = args.find(a => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const activeOnly = args.includes('--active-only');
  const all = args.includes('--all');
  const useApi = args.includes('--api');

  if (!dbPath) {
    console.error('Usage: npx tsx scripts/sync-brain-tasks.ts <brain-db-path> [--dry-run] [--active-only|--all] [--api]');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx scripts/sync-brain-tasks.ts /c/Users/ingra/Peripheral-Brain/data/brain.db --dry-run');
    console.error('  npx tsx scripts/sync-brain-tasks.ts /c/Users/ingra/Peripheral-Brain/data/brain.db --active-only');
    console.error('  npx tsx scripts/sync-brain-tasks.ts /c/Users/ingra/Peripheral-Brain/data/brain.db --all');
    console.error('  npx tsx scripts/sync-brain-tasks.ts /c/Users/ingra/Peripheral-Brain/data/brain.db --all --api');
    console.error('');
    console.error('--api: POST to Hub API instead of generating SQL (no wrangler needed)');
    process.exit(1);
  }

  if (!activeOnly && !all && !dryRun) {
    console.error('ERROR: Must specify --active-only or --all (or --dry-run for report only)');
    process.exit(1);
  }

  // Open brain.db
  const db = new Database(dbPath, { readonly: true });

  // ── Step 1: Schema discovery ──────────────────────────────────────────

  const taskCols = db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string; type: string }>;
  console.log('=== brain.db tasks schema ===');
  for (const col of taskCols) {
    console.log(`  ${col.name} (${col.type})`);
  }
  console.log('');

  // ── Step 2: Build project mapping ─────────────────────────────────────

  const projects = db.prepare('SELECT id, name, slug FROM projects').all() as BrainProject[];
  const projectMap = new Map<string, string>(); // brain.db recXXX → D1 slug

  for (const p of projects) {
    let slug = p.slug || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
    slug = SLUG_REMAP[slug] ?? slug;
    projectMap.set(p.id, slug);
  }

  console.log(`=== Project mapping: ${projectMap.size} brain.db projects ===`);

  // ── Step 3: Read tasks ────────────────────────────────────────────────

  let whereClause = '';
  if (activeOnly) {
    whereClause = 'WHERE completed = 0';
  }
  // --all means no WHERE clause (include everything)

  const tasks = db.prepare(`
    SELECT id, name, project_id, project_name, due_date, status,
           completed, notes, assignee, created_at, updated_at,
           completed_at, blocked_by
    FROM tasks
    ${whereClause}
    ORDER BY created_at
  `).all() as BrainTask[];

  const activeCount = tasks.filter(t => t.completed === 0).length;
  const completedCount = tasks.filter(t => t.completed === 1).length;

  console.log(`=== Task counts ===`);
  console.log(`  Total: ${tasks.length}`);
  console.log(`  Active: ${activeCount}`);
  console.log(`  Completed: ${completedCount}`);
  console.log('');

  // Status distribution
  const statusDist: Record<string, number> = {};
  for (const t of tasks) {
    const s = t.status ?? 'null';
    statusDist[s] = (statusDist[s] ?? 0) + 1;
  }
  console.log('=== Status distribution ===');
  for (const [s, count] of Object.entries(statusDist)) {
    console.log(`  ${s}: ${count}`);
  }
  console.log('');

  // ── Step 4: Map fields and track project coverage ─────────────────────

  let mapped = 0;
  let unmapped = 0;
  const unmappedProjects = new Set<string>();
  let redactedCount = 0;

  interface D1Task {
    id: string;
    meeting_id: string | null;
    project_id: string | null;
    title: string;
    description: string | null;
    assignee: string;
    assigned_by: string | null;
    due_date: string | null;
    priority: string;
    status: string;
    source: string;
    completed: number;
    completed_at: string | null;
    completed_by: string | null;
    created_at: string | null;
  }

  const d1Tasks: D1Task[] = [];

  for (const t of tasks) {
    // Project mapping
    let projectSlug: string | null = null;
    if (t.project_id) {
      const slug = projectMap.get(t.project_id);
      if (slug) {
        projectSlug = slug;
        mapped++;
      } else {
        unmapped++;
        unmappedProjects.add(t.project_name ?? t.project_id);
      }
    }

    // Status mapping: brain.db Active/Waiting → D1 todo/blocked/done
    let d1Status: string;
    if (t.completed === 1) {
      d1Status = 'done';
    } else if (t.blocked_by) {
      d1Status = 'blocked';
    } else if (t.status === 'Waiting') {
      d1Status = 'blocked'; // Waiting ≈ blocked (waiting on someone/something)
    } else {
      d1Status = 'todo';
    }

    // Description: sanitize private data from notes
    const desc = sanitizeDescription(t.notes);
    if (t.notes && desc !== t.notes) {
      redactedCount++;
    }

    d1Tasks.push({
      id: t.id,
      meeting_id: null, // brain.db tasks don't track meeting origin
      project_id: projectSlug,
      title: t.name,
      description: desc,
      assignee: t.assignee ?? 'nick',
      assigned_by: null,
      due_date: t.due_date,
      priority: 'medium',
      status: d1Status,
      source: 'sync',
      completed: t.completed,
      completed_at: t.completed_at,
      completed_by: t.completed === 1 ? 'nick' : null,
      created_at: t.created_at,
    });
  }

  console.log('=== Project mapping coverage ===');
  console.log(`  Mapped to D1 slug: ${mapped}`);
  console.log(`  No D1 match (project_id=NULL): ${unmapped}`);
  console.log(`  No project_id in brain.db: ${tasks.filter(t => !t.project_id).length}`);
  if (unmappedProjects.size > 0) {
    console.log(`  Unmapped project names:`);
    for (const name of [...unmappedProjects].sort()) {
      console.log(`    - ${name}`);
    }
  }
  console.log('');

  console.log('=== Privacy ===');
  console.log(`  Descriptions with redactions: ${redactedCount}`);
  console.log('');

  // ── Step 5: Sample INSERTs ────────────────────────────────────────────

  console.log('=== Sample INSERT statements (first 5) ===');
  for (const t of d1Tasks.slice(0, 5)) {
    const sql = buildInsert(t);
    console.log(sql.substring(0, 200) + (sql.length > 200 ? '...' : ''));
    console.log('');
  }

  // ── Step 6: Generate SQL file ─────────────────────────────────────────

  if (dryRun) {
    console.log('=== DRY RUN — no SQL file generated ===');
    console.log(`Would generate ${d1Tasks.length} INSERT statements.`);
    console.log('Run with --active-only or --all to generate SQL.');
    console.log('Add --api to POST directly to Hub API (no wrangler needed).');
    db.close();
    return;
  }

  // ── API mode: POST directly to Hub ──────────────────────────────────────

  if (useApi) {
    console.log('=== API MODE — posting to Hub ===');
    const API_URL = 'https://mn-ccore-lab.pages.dev/api/tasks/sync-bulk';

    const payload = {
      tasks: d1Tasks,
      clear_existing: true,
    };

    console.log(`  Endpoint: ${API_URL}`);
    console.log(`  Tasks: ${d1Tasks.length}`);
    console.log(`  clear_existing: true`);
    console.log('  Sending...');

    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await resp.json();
    if (resp.ok) {
      console.log(`  SUCCESS: ${JSON.stringify(result)}`);
    } else {
      console.error(`  FAILED (${resp.status}): ${JSON.stringify(result)}`);
      process.exit(1);
    }

    db.close();
    return;
  }

  // ── SQL mode: generate file for wrangler ────────────────────────────────

  const lines: string[] = [];
  lines.push('-- MN-CCORE Lab Hub — brain.db → D1 Task Sync (Phase A)');
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Source: ${dbPath}`);
  lines.push(`-- Mode: ${activeOnly ? 'active-only' : 'all'}`);
  lines.push(`-- Tasks: ${d1Tasks.length} (${activeCount} active, ${completedCount} completed)`);
  lines.push('');
  lines.push('-- WARNING: This will DELETE all existing tasks, task_comments, and task_subtasks.');
  lines.push('-- Existing D1 tasks are meeting-sourced test data (25 rows, all hex IDs).');
  lines.push('-- brain.db recXXX IDs will replace them.');
  lines.push('');
  lines.push('BEGIN TRANSACTION;');
  lines.push('');
  lines.push('-- Clear existing test data (preserves schema)');
  lines.push('DELETE FROM task_comments;');
  lines.push('DELETE FROM task_subtasks;');
  lines.push('DELETE FROM tasks;');
  lines.push('');
  lines.push(`-- Insert ${d1Tasks.length} tasks from brain.db`);

  for (const t of d1Tasks) {
    lines.push(buildInsert(t));
  }

  lines.push('');
  lines.push('COMMIT;');

  const outPath = path.join(import.meta.dirname, 'sync-tasks.sql');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');

  console.log(`=== SQL file written ===`);
  console.log(`  Path: ${outPath}`);
  console.log(`  Tasks: ${d1Tasks.length}`);
  console.log(`  Lines: ${lines.length}`);
  console.log('');
  console.log('To execute:');
  console.log('  wrangler d1 execute mnccore-lab --file=scripts/sync-tasks.sql --remote');

  db.close();
}

function buildInsert(t: {
  id: string;
  meeting_id: string | null;
  project_id: string | null;
  title: string;
  description: string | null;
  assignee: string;
  assigned_by: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  source: string;
  completed: number;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string | null;
}): string {
  return `INSERT OR REPLACE INTO tasks (id, meeting_id, project_id, title, description, assignee, assigned_by, due_date, priority, status, source, completed, completed_at, completed_by, created_at) VALUES (${esc(t.id)}, ${esc(t.meeting_id)}, ${esc(t.project_id)}, ${esc(t.title)}, ${esc(t.description)}, ${esc(t.assignee)}, ${esc(t.assigned_by)}, ${esc(t.due_date)}, ${esc(t.priority)}, ${esc(t.status)}, ${esc(t.source)}, ${numOrNull(t.completed)}, ${esc(t.completed_at)}, ${esc(t.completed_by)}, ${esc(t.created_at)});`;
}

main();
