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

// GET /api/pb/sessions?limit=50&project=&since=
export async function handlePBSessions(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)
  const project = url.searchParams.get('project') || ''
  const since = url.searchParams.get('since') || ''

  let sql = 'SELECT * FROM pb_sessions'
  const conditions: string[] = []
  const binds: unknown[] = []

  if (project) {
    conditions.push('project_name = ?')
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

// GET /api/pb/sessions/stats
export async function handlePBSessionStats(env: Env): Promise<Response> {
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
    `).first(),

    // Sessions per project (top 20)
    env.DB.prepare(`
      SELECT project_name, COUNT(*) as count, SUM(duration_minutes) as total_minutes
      FROM pb_sessions
      WHERE project_name IS NOT NULL AND project_name != ''
      GROUP BY project_name
      ORDER BY count DESC
      LIMIT 20
    `).all(),

    // Sessions per day (last 30 days)
    env.DB.prepare(`
      SELECT date(started_at) as day, COUNT(*) as count, SUM(duration_minutes) as total_minutes
      FROM pb_sessions
      WHERE started_at >= date('now', '-30 days')
      GROUP BY date(started_at)
      ORDER BY day ASC
    `).all(),
  ])

  return json({
    data: {
      total_sessions: (totals as any)?.total_sessions ?? 0,
      total_hours: Math.round(((totals as any)?.total_minutes ?? 0) / 60 * 10) / 10,
      avg_minutes: Math.round((totals as any)?.avg_minutes ?? 0),
      sessions_this_week: (totals as any)?.sessions_this_week ?? 0,
      total_actions: (totals as any)?.total_actions ?? 0,
      total_commits: (totals as any)?.total_commits ?? 0,
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
    if (body.project_name !== undefined) { sets.push('project_name = ?'); vals.push(body.project_name) }
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
      body.project_name || null,
      body.summary || null,
      body.actions_count ?? 0,
      body.commits_count ?? 0,
      body.duration_minutes ?? null,
    ).run()
  }

  await logActivity(env, 'pb_session', `Session ${existing ? 'updated' : 'created'}: ${body.project_name || 'unknown'}`, user.email, id, 'pb_session')
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
          session.project_name || null,
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
          session.project_name || null,
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
