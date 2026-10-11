// Archived 2026-10-11 (s51 dead-weight). Three handlers cut from api/routes/pb-sector.ts at 9a0de385.
// Their only caller, the PB `dispatch` skill, is archived (PB .claude/skills/_archived/orphans/dispatch).
// Imports they needed: ctToday ('../lib/ct-date'), nowInstant ('../lib/time'), applyMutation ('./mutations'),
// postActivityEntry ('../lib/activity-entry'), error/json/logActivity ('../helpers').

// POST /api/pb/defer — defer a task to tomorrow/next week
export async function handlePBDefer(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { id: string; to: 'tomorrow' | 'next_week' | 'someday' }
  const dueDate = body.to === 'tomorrow' ? ctToday(1)
    : body.to === 'next_week' ? ctToday(7)
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

// POST /api/pb/dispatch/send — mark all pending as dispatched
export async function handleSendDispatch(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const now = nowInstant()
  const pending = await env.DB.prepare(
    "SELECT * FROM dispatch_queue WHERE status = 'pending' ORDER BY created_at ASC"
  ).all()

  const items = (pending.results || []) as Record<string, unknown>[]
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

  const now = nowInstant()
  await env.DB.prepare(
    "UPDATE dispatch_queue SET status = 'completed', completed_at = ?, response = ? WHERE id = ?"
  ).bind(now, body.response || null, body.id).run()

  // If this item has a task_id, also post the response as a task comment.
  // Design C (v77): the AI answer lands in the unified timeline via
  // postActivityEntry(kind='comment', actor_slug='claude-ai'). fireSideEffects
  // is false — an AI reply that quotes @someone (or @hermes) must not re-fire
  // mention notifications or a recursive AI request.
  if (body.response) {
    const item = await env.DB.prepare('SELECT task_id FROM dispatch_queue WHERE id = ?').bind(body.id).first<{ task_id: string | null }>()
    if (item?.task_id) {
      await postActivityEntry({
        env,
        user: { email: 'claude-ai', name: 'Hermes', slug: 'claude-ai' },
        entityType: 'task',
        entityId: item.task_id,
        kind: 'comment',
        body: body.response,
        actorSlug: 'claude-ai',
        fireSideEffects: false,
      })
    }
  }

  return json({ data: { ok: true } })
}

// ---- Cut 2026-10-11 (Queue for Claude lane removed, Nick: "cut it all") ----
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

  // Z3.2: canonicalize project_slug before insert so dispatch_queue stores a
  // stable canonical slug (not a raw id or stale alias).
  const canonicalProjectSlug = body.project_slug
    ? await projectRefToCanonical(env, body.project_slug)
    : null;

  const id = generateId()
  await env.DB.prepare(
    'INSERT INTO dispatch_queue (id, task_id, task_title, project_slug, comment, comment_type) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.task_id || null,
    body.task_title || null,
    canonicalProjectSlug,
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
