#!/usr/bin/env tsx
/**
 * Phase 0 seed runner (API path).
 * Writes test_delete_ rows to prod D1 via the Hub API for tables with POST routes.
 * Tables without POST routes (grants, milestones, manuscript_revisions, research_digest)
 * are seeded by scripts/seed/phase0-direct-sql.ts in a separate step.
 *
 * Every insert guards the test_delete_ prefix before executing.
 * Manifest at scripts/seed/phase0-manifest.json tracks every inserted row id for cleanup.
 *
 * Usage: PB_API_KEY=... tsx scripts/seed/phase0-seed.ts [--canary | --full | --dry-run]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_BASE = process.env.HUB_API_BASE ?? 'https://mn-ccore-lab.pages.dev'
const API_KEY = process.env.PB_API_KEY
if (!API_KEY) throw new Error('PB_API_KEY env var required')

const PLAN_PATH = join(__dirname, 'phase0-plan.json')
const MANIFEST_PATH = join(__dirname, 'phase0-manifest.json')
const PREFIX = 'test_delete_'

type Manifest = { created_at: string; rows: { table: string; id: string; label: string }[] }

function loadPlan(): any { return JSON.parse(readFileSync(PLAN_PATH, 'utf-8')) }
function loadManifest(): Manifest {
  if (existsSync(MANIFEST_PATH)) return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
  return { created_at: new Date().toISOString(), rows: [] }
}
function saveManifest(m: Manifest) { writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2)) }

async function post(path: string, body: any): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} failed ${res.status}: ${await res.text()}`)
  return res.json()
}

function assertPrefix(field: string, value: string) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) {
    throw new Error(`seed guard: ${field}=${value} missing ${PREFIX} prefix`)
  }
}

function daysFromNow(d: number | null | undefined): string | null {
  if (d === null || d === undefined) return null
  const date = new Date()
  date.setDate(date.getDate() + d)
  return date.toISOString().slice(0, 10)
}

function idFrom(resp: any): string {
  const id = resp?.data?.id ?? resp?.id
  if (!id) throw new Error('no id in response: ' + JSON.stringify(resp).slice(0, 200))
  return id
}

async function run() {
  const mode = process.argv.includes('--canary') ? 'canary'
    : process.argv.includes('--dry-run') ? 'dry'
    : 'full'
  const plan = loadPlan()
  const manifest = loadManifest()
  console.log(`[phase0-seed] mode=${mode} target=${API_BASE}`)

  // Idempotency index: skip any row whose (table, label) already landed
  // in a prior run. Lets us resume after a mid-run failure without dup writes.
  const seededLabels = new Set(manifest.rows.map(r => `${r.table}:${r.label}`))
  const wasSeeded = (table: string, label: string) => seededLabels.has(`${table}:${label}`)
  // Also rebuild id lookup maps for rows already in the manifest so downstream
  // rows (tasks referencing projects, comments referencing tasks, etc.) resolve.
  const projectIdBySlug = new Map<string, string>()
  const taskIdByDescription = new Map<string, string>()
  for (const r of manifest.rows) {
    if (r.table === 'projects') {
      // label is the title; we need slug → id. Look up slug from plan.
      const p = plan.projects.find((pp: any) => pp.title === r.label)
      if (p) projectIdBySlug.set(p.slug, r.id)
    } else if (r.table === 'tasks' && !r.label.endsWith(' [action]')) {
      taskIdByDescription.set(r.label, r.id)
    }
  }

  // ---- projects ----
  const projectRows = mode === 'canary' ? plan.projects.slice(0, 1) : plan.projects
  for (const p of projectRows) {
    assertPrefix('project.title', p.title)
    assertPrefix('project.slug', p.slug)
    if (mode === 'dry') { console.log(`[dry] POST /api/projects ${p.title}`); continue }
    if (wasSeeded('projects', p.title)) { console.log(`  projects =${p.title} (skip, already in manifest)`); continue }
    const resp = await post('/api/projects', {
      title: p.title, slug: p.slug, category: p.category, stage: p.stage, pi: p.pi, description: p.description,
    })
    const id = idFrom(resp)
    projectIdBySlug.set(p.slug, id)
    manifest.rows.push({ table: 'projects', id, label: p.title })
    seededLabels.add(`projects:${p.title}`)
    saveManifest(manifest)
    console.log(`  projects +${p.title} (${id})`)
  }

  if (mode === 'canary') {
    console.log('[phase0-seed] canary complete — verify the row renders on /projects then rerun --full')
    return
  }
  if (mode === 'dry') { console.log('[phase0-seed] dry run complete'); return }

  // ---- tasks ----
  for (const t of plan.tasks) {
    assertPrefix('task.description', t.description)
    if (wasSeeded('tasks', t.description)) {
      // Still need the id for downstream (comments, reactions) — already rebuilt above
      continue
    }
    const project_id = projectIdBySlug.get(t.project_slug)
    if (!project_id) { console.warn(`  skip task ${t.description} — unknown project ${t.project_slug}`); continue }
    const resp = await post('/api/tasks', {
      description: t.description, title: t.description, assignee: t.assignee,
      project_id, due_date: daysFromNow(t.due_in_days), priority: t.priority, source: 'manual',
    })
    const id = idFrom(resp)
    taskIdByDescription.set(t.description, id)
    manifest.rows.push({ table: 'tasks', id, label: t.description })
    seededLabels.add(`tasks:${t.description}`)
    saveManifest(manifest)
    console.log(`  tasks +${t.description.slice(0, 60)} (${id})`)

    if (t.subtasks) {
      for (const subTitle of t.subtasks) {
        assertPrefix('subtask.title', subTitle)
        if (wasSeeded('task_subtasks', subTitle)) continue
        const subResp = await post(`/api/tasks/${id}/subtasks`, { title: subTitle })
        const subId = idFrom(subResp)
        manifest.rows.push({ table: 'task_subtasks', id: subId, label: subTitle })
        seededLabels.add(`task_subtasks:${subTitle}`)
        saveManifest(manifest)
      }
    }
  }

  // ---- ideas ----
  for (const i of plan.ideas) {
    assertPrefix('idea.title', i.title)
    if (wasSeeded('ideas', i.title)) continue
    const resp = await post('/api/ideas', { title: i.title, description: i.description, research_area: i.research_area })
    const id = idFrom(resp)
    manifest.rows.push({ table: 'ideas', id, label: i.title })
    seededLabels.add(`ideas:${i.title}`)
    saveManifest(manifest)
    console.log(`  ideas +${i.title}`)
  }

  // ---- decisions (hub_decisions) ----
  for (const d of plan.decisions) {
    assertPrefix('decision.title', d.title)
    if (wasSeeded('hub_decisions', d.title)) continue
    // tags stored as comma-separated string in hub_decisions.tags (handler splits on ',')
    const tagsStr = Array.isArray(d.tags) ? d.tags.join(',') : (d.tags ?? null)
    const resp = await post('/api/decisions', {
      title: d.title, rationale: d.rationale, project_slug: d.project_slug ?? undefined, tags: tagsStr,
    })
    const id = idFrom(resp)
    manifest.rows.push({ table: 'hub_decisions', id, label: d.title })
    seededLabels.add(`hub_decisions:${d.title}`)
    saveManifest(manifest)
    console.log(`  decisions +${d.title}`)
  }

  // ---- meetings ----
  for (const m of plan.meetings) {
    assertPrefix('meeting.title', m.title)
    const date = daysFromNow(m.date_in_days)
    if (!date) throw new Error(`meeting ${m.title} has null date`)
    let meetingId: string
    if (wasSeeded('meetings', m.title)) {
      // Recover meeting id from manifest for action-item FK below
      const row = manifest.rows.find(r => r.table === 'meetings' && r.label === m.title)
      meetingId = row!.id
    } else {
      const resp = await post('/api/meetings', {
        title: m.title, date, type: m.type, attendees: m.attendees,
      })
      meetingId = idFrom(resp)
      manifest.rows.push({ table: 'meetings', id: meetingId, label: m.title })
      seededLabels.add(`meetings:${m.title}`)
      saveManifest(manifest)
      console.log(`  meetings +${m.title}`)
    }

    // Action items = tasks with meeting_id set (no dedicated POST route)
    for (const ai of m.action_items) {
      assertPrefix('action_item.description', ai.description)
      const aiLabel = `${ai.description} [action]`
      if (wasSeeded('tasks', aiLabel)) continue
      const aiResp = await post('/api/tasks', {
        description: ai.description, title: ai.description, assignee: ai.assignee,
        meeting_id: meetingId, due_date: daysFromNow(ai.due_in_days), priority: 'medium', source: 'meeting',
      })
      const aiId = idFrom(aiResp)
      manifest.rows.push({ table: 'tasks', id: aiId, label: aiLabel })
      seededLabels.add(`tasks:${aiLabel}`)
      saveManifest(manifest)
      if (ai.done) await post(`/api/tasks/${aiId}/status`, { status: 'done' })
    }
  }

  // ---- publications ----
  for (const pub of plan.publications) {
    assertPrefix('publication.title', pub.title)
    if (wasSeeded('publications', pub.title)) continue
    const resp = await post('/api/publications', {
      title: pub.title, authors: JSON.stringify(pub.authors),
      journal: pub.journal, year: pub.year, status: pub.status,
    })
    const id = idFrom(resp)
    manifest.rows.push({ table: 'publications', id, label: pub.title })
    seededLabels.add(`publications:${pub.title}`)
    saveManifest(manifest)
    console.log(`  publications +${pub.title}`)
  }

  // ---- task comments ----
  // POST /api/tasks/:id/comments is a projection over activity_entries since
  // schema-v78 (task_comments table dropped 2026-06-10). Old manifest rows
  // keep the 'task_comments' tag — check both keys for idempotency.
  for (const c of plan.task_comments) {
    const taskId = taskIdByDescription.get(c.task_description)
    if (!taskId) { console.warn(`  skip comment — unknown task ${c.task_description}`); continue }
    assertPrefix('comment.content', c.content)
    const label = c.content.slice(0, 60)
    if (wasSeeded('task_comments', label) || wasSeeded('activity_entries', label)) continue
    const resp = await post(`/api/tasks/${taskId}/comments`, { content: c.content })
    const id = idFrom(resp)
    manifest.rows.push({ table: 'activity_entries', id, label })
    seededLabels.add(`activity_entries:${label}`)
    saveManifest(manifest)
  }

  // ---- reactions (toggle POST semantics) ----
  // Emoji mapping: plan uses short names; map to the unicode the schema expects
  const emojiMap: Record<string, string> = { 'thumbs-up': '\u{1F44D}', 'eyes': '\u{1F440}', 'fire': '\u{1F525}' }
  for (const r of plan.task_reactions) {
    const taskId = taskIdByDescription.get(r.task_description)
    if (!taskId) { console.warn(`  skip reaction — unknown task ${r.task_description}`); continue }
    const emoji = emojiMap[r.emoji] ?? r.emoji
    const label = `${taskId}:${r.emoji}`
    if (wasSeeded('reactions', label)) continue
    const resp = await post('/api/reactions', { target_type: 'task', target_id: taskId, emoji })
    const id = idFrom(resp)
    manifest.rows.push({ table: 'reactions', id, label })
    seededLabels.add(`reactions:${label}`)
    saveManifest(manifest)
  }

  console.log(`[phase0-seed] complete via API. ${manifest.rows.length} rows written.`)
  console.log('[phase0-seed] next: run phase0-direct-sql.ts to insert grants/milestones/manuscript_revisions/research_digest')
}

run().catch(e => { console.error(e); process.exit(1) })
