import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity } from '../helpers';

// ── Types ────────────────────────────────────────────────────

interface PBSessionInput {
  id?: string
  started_at: string
  ended_at?: string
  machine?: string
  project_name?: string
  summary?: string
  actions_count?: number
  commits_count?: number
  duration_minutes?: number
}

// ── Project name ─────────────────────────────────────────────
//
// PB's session push sends `projects_touched`, a JSON array, cut at its first
// comma, so project_name arrived as '[]', '["Peripheral Brain System"]' or
// '["CQODE Backbone / UMN CLIF"' (6,272 of 13,800 rows on prod, 2026-10-14),
// and Session History printed that raw text in its Project column (G10).
// Writes store the plain name (sessionProjectName); reads clean the rows
// already stored (PROJECT_NAME_SQL), so the filter, the picker and the list
// all see one name per project. A stored name never contains a comma: the
// writer split on it.

/** The plain project name from what PB sent, or null for none. */
export function sessionProjectName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null
  if (!s.startsWith('[')) return s
  try {
    const arr: unknown = JSON.parse(s)
    if (Array.isArray(arr)) {
      const first = arr.find((x): x is string => typeof x === 'string' && x.trim() !== '')
      return first ? first.trim() : null
    }
  } catch {
    // A cut array ('["A"') is not JSON; the fallback below reads it.
  }
  const first = s.replace(/^\[/, '').replace(/\]$/, '').split(',')[0].trim().replace(/^"|"$/g, '').trim()
  return first || null
}

/** SQL twin of sessionProjectName, for rows stored before writes cleaned it. */
export const PROJECT_NAME_SQL =
  `(CASE WHEN project_name LIKE '[%' THEN NULLIF(TRIM(REPLACE(REPLACE(REPLACE(project_name, '[', ''), ']', ''), '"', '')), '') ELSE NULLIF(project_name, '') END)`

/** The project's short name, when the session's name is a project title. */
const PROJECT_SHORT_SQL =
  `(SELECT p.short_name FROM projects p WHERE lower(p.title) = lower(${PROJECT_NAME_SQL}) AND p.short_name IS NOT NULL AND p.short_name != '' LIMIT 1)`

const SESSION_COLUMNS =
  `id, started_at, ended_at, machine, ${PROJECT_NAME_SQL} AS project_name, ${PROJECT_SHORT_SQL} AS project_short_name, ` +
  'summary, actions_count, commits_count, duration_minutes, created_at'

// GET /api/pb/sessions?limit=50&project=&since=
export async function handlePBSessions(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)
  const project = url.searchParams.get('project') || ''
  const since = url.searchParams.get('since') || ''

  let sql = `SELECT ${SESSION_COLUMNS} FROM pb_sessions`
  const conditions: string[] = []
  const binds: unknown[] = []

  if (project) {
    conditions.push(`${PROJECT_NAME_SQL} = ?`)
    binds.push(project)
  }
  if (since) {
    conditions.push('started_at >= ?')
    binds.push(since)
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }
  sql += ' ORDER BY started_at DESC LIMIT ?'
  binds.push(limit)

  const result = await env.DB.prepare(sql).bind(...binds).all()
  return json({ data: result.results || [], count: (result.results || []).length })
}

interface PBSessionTotals {
  total_sessions: number;
  total_minutes: number;
  avg_minutes: number;
  sessions_this_week: number;
  total_actions: number;
  total_commits: number;
}

// GET /api/pb/sessions/stats?project=&since=
// project/since are the SAME filters GET /api/pb/sessions takes, so the Session
// History tiles and the "N of M" count describe the range the list shows (the
// tiles used to read all-time totals beside a 7-day list). per_project stays
// unfiltered: it feeds the project picker, which must list every project.
export async function handlePBSessionStats(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const project = url.searchParams.get('project') || ''
  const since = url.searchParams.get('since') || ''
  const conditions: string[] = []
  const binds: unknown[] = []
  if (project) { conditions.push(`${PROJECT_NAME_SQL} = ?`); binds.push(project) }
  if (since) { conditions.push('started_at >= ?'); binds.push(since) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const andWhere = conditions.length ? `AND ${conditions.join(' AND ')}` : ''

  const [totals, perProject, perDay] = await Promise.all([
    // Aggregate totals
    env.DB.prepare(`
      SELECT
        COUNT(*) as total_sessions,
        COALESCE(SUM(duration_minutes), 0) as total_minutes,
        COALESCE(AVG(duration_minutes), 0) as avg_minutes,
        COUNT(CASE WHEN started_at >= date('now', '-7 days') THEN 1 END) as sessions_this_week,
        COALESCE(SUM(actions_count), 0) as total_actions,
        COALESCE(SUM(commits_count), 0) as total_commits
      FROM pb_sessions
      ${where}
    `).bind(...binds).first<PBSessionTotals>(),

    // Sessions per project (top 20)
    env.DB.prepare(`
      SELECT ${PROJECT_NAME_SQL} AS project_name, MAX(${PROJECT_SHORT_SQL}) AS project_short_name,
             COUNT(*) as count, SUM(duration_minutes) as total_minutes
      FROM pb_sessions
      WHERE ${PROJECT_NAME_SQL} IS NOT NULL
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 20
    `).all(),

    // Sessions per day (last 30 days)
    env.DB.prepare(`
      SELECT date(started_at) as day, COUNT(*) as count, SUM(duration_minutes) as total_minutes
      FROM pb_sessions
      WHERE started_at >= date('now', '-30 days') ${andWhere}
      GROUP BY date(started_at)
      ORDER BY day ASC
    `).bind(...binds).all(),
  ])

  return json({
    data: {
      total_sessions: totals?.total_sessions ?? 0,
      total_hours: Math.round((totals?.total_minutes ?? 0) / 60 * 10) / 10,
      avg_minutes: Math.round(totals?.avg_minutes ?? 0),
      sessions_this_week: totals?.sessions_this_week ?? 0,
      total_actions: totals?.total_actions ?? 0,
      total_commits: totals?.total_commits ?? 0,
      per_project: perProject.results || [],
      per_day: perDay.results || [],
    },
  })
}

// POST /api/pb/sessions — create or upsert a single session
export async function handleCreatePBSession(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as PBSessionInput
  if (!body.started_at) return error('started_at required', 400)

  const id = body.id || generateId()

  // Upsert: try update first, if no rows affected then insert
  const existing = await env.DB.prepare('SELECT id FROM pb_sessions WHERE id = ?').bind(id).first()

  if (existing) {
    const sets: string[] = []
    const vals: unknown[] = []
    if (body.started_at !== undefined) { sets.push('started_at = ?'); vals.push(body.started_at) }
    if (body.ended_at !== undefined) { sets.push('ended_at = ?'); vals.push(body.ended_at) }
    if (body.machine !== undefined) { sets.push('machine = ?'); vals.push(body.machine) }
    if (body.project_name !== undefined) { sets.push('project_name = ?'); vals.push(sessionProjectName(body.project_name)) }
    if (body.summary !== undefined) { sets.push('summary = ?'); vals.push(body.summary) }
    if (body.actions_count !== undefined) { sets.push('actions_count = ?'); vals.push(body.actions_count) }
    if (body.commits_count !== undefined) { sets.push('commits_count = ?'); vals.push(body.commits_count) }
    if (body.duration_minutes !== undefined) { sets.push('duration_minutes = ?'); vals.push(body.duration_minutes) }
    if (sets.length > 0) {
      vals.push(id)
      await env.DB.prepare(`UPDATE pb_sessions SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
    }
  } else {
    await env.DB.prepare(
      'INSERT INTO pb_sessions (id, started_at, ended_at, machine, project_name, summary, actions_count, commits_count, duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      body.started_at,
      body.ended_at || null,
      body.machine || null,
      sessionProjectName(body.project_name),
      body.summary || null,
      body.actions_count ?? 0,
      body.commits_count ?? 0,
      body.duration_minutes ?? null,
    ).run()
  }

  await logActivity(env, 'pb_session', `Session ${existing ? 'updated' : 'created'}: ${sessionProjectName(body.project_name) || 'unknown'}`, user.email, id, 'pb_session')
  const result = await env.DB.prepare('SELECT * FROM pb_sessions WHERE id = ?').bind(id).first()
  return json({ data: result }, existing ? 200 : 201)
}

// POST /api/pb/sessions/bulk — bulk upsert sessions
export async function handleBulkCreatePBSessions(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { sessions: PBSessionInput[] }
  if (!Array.isArray(body.sessions)) return error('sessions array required', 400)
  if (body.sessions.length > 500) return error('max 500 sessions per bulk request', 400)

  let created = 0
  let updated = 0
  const errors: string[] = []

  for (const session of body.sessions) {
    try {
      if (!session.started_at) {
        errors.push(`Missing started_at for session ${session.id || '(no id)'}`)
        continue
      }

      const id = session.id || generateId()
      const existing = await env.DB.prepare('SELECT id FROM pb_sessions WHERE id = ?').bind(id).first()

      if (existing) {
        await env.DB.prepare(
          'UPDATE pb_sessions SET started_at = ?, ended_at = ?, machine = ?, project_name = ?, summary = ?, actions_count = ?, commits_count = ?, duration_minutes = ? WHERE id = ?'
        ).bind(
          session.started_at,
          session.ended_at || null,
          session.machine || null,
          sessionProjectName(session.project_name),
          session.summary || null,
          session.actions_count ?? 0,
          session.commits_count ?? 0,
          session.duration_minutes ?? null,
          id,
        ).run()
        updated++
      } else {
        await env.DB.prepare(
          'INSERT INTO pb_sessions (id, started_at, ended_at, machine, project_name, summary, actions_count, commits_count, duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          id,
          session.started_at,
          session.ended_at || null,
          session.machine || null,
          sessionProjectName(session.project_name),
          session.summary || null,
          session.actions_count ?? 0,
          session.commits_count ?? 0,
          session.duration_minutes ?? null,
        ).run()
        created++
      }
    } catch (e) {
      errors.push(`Error for session ${session.id || '(no id)'}: ${e}`)
    }
  }

  await logActivity(env, 'pb_session', `Bulk sync: ${created} created, ${updated} updated`, user.email)
  return json({ data: { created, updated, errors } })
}
