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

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'

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
// Collect SQL statements and execute in one wrangler call at the end.
// Per-row execSync triggered a libuv handle race on Windows ("Assertion failed:
// !(handle->flags & UV_HANDLE_CLOSING)") when statements fired back-to-back.
// Single-file execution avoids the race and is faster.
const pendingSql: string[] = []
function d1Execute(command: string) {
  pendingSql.push(command.endsWith(';') ? command : command + ';')
}
function d1Flush() {
  if (pendingSql.length === 0) return
  const sqlFile = join(tmpdir(), `phase0-direct-sql-${Date.now()}-${randomUUID().slice(0, 8)}.sql`)
  writeFileSync(sqlFile, pendingSql.join('\n'))
  const cmd = `npx wrangler d1 execute mnccore-lab --remote --file "${sqlFile.replace(/\\/g, '/')}" --json`
  // Strip CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID so wrangler falls back to
  // the OAuth config at ~/.wrangler/config/default.toml, which has d1:write scope.
  const env = { ...process.env }
  delete env.CLOUDFLARE_API_TOKEN
  delete env.CLOUDFLARE_ACCOUNT_ID
  try {
    execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], env })
    unlinkSync(sqlFile)
    pendingSql.length = 0
  } catch (e: any) {
    throw new Error(`d1 execute --file failed: ${e.stderr?.toString() || e.message}\nSQL file kept for inspection: ${sqlFile}`)
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

  // Idempotency: skip any table/label pair already in the manifest. Lets us
  // re-run after a partial failure without dup rows.
  const seeded = new Set(manifest.rows.map(r => `${r.table}:${r.label}`))
  const wasSeeded = (table: string, label: string) => seeded.has(`${table}:${label}`)

  // Buffer rows to add to the manifest only after d1Flush() succeeds.
  const pending: Array<{ table: string; id: string; label: string }> = []

  // grants
  for (const g of direct.grants) {
    assertPrefix('grant.title', g.title)
    if (wasSeeded('grants', g.title)) { console.log(`  grants =${g.title} (skip)`); continue }
    const id = `grant_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    d1Execute(
      `INSERT INTO grants (id, mechanism, title, agency, pi, start_date, end_date, proposed, status) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(g.mechanism)}, ${sqlEscape(g.title)}, ${sqlEscape(g.agency)}, ` +
      `${sqlEscape(g.pi)}, ${sqlEscape(g.start_date)}, ${sqlEscape(g.end_date)}, ${g.proposed}, ${sqlEscape(g.status)})`
    )
    pending.push({ table: 'grants', id, label: g.title })
    console.log(`  grants +${g.title} (buffered)`)
  }

  // milestones (deadlines page reads from here)
  // Schema: milestones.project_id REFERENCES projects(id) — must resolve slug→id.
  // The plan text said "project_id points to slug" but that's wrong; FK is enforced.
  for (const m of direct.milestones) {
    assertPrefix('milestone.title', m.title)
    if (wasSeeded('milestones', m.title)) { console.log(`  milestones =${m.title} (skip)`); continue }
    const projectId = projectMap.get(m.project_slug)
    if (!projectId) { console.warn(`  skip milestone ${m.title} — unknown project ${m.project_slug}`); continue }
    const id = `ms_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    d1Execute(
      `INSERT INTO milestones (id, project_id, title, target_date, status) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(projectId)}, ${sqlEscape(m.title)}, ${sqlEscape(daysFromNow(m.target_days))}, ${sqlEscape(m.status)})`
    )
    pending.push({ table: 'milestones', id, label: m.title })
    console.log(`  milestones +${m.title} (buffered)`)
  }

  // manuscript_revisions
  for (const mr of direct.manuscript_revisions) {
    assertPrefix('revision.notes', mr.notes)
    const label = `${mr.project_slug} r${mr.round}`
    if (wasSeeded('manuscript_revisions', label)) { console.log(`  manuscript_revisions =${label} (skip)`); continue }
    const projectId = projectMap.get(mr.project_slug)
    if (!projectId) { console.warn(`  skip revision — unknown project ${mr.project_slug}`); continue }
    const id = `rev_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    d1Execute(
      `INSERT INTO manuscript_revisions (id, project_id, round, status, journal, notes, submitted_at) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(projectId)}, ${mr.round}, ${sqlEscape(mr.status)}, ${sqlEscape(mr.journal)}, ${sqlEscape(mr.notes)}, datetime('now'))`
    )
    pending.push({ table: 'manuscript_revisions', id, label })
    console.log(`  manuscript_revisions +r${mr.round} ${mr.project_slug} (buffered)`)
  }

  // research_digest
  for (const rd of direct.research_digest) {
    assertPrefix('research_digest.title', rd.title)
    if (wasSeeded('research_digest', rd.title)) { console.log(`  research_digest =${rd.title} (skip)`); continue }
    const id = `rd_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    d1Execute(
      `INSERT INTO research_digest (id, title, authors, journal, status, digest_date) VALUES (` +
      `${sqlEscape(id)}, ${sqlEscape(rd.title)}, ${sqlEscape(rd.authors)}, ${sqlEscape(rd.journal)}, ${sqlEscape(rd.status)}, ${sqlEscape(daysFromNow(0))})`
    )
    pending.push({ table: 'research_digest', id, label: rd.title })
    console.log(`  research_digest +${rd.title.slice(0, 60)} (buffered)`)
  }

  // Flush all SQL in one wrangler invocation, then commit the pending rows to the manifest
  if (pending.length > 0) {
    console.log(`[phase0-direct-sql] flushing ${pending.length} INSERTs via single wrangler call`)
    d1Flush()
    manifest.rows.push(...pending)
    saveManifest(manifest)
  }

  console.log(`[phase0-direct-sql] complete. manifest has ${manifest.rows.length} rows total.`)
}

run().catch(e => { console.error(e); process.exit(1) })
