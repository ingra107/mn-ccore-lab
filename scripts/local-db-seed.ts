#!/usr/bin/env tsx
/**
 * Local D1 seed — mirrors the Phase 0 prod dogfood seed shape into the local
 * Miniflare D1 database.
 *
 * Reads scripts/seed/phase0-plan.json, strips the `test_delete_` prefix from
 * every human-visible field (the local DB is isolated so no guard-prefix is
 * needed — plain readable titles make the UI lived-in), and inserts rows via
 * direct D1 SQL using `wrangler d1 execute --local --config=wrangler.local.toml`.
 *
 * NOT via Hub API — the local D1 sits behind the Worker running via
 * `wrangler pages dev --local`, which may or may not be up when we seed.
 * Direct SQL is the only path that always works and matches what the Phase 3
 * plan calls for.
 *
 * Tables mirrored (same set as scripts/seed/phase0-direct-sql.ts + the API
 * path from scripts/seed/phase0-seed.ts):
 *   projects, tasks, ideas, hub_decisions, meetings, publications,
 *   task_comments, reactions, grants, milestones, manuscript_revisions,
 *   research_digest
 *
 * Uses the same batched-file execution pattern as phase0-direct-sql.ts to
 * avoid the Windows libuv handle race triggered by rapid-fire execSync calls.
 *
 * Usage: tsx scripts/local-db-seed.ts
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const PLAN_PATH = join(REPO_ROOT, 'scripts/seed/phase0-plan.json')
const WRANGLER_CONFIG = join(REPO_ROOT, 'wrangler.local.toml')
const DB_NAME = 'mnccore-lab'
const PREFIX = 'test_delete_'

function stripPrefix(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  return typeof v === 'string' && v.startsWith(PREFIX) ? v.slice(PREFIX.length) : v
}

function sqlEscape(v: string | null | undefined | number): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

function daysFromNow(d: number | null | undefined): string | null {
  if (d === null || d === undefined) return null
  const date = new Date()
  date.setDate(date.getDate() + d)
  return date.toISOString().slice(0, 10)
}

function mintId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`
}

// ---- Batched wrangler execution ----
const pendingSql: string[] = []
function d1Execute(command: string) {
  pendingSql.push(command.endsWith(';') ? command : command + ';')
}

function d1Flush(label: string) {
  if (pendingSql.length === 0) return
  const sqlFile = join(tmpdir(), `local-seed-${Date.now()}-${randomUUID().slice(0, 8)}.sql`)
  writeFileSync(sqlFile, pendingSql.join('\n'))
  const forwardFile = sqlFile.replace(/\\/g, '/')
  const forwardCfg = WRANGLER_CONFIG.replace(/\\/g, '/')
  const cmd = `npx wrangler d1 execute ${DB_NAME} --local --config="${forwardCfg}" --file="${forwardFile}"`
  const env = { ...process.env }
  delete env.CLOUDFLARE_API_TOKEN
  delete env.CLOUDFLARE_ACCOUNT_ID
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], env })
    unlinkSync(sqlFile)
    console.log(`  [flush ${label}] ${pendingSql.length} statements ok`)
    pendingSql.length = 0
  } catch (e: any) {
    const stderr = e?.stderr?.toString() ?? ''
    const stdout = e?.stdout?.toString() ?? ''
    throw new Error(`d1 local execute failed (${label}): ${stderr || stdout || e.message}\nSQL file kept at: ${sqlFile}`)
  }
}

function run() {
  const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf-8'))
  console.log(`[local-db-seed] seeding local D1 from ${PLAN_PATH}`)

  // ---- projects ----
  const projectIdBySlug = new Map<string, string>()
  for (const p of plan.projects) {
    const id = mintId('proj')
    const title = stripPrefix(p.title)!
    const slug = stripPrefix(p.slug)!
    const description = stripPrefix(p.description)
    projectIdBySlug.set(p.slug, id)
    d1Execute(
      `INSERT INTO projects (id, title, slug, category, stage, pi, description) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(title)}, ${sqlEscape(slug)}, ${sqlEscape(p.category)}, ` +
      `${sqlEscape(p.stage)}, ${sqlEscape(p.pi)}, ${sqlEscape(description)})`
    )
  }
  d1Flush('projects')

  // ---- tasks ----
  const taskIdByOriginalDesc = new Map<string, string>()
  for (const t of plan.tasks) {
    const project_id = projectIdBySlug.get(t.project_slug)
    if (!project_id) {
      console.warn(`  skip task ${t.description} — unknown project ${t.project_slug}`)
      continue
    }
    const id = mintId('task')
    taskIdByOriginalDesc.set(t.description, id)
    const desc = stripPrefix(t.description)!
    d1Execute(
      `INSERT INTO tasks (id, project_id, title, description, assignee, due_date, priority, status, source) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(project_id)}, ${sqlEscape(desc)}, ${sqlEscape(desc)}, ` +
      `${sqlEscape(t.assignee)}, ${sqlEscape(daysFromNow(t.due_in_days))}, ` +
      `${sqlEscape(t.priority)}, ${sqlEscape(t.status)}, 'manual')`
    )
  }
  d1Flush('tasks')

  // ---- ideas ----
  for (const i of plan.ideas) {
    const id = mintId('idea')
    d1Execute(
      `INSERT INTO ideas (id, title, description, submitted_by, research_area, status) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(stripPrefix(i.title))}, ${sqlEscape(stripPrefix(i.description))}, ` +
      `'nick', ${sqlEscape(i.research_area)}, 'new')`
    )
  }
  d1Flush('ideas')

  // ---- hub_decisions ----
  for (const d of plan.decisions) {
    const id = mintId('dec')
    const tagsStr = Array.isArray(d.tags) ? d.tags.join(',') : (d.tags ?? null)
    const projectSlug = stripPrefix(d.project_slug)
    d1Execute(
      `INSERT INTO hub_decisions (id, title, rationale, project_slug, tags) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(stripPrefix(d.title))}, ${sqlEscape(stripPrefix(d.rationale))}, ` +
      `${sqlEscape(projectSlug)}, ${sqlEscape(tagsStr)})`
    )
  }
  d1Flush('decisions')

  // ---- meetings (+ action-item tasks) ----
  for (const m of plan.meetings) {
    const id = mintId('mtg')
    const date = daysFromNow(m.date_in_days)
    const attendeesJson = JSON.stringify(m.attendees ?? [])
    d1Execute(
      `INSERT INTO meetings (id, date, title, type, attendees) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(date)}, ${sqlEscape(stripPrefix(m.title))}, ` +
      `${sqlEscape(m.type)}, ${sqlEscape(attendeesJson)})`
    )
    // Action items as tasks with meeting_id
    for (const ai of m.action_items ?? []) {
      const aiId = mintId('task')
      d1Execute(
        `INSERT INTO tasks (id, meeting_id, title, description, assignee, due_date, priority, status, source) VALUES (` +
        `${sqlEscape(aiId)}, ${sqlEscape(id)}, ${sqlEscape(stripPrefix(ai.description))}, ` +
        `${sqlEscape(stripPrefix(ai.description))}, ${sqlEscape(ai.assignee)}, ` +
        `${sqlEscape(daysFromNow(ai.due_in_days))}, 'medium', ${sqlEscape(ai.done ? 'done' : 'todo')}, 'meeting')`
      )
    }
  }
  d1Flush('meetings')

  // ---- publications ----
  for (const pub of plan.publications) {
    const id = mintId('pub')
    const authorsJson = JSON.stringify(pub.authors ?? [])
    d1Execute(
      `INSERT INTO publications (id, title, authors, journal, year, status) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(stripPrefix(pub.title))}, ${sqlEscape(authorsJson)}, ` +
      `${sqlEscape(pub.journal)}, ${pub.year}, ${sqlEscape(pub.status)})`
    )
  }
  d1Flush('publications')

  // ---- task comments ----
  for (const c of plan.task_comments ?? []) {
    const taskId = taskIdByOriginalDesc.get(c.task_description)
    if (!taskId) continue
    const id = mintId('cmt')
    d1Execute(
      `INSERT INTO task_comments (id, task_id, content, author_slug) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(taskId)}, ${sqlEscape(stripPrefix(c.content))}, 'nick')`
    )
  }
  d1Flush('task_comments')

  // ---- reactions ----
  const emojiMap: Record<string, string> = { 'thumbs-up': '\u{1F44D}', 'eyes': '\u{1F440}', 'fire': '\u{1F525}' }
  for (const r of plan.task_reactions ?? []) {
    const taskId = taskIdByOriginalDesc.get(r.task_description)
    if (!taskId) continue
    const id = mintId('rxn')
    const emoji = emojiMap[r.emoji] ?? r.emoji
    d1Execute(
      `INSERT INTO reactions (id, target_type, target_id, emoji, user_slug) VALUES (` +
      `${sqlEscape(id)}, 'task', ${sqlEscape(taskId)}, ${sqlEscape(emoji)}, 'nick')`
    )
  }
  d1Flush('reactions')

  // ---- direct_sql_rows: grants, milestones, manuscript_revisions, research_digest ----
  const direct = plan.direct_sql_rows ?? {}

  for (const g of direct.grants ?? []) {
    const id = mintId('grant')
    d1Execute(
      `INSERT INTO grants (id, mechanism, title, agency, pi, start_date, end_date, proposed) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(g.mechanism)}, ${sqlEscape(stripPrefix(g.title))}, ` +
      `${sqlEscape(g.agency)}, ${sqlEscape(g.pi)}, ${sqlEscape(g.start_date)}, ` +
      `${sqlEscape(g.end_date)}, ${g.proposed})`
    )
  }
  d1Flush('grants')

  for (const m of direct.milestones ?? []) {
    const projectId = projectIdBySlug.get(m.project_slug)
    if (!projectId) continue
    const id = mintId('ms')
    d1Execute(
      `INSERT INTO milestones (id, project_id, title, target_date, status) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(projectId)}, ${sqlEscape(stripPrefix(m.title))}, ` +
      `${sqlEscape(daysFromNow(m.target_days))}, ${sqlEscape(m.status)})`
    )
  }
  d1Flush('milestones')

  for (const mr of direct.manuscript_revisions ?? []) {
    const projectId = projectIdBySlug.get(mr.project_slug)
    if (!projectId) continue
    const id = mintId('rev')
    d1Execute(
      `INSERT INTO manuscript_revisions (id, project_id, round, status, journal, notes, submitted_at) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(projectId)}, ${mr.round}, ${sqlEscape(mr.status)}, ` +
      `${sqlEscape(mr.journal)}, ${sqlEscape(stripPrefix(mr.notes))}, datetime('now'))`
    )
  }
  d1Flush('manuscript_revisions')

  for (const rd of direct.research_digest ?? []) {
    const id = mintId('rd')
    d1Execute(
      `INSERT INTO research_digest (id, title, authors, journal, status, digest_date) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(stripPrefix(rd.title))}, ${sqlEscape(rd.authors)}, ` +
      `${sqlEscape(rd.journal)}, ${sqlEscape(rd.status)}, ${sqlEscape(daysFromNow(0))})`
    )
  }
  d1Flush('research_digest')

  console.log('[local-db-seed] done')
}

run()
