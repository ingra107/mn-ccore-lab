import type { Env } from '../types'
import type { AuthUser } from '../helpers'
import { json } from '../helpers'

const VALID_TAGS = new Set(['note', 'idea', 'decision', 'follow-up', 'meeting-note'])

/**
 * POST /api/inbox — capture a freeform entry destined for the Peripheral Brain inbox.
 * Body: { text: string, tag?: string, project_id?: string | null, author?: string }
 */
export async function handlePostInbox(
  request: Request,
  user: AuthUser | null,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      text?: string
      tag?: string
      project_id?: string | null
      author?: string
    }

    if (!body.text || body.text.trim().length === 0) {
      return json({ error: 'text is required' }, 400)
    }

    const tag = (body.tag || 'note').trim()
    if (!VALID_TAGS.has(tag)) {
      return json(
        { error: `invalid tag; expected one of ${[...VALID_TAGS].join(', ')}` },
        400
      )
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const author =
      body.author || user?.email || user?.name || 'anonymous'
    const project_id = body.project_id || null

    await env.DB.prepare(
      'INSERT INTO inbox (id, text, tag, project_id, author, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(id, body.text.trim(), tag, project_id, author, now)
      .run()

    const record = await env.DB.prepare('SELECT * FROM inbox WHERE id = ?')
      .bind(id)
      .first()
    return json(record, 201)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
}

/**
 * GET /api/inbox?limit=50&unsynced=1 — list inbox entries.
 * Used by the PB pull script to fetch rows that need to be written to disk.
 */
export async function handleGetInbox(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') || '50', 10) || 50,
    200
  )
  const unsynced = url.searchParams.get('unsynced') === '1'
  const where = unsynced ? 'WHERE synced_at IS NULL' : ''
  const rows = await env.DB.prepare(
    `SELECT * FROM inbox ${where} ORDER BY created_at DESC LIMIT ?`
  )
    .bind(limit)
    .all()
  const results = rows.results || []
  return json({ data: results, count: results.length })
}

/**
 * POST /api/inbox/sync — mark rows synced (called by PB pull script after
 * writing the markdown file to the Peripheral Brain Inbox folder).
 * Body: { ids: string[] }
 */
export async function handleMarkSynced(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as { ids?: string[] }
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return json({ error: 'ids array required' }, 400)
    }
    const placeholders = body.ids.map(() => '?').join(',')
    const now = new Date().toISOString()
    await env.DB.prepare(
      `UPDATE inbox SET synced_at = ? WHERE id IN (${placeholders})`
    )
      .bind(now, ...body.ids)
      .run()
    return json({ updated: body.ids.length })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
}
