import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity } from '../helpers';

// GET /api/pb/command-center
export async function handleCommandCenter(env: Env): Promise<Response> {
  const today = new Date().toISOString().split('T')[0]
  const hour = new Date().getUTCHours() - 6 // CT approximation

  const [tasks, projects, milestones, commitments, meetings, recentActivity, blockedTasks, decisions] = await Promise.all([
    // All of Nick's tasks
    env.DB.prepare(`
      SELECT t.*, p.title as project_title, p.slug as project_slug
      FROM tasks t LEFT JOIN projects p ON t.project_id = p.slug OR t.project_id = p.id
      WHERE t.assignee IN ('ningraha', 'nick', 'ingra107')
      ORDER BY t.completed ASC,
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
        t.due_date ASC NULLS LAST
    `).all(),

    // Active projects with health
    env.DB.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM tasks t WHERE (t.project_id = p.slug OR t.project_id = p.id) AND t.completed = 0) as open_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE (t.project_id = p.slug OR t.project_id = p.id) AND t.completed = 1) as done_tasks,
        (SELECT MAX(pu.created_at) FROM project_updates pu WHERE pu.project_id = p.slug) as last_update,
        (SELECT COUNT(*) FROM tasks t WHERE (t.project_id = p.slug OR t.project_id = p.id) AND t.status = 'blocked') as blocked_count
      FROM projects p WHERE p.status IN ('active', 'Active') ORDER BY p.category, p.title
    `).all(),

    // Milestones in next 30 days
    env.DB.prepare(`
      SELECT m.*, p.title as project_title, p.slug as project_slug, m.future_note
      FROM milestones m LEFT JOIN projects p ON m.project_id = p.slug OR m.project_id = p.id
      WHERE m.target_date >= date('now', '-7 days') AND m.target_date <= date('now', '+30 days')
      ORDER BY m.target_date ASC
    `).all(),

    // Open commitments
    env.DB.prepare("SELECT * FROM commitments WHERE status != 'done' ORDER BY due_date ASC NULLS LAST").all(),

    // Meetings in next 7 days
    env.DB.prepare(`
      SELECT m.id, m.date, m.title, m.type,
        (SELECT COUNT(*) FROM agenda_items ai WHERE ai.meeting_id = m.id) as agenda_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.meeting_id = m.id AND t.completed = 0) as pending_actions
      FROM meetings m WHERE m.date >= date('now') AND m.date <= date('now', '+7 days')
      ORDER BY m.date ASC
    `).all(),

    // Recent activity (last 24h)
    env.DB.prepare(`
      SELECT type, description, actor, timestamp FROM activity_log
      WHERE timestamp > datetime('now', '-24 hours') ORDER BY timestamp DESC LIMIT 15
    `).all(),

    // Blocked tasks across the lab (not just Nick's)
    env.DB.prepare(`
      SELECT t.*, p.title as project_title FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.slug OR t.project_id = p.id
      WHERE t.status = 'blocked' AND t.completed = 0
    `).all(),

    // Recent decisions needing outcomes
    env.DB.prepare(`
      SELECT id, title, rationale, outcome_status, created_at FROM decision_log
      WHERE outcome_status = 'pending' AND created_at < datetime('now', '-60 days')
      ORDER BY created_at ASC LIMIT 5
    `).all(),
  ])

  const allTasks = (tasks.results || []) as any[]
  const openTasks = allTasks.filter((t: any) => !t.completed)
  const overdueTasks = openTasks.filter((t: any) => t.due_date && t.due_date < today)

  // Smart grouping: not by priority label, but by CONTEXT
  // "Focus Now" = urgent + overdue + blocked-by-me
  // "Today" = high priority + due today
  // "This Week" = medium priority + due this week
  // "Backlog" = everything else
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay())); const weekEndStr = weekEnd.toISOString().split('T')[0]

  const focusNow = openTasks.filter((t: any) => t.priority === 'urgent' || (t.due_date && t.due_date < today) || t.status === 'blocked')
  const todayTasks = openTasks.filter((t: any) => !focusNow.includes(t) && (t.priority === 'high' || t.due_date === today))
  const thisWeek = openTasks.filter((t: any) => !focusNow.includes(t) && !todayTasks.includes(t) && (t.priority === 'medium' || (t.due_date && t.due_date <= weekEndStr)))
  const backlog = openTasks.filter((t: any) => !focusNow.includes(t) && !todayTasks.includes(t) && !thisWeek.includes(t))
  const recentlyCompleted = allTasks.filter((t: any) => t.completed && t.completed_at && t.completed_at > new Date(Date.now() - 48*3600000).toISOString()).slice(0, 8)

  // Time-aware greeting
  let greeting: string, mode: string
  if (hour < 10) { greeting = 'Good morning'; mode = 'plan' }
  else if (hour < 15) { greeting = 'Afternoon'; mode = 'execute' }
  else if (hour < 19) { greeting = 'Late afternoon'; mode = 'review' }
  else { greeting = 'Evening'; mode = 'capture' }

  // Smart nudges
  const nudges: string[] = []
  if (overdueTasks.length > 0) nudges.push(`${overdueTasks.length} task${overdueTasks.length > 1 ? 's' : ''} overdue`)
  if ((blockedTasks.results || []).length > 0) nudges.push(`${(blockedTasks.results || []).length} blocked tasks across the lab`)
  const meetingsToday = ((meetings.results || []) as any[]).filter((m: any) => m.date === today)
  if (meetingsToday.length > 0) nudges.push(`${meetingsToday.length} meeting${meetingsToday.length > 1 ? 's' : ''} today`)
  if ((commitments.results || []).filter((c: any) => c.due_date && c.due_date <= today).length > 0) nudges.push('Commitments due today')
  if ((decisions.results || []).length > 0) nudges.push(`${(decisions.results || []).length} decisions awaiting outcome review`)

  return json({
    data: {
      greeting, mode, today,
      nudges,
      sections: { focusNow, today: todayTasks, thisWeek, backlog, recentlyCompleted },
      stats: { totalOpen: openTasks.length, overdue: overdueTasks.length, completedRecently: recentlyCompleted.length },
      projects: projects.results || [],
      milestones: milestones.results || [],
      commitments: commitments.results || [],
      meetings: meetings.results || [],
      recentActivity: recentActivity.results || [],
      blockedTasks: blockedTasks.results || [],
      decisionsForReview: decisions.results || [],
    },
  })
}

// POST /api/pb/capture — quick capture (task, idea, or note)
export async function handlePBCapture(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { text: string; type?: 'task' | 'idea' | 'note'; priority?: string; project?: string }
  if (!body.text?.trim()) return error('text required', 400)

  const id = generateId()
  const type = body.type || 'task'

  if (type === 'task') {
    await env.DB.prepare(
      'INSERT INTO tasks (id, title, description, assignee, priority, source, status, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, body.text.trim(), body.text.trim(), 'ningraha', body.priority || 'medium', 'pb-sector', 'todo', body.project || null).run()
  } else if (type === 'idea') {
    await env.DB.prepare(
      'INSERT INTO ideas (id, title, submitted_by, status) VALUES (?, ?, ?, ?)'
    ).bind(id, body.text.trim(), 'ningraha', 'new').run()
  }

  await logActivity(env, type, `PB capture: ${body.text.trim().slice(0, 100)}`, user.email, id, type)
  return json({ data: { id, type } }, 201)
}

// POST /api/pb/defer — defer a task to tomorrow/next week
export async function handlePBDefer(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { id: string; to: 'tomorrow' | 'next_week' | 'someday' }
  const dueDate = body.to === 'tomorrow' ? new Date(Date.now() + 86400000).toISOString().split('T')[0]
    : body.to === 'next_week' ? new Date(Date.now() + 7*86400000).toISOString().split('T')[0]
    : null

  if (body.to === 'someday') {
    await env.DB.prepare('UPDATE tasks SET due_date = ?, priority = ? WHERE id = ?')
      .bind(null, 'low', body.id).run()
  } else {
    await env.DB.prepare('UPDATE tasks SET due_date = ? WHERE id = ?')
      .bind(dueDate, body.id).run()
  }

  return json({ data: { ok: true } })
}
