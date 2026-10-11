/**
 * Test-data cleanup. Reuses the canonical _TEST_DELETE_ prefix sweep
 * pattern from tests/test-cleanup.ts but extends to projects + ideas +
 * decisions + manuscripts + grants.
 *
 * Per master plan section M: each section's `session.cleanup` queue
 * registers per-entity callbacks that delete just that section's records.
 * The runner invokes all queues then calls `finalSweep()` to catch any
 * orphans.
 */
import type { APIRequestContext } from '@playwright/test'
import type { AuditAuth } from './auth'
import { apiHeaders } from './auth'

const BASE = process.env.MASSIVE_AUDIT_BASE || 'https://mn-ccore-lab.pages.dev'

export const PURGE_PREFIXES = [
  '_TEST_DELETE_',
  'TEST_DELETE_',         // legacy, still purged
  'DEEP-AUDIT-SYNC',
  'INSPECTION',
  'DAILYTEST',
  'EDGE',
  'SYNC-',
  'SYNCTEST',
  'JOURNEY',
  'KEYLINK TEST',
  'AUDIT TEST',
  'AUDIT-TEST',
  'TIMEZONE-PROBE',
  'DUE-DATE-PROBE',
  'WORKFLOW-TEST',
  'QA ',
  'TEST-',
  'VBUMP-PROBE',
]

function matchesTestPrefix(title: string | null | undefined): boolean {
  if (!title) return false
  const upper = title.toUpperCase()
  return PURGE_PREFIXES.some((p) => upper.startsWith(p.toUpperCase()))
}

export interface CleanupReport {
  tasksDeleted: number
  projectsDeleted: number
  ideasDeleted: number
  decisionsDeleted: number
  questionsDeleted: number
  errors: string[]
}

export async function deleteTaskIds(api: APIRequestContext, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  let deleted = 0
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const r = await api.post('/api/tasks/batch', { data: { ids: batch, action: 'delete' } })
    if (r.ok()) deleted += batch.length
  }
  return deleted
}

export async function deleteProjectId(api: APIRequestContext, id: string): Promise<boolean> {
  const r = await api.post(`/api/projects/${id}/delete`, { data: {} })
  return r.ok()
}

export async function finalSweep(api: APIRequestContext): Promise<CleanupReport> {
  const report: CleanupReport = {
    tasksDeleted: 0,
    projectsDeleted: 0,
    ideasDeleted: 0,
    decisionsDeleted: 0,
    questionsDeleted: 0,
    errors: [],
  }

  // Tasks (soft-delete)
  try {
    const r = await api.get('/api/tasks?limit=5000')
    if (r.ok()) {
      const j = await r.json()
      const ids = (j?.data ?? []).filter((t: any) => matchesTestPrefix(t.title)).map((t: any) => t.id)
      report.tasksDeleted = await deleteTaskIds(api, ids)
    }
  } catch (e) {
    report.errors.push(`tasks sweep: ${(e as Error).message.slice(0, 200)}`)
  }

  // Projects (POST :id/delete)
  try {
    const r = await api.get('/api/projects')
    if (r.ok()) {
      const j = await r.json()
      const projs = (j?.data ?? []).filter((p: any) => matchesTestPrefix(p.title) || matchesTestPrefix(p.slug))
      for (const p of projs) {
        if (await deleteProjectId(api, p.id)) report.projectsDeleted++
      }
    }
  } catch (e) {
    report.errors.push(`projects sweep: ${(e as Error).message.slice(0, 200)}`)
  }

  // Ideas
  try {
    const r = await api.get('/api/ideas')
    if (r.ok()) {
      const j = await r.json()
      const ideas = (j?.data ?? []).filter((i: any) => matchesTestPrefix(i.title))
      for (const i of ideas) {
        const dr = await api.post(`/api/ideas/${i.id}/delete`, { data: {} })
        if (dr.ok()) report.ideasDeleted++
      }
    }
  } catch (e) {
    report.errors.push(`ideas sweep: ${(e as Error).message.slice(0, 200)}`)
  }

  // Decisions
  try {
    const r = await api.get('/api/decisions')
    if (r.ok()) {
      const j = await r.json()
      const decs = (j?.data ?? []).filter((d: any) => matchesTestPrefix(d.title))
      for (const d of decs) {
        const dr = await api.post(`/api/decisions/${d.id}/delete`, { data: {} })
        if (dr.ok()) report.decisionsDeleted++
      }
    }
  } catch (e) {
    report.errors.push(`decisions sweep: ${(e as Error).message.slice(0, 200)}`)
  }

  // Lab questions (Ask the Lab)
  try {
    const r = await api.get('/api/questions')
    if (r.ok()) {
      const j = await r.json()
      const qs = (j?.data ?? []).filter((q: any) => matchesTestPrefix(q.question || q.title))
      for (const q of qs) {
        const dr = await api.post(`/api/questions/${q.id}/delete`, { data: {} })
        if (dr.ok()) report.questionsDeleted++
      }
    }
  } catch (e) {
    report.errors.push(`questions sweep: ${(e as Error).message.slice(0, 200)}`)
  }

  // Catch-all server-side cleanup (purges project_updates, lab_questions, etc.)
  try {
    await api.post('/api/test-cleanup', { data: {} })
  } catch {
    // endpoint may 404; non-fatal
  }

  return report
}

/**
 * Build a unique test marker. Use canonical _TEST_DELETE_ prefix so
 * Hub's existing housekeeping + invariant I10 exemption continues to work.
 */
export function makeMarker(kind: string): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `_TEST_DELETE_${kind}_${ts}_${rand}`
}
