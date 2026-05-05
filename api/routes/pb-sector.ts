import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity } from '../helpers';
import { applyMutation } from './mutations';

// GET /api/pb/command-center?date=YYYY-MM-DD
export async function handleCommandCenter(env: Env, planDate?: string): Promise<Response> {
  const today = new Date().toISOString().split('T')[0]
  const targetDate = planDate || today
  const hour = new Date().getUTCHours() - 6 // CT approximation

  // D1 batch() sends all 11 reads in a single RPC round trip instead of 11
  // separate connections (consultant review: "N+1 on handleCommandCenter").
  // batch() always returns D1Result[] so the two formerly-`.first()` calls
  // become `results[0] ?? null`.
  const batchResults = await env.DB.batch([
    // All of Nick's tasks
    env.DB.prepare(`
      SELECT t.*, p.title as project_title, p.slug as project_slug
      FROM tasks t LEFT JOIN projects p ON t.project_id = p.slug OR t.project_id = p.id
      WHERE t.assignee IN ('nick-ingraham', 'ingra107')
      ORDER BY t.completed ASC,
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
        t.due_date ASC NULLS LAST
    `),

    // Active projects with health
    env.DB.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM tasks t WHERE (t.project_id = p.slug OR t.project_id = p.id) AND t.completed = 0) as open_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE (t.project_id = p.slug OR t.project_id = p.id) AND t.completed = 1) as done_tasks,
        (SELECT MAX(pu.created_at) FROM project_updates pu WHERE pu.project_id = p.slug) as last_update,
        (SELECT COUNT(*) FROM tasks t WHERE (t.project_id = p.slug OR t.project_id = p.id) AND t.status = 'blocked') as blocked_count
      FROM projects p WHERE p.status IN ('active', 'Active') ORDER BY p.category, p.title
    `),

    // Milestones in next 30 days
    env.DB.prepare(`
      SELECT m.*, p.title as project_title, p.slug as project_slug, m.future_note
      FROM milestones m LEFT JOIN projects p ON m.project_id = p.slug OR m.project_id = p.id
      WHERE m.target_date >= date('now', '-7 days') AND m.target_date <= date('now', '+30 days')
      ORDER BY m.target_date ASC
    `),

    // Open commitments
    env.DB.prepare("SELECT * FROM commitments WHERE status != 'done' ORDER BY due_date ASC NULLS LAST"),

    // Meetings in next 7 days
    env.DB.prepare(`
      SELECT m.id, m.date, m.title, m.type,
        (SELECT COUNT(*) FROM agenda_items ai WHERE ai.meeting_id = m.id) as agenda_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.meeting_id = m.id AND t.completed = 0) as pending_actions
      FROM meetings m WHERE m.date >= date('now') AND m.date <= date('now', '+7 days')
      ORDER BY m.date ASC
    `),

    // Recent activity (last 24h)
    env.DB.prepare(`
      SELECT type, description, actor, timestamp FROM activity_log
      WHERE timestamp > datetime('now', '-24 hours') ORDER BY timestamp DESC LIMIT 15
    `),

    // Blocked tasks across the lab (not just Nick's)
    env.DB.prepare(`
      SELECT t.*, p.title as project_title FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.slug OR t.project_id = p.id
      WHERE t.status = 'blocked' AND t.completed = 0
    `),

    // Recent decisions needing outcomes
    env.DB.prepare(`
      SELECT id, title, rationale, outcome_status, created_at FROM decision_log
      WHERE outcome_status = 'pending' AND created_at < datetime('now', '-60 days')
      ORDER BY created_at ASC LIMIT 5
    `),

    // Target date's daily plan
    env.DB.prepare('SELECT * FROM daily_plans WHERE plan_date = ?').bind(targetDate),

    // Target date's pomodoro sessions
    env.DB.prepare('SELECT * FROM pomodoro_sessions WHERE plan_date = ?').bind(targetDate),

    // Target date's reflection
    env.DB.prepare('SELECT * FROM daily_reflections WHERE plan_date = ?').bind(targetDate),
  ])

  const tasks = batchResults[0]
  const projects = batchResults[1]
  const milestones = batchResults[2]
  const commitments = batchResults[3]
  const meetings = batchResults[4]
  const recentActivity = batchResults[5]
  const blockedTasks = batchResults[6]
  const decisions = batchResults[7]
  const dailyPlan = batchResults[8].results?.[0] ?? null
  const pomodoroSessions = batchResults[9]
  const dailyReflection = batchResults[10].results?.[0] ?? null

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

  // ── Carry-forward suggestions ────────────────────────────
  // When viewing a future date with no plan, check yesterday's unfinished tasks
  let carryForward: { starTask?: any; focusTasks: any[] } = { focusTasks: [] }
  if (targetDate !== today && !dailyPlan) {
    // Find yesterday's plan (relative to targetDate)
    const prevDate = new Date(targetDate + 'T12:00:00')
    prevDate.setDate(prevDate.getDate() - 1)
    const prevDateStr = prevDate.toISOString().split('T')[0]
    const prevPlan = await env.DB.prepare('SELECT * FROM daily_plans WHERE plan_date = ?').bind(prevDateStr).first() as any

    if (prevPlan) {
      // Check which tasks from the previous plan are still open
      const prevStarId = prevPlan.star_task_id
      const prevFocusIds: string[] = prevPlan.focus_task_ids ? JSON.parse(prevPlan.focus_task_ids) : []

      if (prevStarId) {
        const task = openTasks.find((t: any) => t.id === prevStarId)
        if (task) carryForward.starTask = { ...task, _carriedFrom: prevDateStr }
      }
      for (const id of prevFocusIds) {
        const task = openTasks.find((t: any) => t.id === id)
        if (task) carryForward.focusTasks.push({ ...task, _carriedFrom: prevDateStr })
      }
    }
  }

  return json({
    data: {
      greeting, mode, today, targetDate,
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
      dailyPlan: dailyPlan || null,
      pomodoroSessions: (pomodoroSessions?.results || []),
      dailyReflection: dailyReflection || null,
      carryForward,
      suggestions: {
        starCandidates: openTasks.filter(t => t.priority === 'urgent' || t.priority === 'high' || (t.due_date && t.due_date <= today)).slice(0, 5),
        focusCandidates: openTasks.filter(t => t.priority === 'high' || t.priority === 'medium').slice(0, 10),
        quickWinCandidates: openTasks.filter(t => t.priority === 'low' || t.priority === 'medium').slice(0, 10),
      },
    },
  })
}

// POST /api/pb/capture — quick capture (task, idea, or note)
export async function handlePBCapture(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { text: string; type?: 'task' | 'idea' | 'note'; priority?: string; project?: string }
  if (!body.text?.trim()) return error('text required', 400)

  const type = body.type || 'task'
  // A1.2: type-conditional ID format. tasks get typed ULID; ideas stay hex
  // (ideas table not yet in CORE_TABLES sync).
  const id = type === 'task' ? generateId('task') : generateId()

  if (type === 'task') {
    const captureMut = await applyMutation(env, {
      table: 'tasks',
      record_id: id,
      op: 'insert',
      payload: {
        title: body.text.trim(),
        description: body.text.trim(),
        assignee: 'nick-ingraham',
        priority: body.priority || 'medium',
        source: 'pb-sector',
        status: 'todo',
        project_id: body.project || null,
      },
      route: 'handlePBCapture',
      user,
    });
    if (captureMut.status !== 'accepted') {
      return error(`mutation rejected: ${captureMut.status} — ${captureMut.reason ?? ''}`, 409);
    }
  } else if (type === 'idea') {
    await env.DB.prepare(
      'INSERT INTO ideas (id, title, submitted_by, status) VALUES (?, ?, ?, ?)'
    ).bind(id, body.text.trim(), 'nick-ingraham', 'new').run()
  } else {
    return error(`unsupported capture type: ${type}. Allowed: task, idea`, 400)
  }

  await logActivity(env, type, `PB capture: ${body.text.trim().slice(0, 100)}`, user.email, id, type)
  return json({ data: { id, type } }, 201)
}

// POST /api/pb/defer — defer a task to tomorrow/next week
export async function handlePBDefer(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { id: string; to: 'tomorrow' | 'next_week' | 'someday' }
  const dueDate = body.to === 'tomorrow' ? new Date(Date.now() + 86400000).toISOString().split('T')[0]
    : body.to === 'next_week' ? new Date(Date.now() + 7*86400000).toISOString().split('T')[0]
    : null

  const deferPatch: Record<string, unknown> = body.to === 'someday'
    ? { due_date: null, priority: 'low' }
    : { due_date: dueDate };

  const deferMut = await applyMutation(env, {
    table: 'tasks',
    record_id: body.id,
    op: 'update',
    patch: deferPatch,
    route: 'handlePBDefer',
    user,
  });
  if (deferMut.status !== 'accepted' && deferMut.status !== 'merged_clean') {
    return error(`mutation rejected: ${deferMut.status} — ${deferMut.reason ?? ''}`, 409);
  }

  return json({ data: { ok: true } })
}

// POST /api/pb/plan — create or update a daily plan
export async function handleCreateOrUpdatePlan(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    plan_date: string
    star_task_id?: string | null
    focus_task_ids?: string[]
    quick_win_ids?: string[]
    evening_task_ids?: string[]
    intention?: string
    gratitude?: string
  }
  if (!body.plan_date) return error('plan_date required', 400)

  const existing = await env.DB.prepare('SELECT id FROM daily_plans WHERE plan_date = ?').bind(body.plan_date).first()

  if (existing) {
    // Update
    const sets: string[] = ['updated_at = datetime(\'now\')']
    const vals: any[] = []
    if (body.star_task_id !== undefined) { sets.push('star_task_id = ?'); vals.push(body.star_task_id) }
    if (body.focus_task_ids !== undefined) { sets.push('focus_task_ids = ?'); vals.push(JSON.stringify(body.focus_task_ids)) }
    if (body.quick_win_ids !== undefined) { sets.push('quick_win_ids = ?'); vals.push(JSON.stringify(body.quick_win_ids)) }
    if (body.evening_task_ids !== undefined) { sets.push('evening_task_ids = ?'); vals.push(JSON.stringify(body.evening_task_ids)) }
    if (body.intention !== undefined) { sets.push('intention = ?'); vals.push(body.intention) }
    if (body.gratitude !== undefined) { sets.push('gratitude = ?'); vals.push(body.gratitude) }
    vals.push(body.plan_date)
    await env.DB.prepare(`UPDATE daily_plans SET ${sets.join(', ')} WHERE plan_date = ?`).bind(...vals).run()
    const updated = await env.DB.prepare('SELECT * FROM daily_plans WHERE plan_date = ?').bind(body.plan_date).first()
    return json({ data: updated })
  } else {
    // Create
    const id = generateId()
    await env.DB.prepare(
      'INSERT INTO daily_plans (id, plan_date, star_task_id, focus_task_ids, quick_win_ids, evening_task_ids, intention, gratitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id, body.plan_date,
      body.star_task_id || null,
      body.focus_task_ids ? JSON.stringify(body.focus_task_ids) : null,
      body.quick_win_ids ? JSON.stringify(body.quick_win_ids) : null,
      body.evening_task_ids ? JSON.stringify(body.evening_task_ids) : null,
      body.intention || null,
      body.gratitude || null
    ).run()
    await logActivity(env, 'plan', `Daily plan created for ${body.plan_date}`, user.email)
    const created = await env.DB.prepare('SELECT * FROM daily_plans WHERE id = ?').bind(id).first()
    return json({ data: created }, 201)
  }
}

// POST /api/pb/plan/reorder — reorder tasks within a plan slot
export async function handleReorderPlan(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    plan_date: string
    slot_type: 'focus' | 'quick_win'
    task_ids: string[]
  }
  if (!body.plan_date) return error('plan_date required', 400)
  if (!body.slot_type || !['focus', 'quick_win', 'evening'].includes(body.slot_type)) return error('slot_type must be focus, quick_win, or evening', 400)
  if (!Array.isArray(body.task_ids)) return error('task_ids must be an array', 400)

  const column = body.slot_type === 'focus' ? 'focus_task_ids' : body.slot_type === 'evening' ? 'evening_task_ids' : 'quick_win_ids'
  await env.DB.prepare(
    `UPDATE daily_plans SET ${column} = ?, updated_at = datetime('now') WHERE plan_date = ?`
  ).bind(JSON.stringify(body.task_ids), body.plan_date).run()

  const updated = await env.DB.prepare('SELECT * FROM daily_plans WHERE plan_date = ?').bind(body.plan_date).first()
  if (!updated) return error('No plan found for that date', 404)

  return json({ data: updated })
}

// POST /api/pb/plan/promote — move a task between plan slots
export async function handlePromoteTask(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    plan_date: string
    task_id: string
    from_slot: 'star' | 'focus' | 'quick_win' | 'evening'
    to_slot: 'star' | 'focus' | 'quick_win' | 'evening'
  }
  if (!body.plan_date) return error('plan_date required', 400)
  if (!body.task_id) return error('task_id required', 400)
  if (!body.from_slot || !body.to_slot) return error('from_slot and to_slot required', 400)
  if (body.from_slot === body.to_slot) return error('from_slot and to_slot must differ', 400)

  const plan = await env.DB.prepare('SELECT * FROM daily_plans WHERE plan_date = ?').bind(body.plan_date).first() as any
  if (!plan) return error('No plan found for that date', 404)

  // Parse current slot values
  const starTaskId: string | null = plan.star_task_id || null
  let focusIds: string[] = plan.focus_task_ids ? JSON.parse(plan.focus_task_ids) : []
  let quickWinIds: string[] = plan.quick_win_ids ? JSON.parse(plan.quick_win_ids) : []
  let eveningIds: string[] = plan.evening_task_ids ? JSON.parse(plan.evening_task_ids) : []

  // Remove from source slot
  if (body.from_slot === 'star') {
    if (starTaskId !== body.task_id) return error('Task is not in the star slot', 400)
  } else if (body.from_slot === 'focus') {
    focusIds = focusIds.filter(id => id !== body.task_id)
  } else if (body.from_slot === 'evening') {
    eveningIds = eveningIds.filter(id => id !== body.task_id)
  } else {
    quickWinIds = quickWinIds.filter(id => id !== body.task_id)
  }

  // Add to destination slot
  let newStarTaskId = starTaskId
  if (body.to_slot === 'star') {
    // If there's already a star task and it's not the one being moved, push old star to focus
    if (newStarTaskId && newStarTaskId !== body.task_id && body.from_slot !== 'star') {
      focusIds.unshift(newStarTaskId)
    }
    newStarTaskId = body.task_id
  } else if (body.to_slot === 'focus') {
    if (!focusIds.includes(body.task_id)) focusIds.push(body.task_id)
  } else if (body.to_slot === 'evening') {
    if (!eveningIds.includes(body.task_id)) eveningIds.push(body.task_id)
  } else {
    if (!quickWinIds.includes(body.task_id)) quickWinIds.push(body.task_id)
  }

  // Clear star if moved away
  if (body.from_slot === 'star') {
    newStarTaskId = null
  }

  await env.DB.prepare(
    `UPDATE daily_plans SET star_task_id = ?, focus_task_ids = ?, quick_win_ids = ?, evening_task_ids = ?, updated_at = datetime('now') WHERE plan_date = ?`
  ).bind(
    newStarTaskId,
    JSON.stringify(focusIds),
    JSON.stringify(quickWinIds),
    JSON.stringify(eveningIds),
    body.plan_date
  ).run()

  const updated = await env.DB.prepare('SELECT * FROM daily_plans WHERE plan_date = ?').bind(body.plan_date).first()
  return json({ data: updated })
}

// POST /api/pb/pomodoro/start — start a pomodoro session
export async function handleStartPomodoro(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    task_id: string
    plan_date: string
    slot_type: 'star' | 'focus' | 'quick_win'
    duration_minutes?: number
  }
  if (!body.task_id) return error('task_id required', 400)
  if (!body.plan_date) return error('plan_date required', 400)
  if (!body.slot_type) return error('slot_type required', 400)

  const id = generateId()
  const duration = body.duration_minutes || 25

  await env.DB.prepare(
    'INSERT INTO pomodoro_sessions (id, task_id, plan_date, slot_type, duration_minutes, started_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
  ).bind(id, body.task_id, body.plan_date, body.slot_type, duration).run()

  await logActivity(env, 'pomodoro', `Pomodoro started for task ${body.task_id} (${duration}min)`, user.email, body.task_id, 'task')

  const created = await env.DB.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').bind(id).first()
  return json({ data: created }, 201)
}

// POST /api/pb/pomodoro/complete — complete a pomodoro session
export async function handleCompletePomodoro(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { id: string }
  if (!body.id) return error('id required', 400)

  const existing = await env.DB.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').bind(body.id).first()
  if (!existing) return error('Pomodoro session not found', 404)

  await env.DB.prepare(
    'UPDATE pomodoro_sessions SET completed_at = datetime(\'now\'), completed = 1 WHERE id = ?'
  ).bind(body.id).run()

  await logActivity(env, 'pomodoro', `Pomodoro completed`, user.email, body.id, 'pomodoro')

  const updated = await env.DB.prepare('SELECT * FROM pomodoro_sessions WHERE id = ?').bind(body.id).first()
  return json({ data: updated })
}

// POST /api/pb/reflection — save or update daily reflection
export async function handleSaveReflection(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    plan_date: string
    highlight?: string
    learned?: string
    energy_rating?: number
    focus_rating?: number
    notes?: string
  }
  if (!body.plan_date) return error('plan_date required', 400)

  const existing = await env.DB.prepare('SELECT id FROM daily_reflections WHERE plan_date = ?').bind(body.plan_date).first()

  if (existing) {
    // Update
    const sets: string[] = ['updated_at = datetime(\'now\')']
    const vals: any[] = []
    if (body.highlight !== undefined) { sets.push('highlight = ?'); vals.push(body.highlight) }
    if (body.learned !== undefined) { sets.push('learned = ?'); vals.push(body.learned) }
    if (body.energy_rating !== undefined) { sets.push('energy_rating = ?'); vals.push(body.energy_rating) }
    if (body.focus_rating !== undefined) { sets.push('focus_rating = ?'); vals.push(body.focus_rating) }
    if (body.notes !== undefined) { sets.push('notes = ?'); vals.push(body.notes) }
    vals.push(body.plan_date)
    await env.DB.prepare(`UPDATE daily_reflections SET ${sets.join(', ')} WHERE plan_date = ?`).bind(...vals).run()
  } else {
    // Create
    const id = generateId()
    await env.DB.prepare(
      'INSERT INTO daily_reflections (id, plan_date, highlight, learned, energy_rating, focus_rating, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id, body.plan_date,
      body.highlight || null,
      body.learned || null,
      body.energy_rating || null,
      body.focus_rating || null,
      body.notes || null
    ).run()
    await logActivity(env, 'reflection', `Daily reflection saved for ${body.plan_date}`, user.email)
  }

  // Also close the daily plan
  await env.DB.prepare(
    'UPDATE daily_plans SET status = \'closed\', updated_at = datetime(\'now\') WHERE plan_date = ?'
  ).bind(body.plan_date).run()

  const reflection = await env.DB.prepare('SELECT * FROM daily_reflections WHERE plan_date = ?').bind(body.plan_date).first()
  return json({ data: reflection })
}

// GET /api/pb/plan/history?days=7 — recent plan history
export async function handlePlanHistory(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const days = parseInt(url.searchParams.get('days') || '7', 10)
  const clampedDays = Math.min(Math.max(days, 1), 90)

  const [plans, reflections] = await Promise.all([
    env.DB.prepare(
      'SELECT * FROM daily_plans WHERE plan_date >= date(\'now\', ? || \' days\') ORDER BY plan_date DESC'
    ).bind(`-${clampedDays}`).all(),

    env.DB.prepare(
      'SELECT * FROM daily_reflections WHERE plan_date >= date(\'now\', ? || \' days\') ORDER BY plan_date DESC'
    ).bind(`-${clampedDays}`).all(),
  ])

  // Merge plans and reflections by date
  const plansByDate = new Map<string, any>()
  for (const plan of (plans.results || []) as any[]) {
    plansByDate.set(plan.plan_date, { plan, reflection: null })
  }
  for (const reflection of (reflections.results || []) as any[]) {
    const entry = plansByDate.get(reflection.plan_date)
    if (entry) {
      entry.reflection = reflection
    } else {
      plansByDate.set(reflection.plan_date, { plan: null, reflection })
    }
  }

  // Sort by date descending
  const history = Array.from(plansByDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, data]) => ({ date, ...data }))

  return json({ data: history })
}

// POST /api/pb/dispatch/add — add item to dispatch queue
export async function handleAddToDispatch(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    task_id?: string
    task_title?: string
    project_slug?: string
    comment: string
    comment_type?: 'action' | 'info'
  }
  if (!body.comment?.trim()) return error('comment required', 400)

  const id = generateId()
  await env.DB.prepare(
    'INSERT INTO dispatch_queue (id, task_id, task_title, project_slug, comment, comment_type) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.task_id || null,
    body.task_title || null,
    body.project_slug || null,
    body.comment.trim(),
    body.comment_type || 'action'
  ).run()

  await logActivity(env, 'dispatch', `Queued for Claude: ${body.comment.trim().slice(0, 80)}`, user.email)
  return json({ data: { id } }, 201)
}

// GET /api/pb/dispatch/pending — get pending dispatch items
export async function handleGetPendingDispatch(env: Env): Promise<Response> {
  const items = await env.DB.prepare(
    "SELECT * FROM dispatch_queue WHERE status = 'pending' ORDER BY created_at ASC"
  ).all()
  return json({ data: items.results || [], count: (items.results || []).length })
}

// POST /api/pb/dispatch/send — mark all pending as dispatched
export async function handleSendDispatch(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const now = new Date().toISOString()
  const pending = await env.DB.prepare(
    "SELECT * FROM dispatch_queue WHERE status = 'pending' ORDER BY created_at ASC"
  ).all()

  const items = (pending.results || []) as any[]
  if (items.length === 0) return json({ data: { dispatched: 0 } })

  // Mark all pending as dispatched
  await env.DB.prepare(
    "UPDATE dispatch_queue SET status = 'dispatched', dispatched_at = ? WHERE status = 'pending'"
  ).bind(now).run()

  await logActivity(env, 'dispatch', `Dispatched ${items.length} items to Claude`, user.email)
  return json({ data: { dispatched: items.length, items } })
}

// POST /api/pb/dispatch/complete — mark a dispatch item as completed
export async function handleCompleteDispatchItem(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { id: string; response?: string }
  if (!body.id) return error('id required', 400)

  const now = new Date().toISOString()
  await env.DB.prepare(
    "UPDATE dispatch_queue SET status = 'completed', completed_at = ?, response = ? WHERE id = ?"
  ).bind(now, body.response || null, body.id).run()

  // If this item has a task_id, also post the response as a task comment
  if (body.response) {
    const item = await env.DB.prepare('SELECT task_id FROM dispatch_queue WHERE id = ?').bind(body.id).first() as any
    if (item?.task_id) {
      const commentId = generateId()
      await env.DB.prepare(
        'INSERT INTO task_comments (id, task_id, author_slug, content, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(commentId, item.task_id, 'claude-ai', body.response, now).run()
    }
  }

  return json({ data: { ok: true } })
}
