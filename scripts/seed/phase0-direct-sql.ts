#!/usr/bin/env tsx
/**
 * Phase 0 direct-SQL runner.
 * Inserts test_delete_ rows into tables that have no POST route:
 *   grants, milestones, manuscript_revisions, research_digest.
 *
 * Uses `wrangler d1 execute mnccore-lab --remote --command "..."` per row.
 * Reads project ids from the API (to resolve project_slug → proj_id for FKs).
 *
 * Every value is prefix-guarded before the SQL executes.
 *
 * Usage: PB_API_KEY=... tsx scripts/seed/phase0-direct-sql.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_BASE = process.env.HUB_API_BASE ?? 'https://mn-ccore-lab.pages.dev'
const API_KEY = process.env.PB_API_KEY
const PLAN_PATH = join(__dirname, 'phase0-plan.json')
const MANIFEST_PATH = join(__dirname, 'phase0-manifest.json')
const PREFIX = 'test_delete_'

type Manifest = { created_at: string; rows: { table: string; id: string; label: string }[] }

function loadPlan(): any { return JSON.parse(readFileSync(PLAN_PATH, 'utf-8')) }
function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) throw new Error('manifest not found — run phase0-seed.ts first')
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
}
function saveManifest(m: Manifest) { writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2)) }
function assertPrefix(field: string, value: string) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) {
    throw new Error(`seed guard: ${field}=${value} missing ${PREFIX} prefix`)
  }
}
function sqlEscape(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}
function d1Execute(command: string) {
  const cmd = `npx wrangler d1 execute mnccore-lab --remote --command "${command.replace(/"/g, '\\"')}" --json`
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e: any) {
    throw new Error(`d1 execute failed: ${e.stderr?.toString() || e.message}\nSQL: ${command}`)
  }
}
async function projectIdMap(): Promise<Map<string, string>> {
  const res = await fetch(`${API_BASE}/api/projects`, { headers: { Authorization: `Bearer ${API_KEY}` } })
  if (!res.ok) throw new Error(`GET /api/projects ${res.status}`)
  const json: any = await res.json()
  const items = Array.isArray(json) ? json : json.data ?? []
  const map = new Map<string, string>()
  for (const p of items) if (p.slug?.startsWith(PREFIX)) map.set(p.slug, p.id)
  return map
}
function daysFromNow(d: number): string {
  const date = new Date(); date.setDate(date.getDate() + d); return date.toISOString().slice(0, 10)
}

async function run() {
  const plan = loadPlan()
  const manifest = loadManifest()
  const direct = plan.direct_sql_rows
  const projectMap = await projectIdMap()
  console.log(`[phase0-direct-sql] project map entries: ${projectMap.size}`)

  // grants
  for (const g of direct.grants) {
    assertPrefix('grant.title', g.title)
    const id = `grant_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    d1Execute(
      `INSERT INTO grants (id, mechanism, title, agency, pi, start_date, end_date, proposed, status) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(g.mechanism)}, ${sqlEscape(g.title)}, ${sqlEscape(g.agency)}, ` +
      `${sqlEscape(g.pi)}, ${sqlEscape(g.start_date)}, ${sqlEscape(g.end_date)}, ${g.proposed}, ${sqlEscape(g.status)})`
    )
    manifest.rows.push({ table: 'grants', id, label: g.title })
    saveManifest(manifest)
    console.log(`  grants +${g.title}`)
  }

  // milestones (deadlines page reads from here)
  for (const m of direct.milestones) {
    assertPrefix('milestone.title', m.title)
    const id = `ms_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    d1Execute(
      `INSERT INTO milestones (id, project_id, title, target_date, status) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(m.project_slug)}, ${sqlEscape(m.title)}, ${sqlEscape(daysFromNow(m.target_days))}, ${sqlEscape(m.status)})`
    )
    manifest.rows.push({ table: 'milestones', id, label: m.title })
    saveManifest(manifest)
    console.log(`  milestones +${m.title}`)
  }

  // manuscript_revisions
  for (const mr of direct.manuscript_revisions) {
    assertPrefix('revision.notes', mr.notes)
    const projectId = projectMap.get(mr.project_slug)
    if (!projectId) { console.warn(`  skip revision — unknown project ${mr.project_slug}`); continue }
    const id = `rev_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    d1Execute(
      `INSERT INTO manuscript_revisions (id, project_id, round, status, journal, notes, submitted_at) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(projectId)}, ${mr.round}, ${sqlEscape(mr.status)}, ${sqlEscape(mr.journal)}, ${sqlEscape(mr.notes)}, datetime('now'))`
    )
    manifest.rows.push({ table: 'manuscript_revisions', id, label: `${mr.project_slug} r${mr.round}` })
    saveManifest(manifest)
    console.log(`  manuscript_revisions +r${mr.round} ${mr.project_slug}`)
  }

  // research_digest
  for (const rd of direct.research_digest) {
    assertPrefix('research_digest.title', rd.title)
    const id = `rd_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    d1Execute(
      `INSERT INTO research_digest (id, title, authors, journal, status, digest_date) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(rd.title)}, ${sqlEscape(rd.authors)}, ${sqlEscape(rd.journal)}, ${sqlEscape(rd.status)}, ${sqlEscape(daysFromNow(0))})`
    )
    manifest.rows.push({ table: 'research_digest', id, label: rd.title })
    saveManifest(manifest)
    console.log(`  research_digest +${rd.title.slice(0, 60)}`)
  }

  console.log(`[phase0-direct-sql] complete. manifest has ${manifest.rows.length} rows total.`)
}

run().catch(e => { console.error(e); process.exit(1) })
