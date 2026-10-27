// A product's current draft (schema-v149, PB mig 154, 2026-10-26).
//
//   GET  /api/products/:id/current-draft        the current draft, the history, the receipts
//   POST /api/products/:id/current-draft        make a URL the current draft (replace)
//   POST /api/products/:id/current-draft/undo   reverse one promotion
//
// Nick, 2026-10-26: "you will have seen that there were two more versions of
// edits to an abstract or manuscript and you will have filed them away so that
// when I do go to work on that project I know that I'm working with the most
// recent version". Rulings: auto-file a newer version as current and list it,
// one-tick undo, the old pointer archived and never removed.
//
// A draft is a PROJECT-owned links row scoped to the product (product_id); the
// current one has role 'current_draft', the replaced ones 'archive'. This is
// the ONE door that moves which row is current (the generic doors refuse it:
// api/lib/current-draft.ts). Each POST is ONE D1 batch:
//
//   1. INSERT the receipt (current_draft_changes) -- guarded by a WHERE that
//      re-checks the caller's expected current draft and the candidate row's
//      state INSIDE the transaction;
//   2. archive the old current draft  -- only if the receipt row exists;
//   3. promote the candidate (re-use the product's archived row for the URL,
//      or insert a new one)             -- only if the receipt row exists.
//
// When the state moved between the reads and the batch, step 1 inserts
// nothing, steps 2-3 then match nothing, and the read-back finds no receipt:
// 409, nothing changed. A concurrent promotion that did land makes step 3
// violate idx_links_one_current_draft and D1 rolls the whole batch back. The
// archive always runs before the promote, so it carries the lower seq, which
// is the order PB's links pull (and its singleton index) needs.
//
// Undo is the inverse batch, compared against the promotion it undoes: it
// runs only while that promotion's draft is still current, so an old tick
// cannot overwrite a later change. idx_current_draft_changes_one_undo makes a
// promotion undoable once.
//
// Idempotency: the receipt's idempotency_key is UNIQUE. A request whose key
// already has a receipt returns that receipt (replayed: true) when it asks for
// the same thing, and a 409 when it asks for something else.

import type { Env } from '../types'
import type { AuthUser } from '../helpers'
import { json, error, generateId, assertProjectVisible } from '../helpers'
import { nowInstant } from '../lib/time'
import { CURRENT_DRAFT_ROLE } from '../lib/current-draft'

// The sync lane's column set (api/routes/links.ts LINKS_SELECT_COLS): PB
// caches the returned rows through its pull's own per-row write.
const ROW_COLS = [
  'id', 'owner_table', 'owner_id', 'role', 'type', 'canonical_url', 'short_title', 'source_raw',
  'sort_order', 'deleted_at', 'seq', 'last_mutation_id', 'created_at', 'updated_at', 'kind', 'product_id',
].join(', ')

const CHANGE_COLS = 'id, product_id, op, idempotency_key, candidate_url, before_link_id, after_link_id, ' +
  'created_link, undoes_id, undone_by, note, actor, origin, created_at'

type Product = { id: string; project_id: string }
type Change = {
  id: string; product_id: string; op: 'promote' | 'undo'; idempotency_key: string;
  candidate_url: string | null; before_link_id: string | null; after_link_id: string | null;
  created_link: number; undoes_id: string | null; undone_by: string | null
}

const LINK_TYPES = new Set([
  'iwd', 'google_doc', 'google_sheet', 'google_slide', 'google_form', 'box_folder', 'github_repo',
  'github_issue', 'github_tree', 'gmail_thread', 'gmail_draft', 'obsidian_note', 'local_folder',
  'local_file', 'web', 'artifact',
])

function refuse(code: string, message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return json({ error: message, code, ...extra }, status)
}

async function readProduct(env: Env, request: Request, productId: string): Promise<{ product?: Product; block?: Response }> {
  // env.DB is the caller's handle: a product of a project they are not on reads as absent.
  const product = await env.DB
    .prepare('SELECT id, project_id FROM products WHERE id = ? AND deleted_at IS NULL')
    .bind(productId)
    .first<Product>()
  if (!product) return { block: error('Product not found', 404) }
  const block = await assertProjectVisible(request, env, product.project_id)
  if (block) return { block }
  return { product }
}

async function currentId(env: Env, productId: string): Promise<string | null> {
  const row = await env.DB
    .prepare(`SELECT id FROM links WHERE product_id = ? AND role = '${CURRENT_DRAFT_ROLE}' AND deleted_at IS NULL`)
    .bind(productId)
    .first<{ id: string }>()
  return row?.id ?? null
}

async function rowsFor(env: Env, ids: (string | null)[]): Promise<Record<string, unknown>[]> {
  const live = ids.filter((x): x is string => !!x)
  if (live.length === 0) return []
  const res = await env.DB
    .prepare(`SELECT ${ROW_COLS} FROM links WHERE id IN (${live.map(() => '?').join(', ')}) ORDER BY seq ASC`)
    .bind(...live)
    .all<Record<string, unknown>>()
  return res.results ?? []
}

async function changeByKey(env: Env, key: string): Promise<Change | null> {
  return env.DB.prepare(`SELECT ${CHANGE_COLS} FROM current_draft_changes WHERE idempotency_key = ?`)
    .bind(key).first<Change>()
}

function changeOut(c: Change, replayed: boolean): Record<string, unknown> {
  return {
    id: c.id, op: c.op, product_id: c.product_id, before_link_id: c.before_link_id,
    after_link_id: c.after_link_id, created_link: c.created_link === 1, undoes_id: c.undoes_id,
    undone_by: c.undone_by, replayed,
  }
}

function isUniqueFailure(e: unknown): boolean {
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/.test(e instanceof Error ? e.message : String(e))
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body as Record<string, unknown> : null
  } catch {
    return null
  }
}

// GET /api/products/:id/current-draft
export async function handleGetCurrentDraft(productId: string, request: Request, env: Env): Promise<Response> {
  const { product, block } = await readProduct(env, request, productId)
  if (block) return block
  const history = (await env.DB
    .prepare(`SELECT ${ROW_COLS} FROM links WHERE product_id = ? AND deleted_at IS NULL
               ORDER BY CASE role WHEN '${CURRENT_DRAFT_ROLE}' THEN 0 ELSE 1 END, seq DESC`)
    .bind(product!.id)
    .all<Record<string, unknown>>()).results ?? []
  const changes = (await env.DB
    .prepare(`SELECT ${CHANGE_COLS} FROM current_draft_changes WHERE product_id = ? ORDER BY created_at DESC, id DESC LIMIT 200`)
    .bind(product!.id)
    .all<Record<string, unknown>>()).results ?? []
  const current = history.find((r) => r.role === CURRENT_DRAFT_ROLE) ?? null
  return json({ product, current, history, changes })
}

// POST /api/products/:id/current-draft
// Body: { candidate: { canonical_url, type, short_title, source_raw?, kind? },
//         expected_current_link_id: string | null, idempotency_key: string,
//         new_link_id?: 'link_<ULID>', note?: string, origin?: string }
export async function handleSetCurrentDraft(
  productId: string, request: Request, user: AuthUser, env: Env,
): Promise<Response> {
  const body = await readBody(request)
  if (!body) return error('JSON body required', 400)
  const cand = body.candidate as Record<string, unknown> | undefined
  const key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : ''
  if (!key || key.length > 200) return error('idempotency_key is required', 400)
  if (!cand || typeof cand !== 'object') return error('candidate is required', 400)
  const url = typeof cand.canonical_url === 'string' ? cand.canonical_url.trim() : ''
  const type = typeof cand.type === 'string' ? cand.type : ''
  const title = typeof cand.short_title === 'string' && cand.short_title.trim() ? cand.short_title.trim() : url
  if (!url) return error('candidate.canonical_url is required', 400)
  if (!LINK_TYPES.has(type)) return error(`candidate.type ${JSON.stringify(type)} is not a link type`, 400)
  if (!('expected_current_link_id' in body)) {
    return error('expected_current_link_id is required (null when the product has no current draft)', 400)
  }
  const expected = typeof body.expected_current_link_id === 'string' ? body.expected_current_link_id : null
  const newId = typeof body.new_link_id === 'string' && /^link_[0-9A-Z]{26}$/.test(body.new_link_id)
    ? body.new_link_id : `link_${generateId()}`
  const kind = typeof cand.kind === 'string' && cand.kind ? cand.kind : null
  const sourceRaw = typeof cand.source_raw === 'string' ? cand.source_raw : null
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null
  const origin = typeof body.origin === 'string' ? body.origin.slice(0, 80) : null

  const { product, block } = await readProduct(env, request, productId)
  if (block) return block
  const p = product!

  const prior = await changeByKey(env, key)
  if (prior) {
    if (prior.op !== 'promote' || prior.product_id !== p.id || prior.candidate_url !== url) {
      return refuse('idempotency_mismatch', 'idempotency_key already names a different change', 409)
    }
    return json({ change: changeOut(prior, true), rows: await rowsFor(env, [prior.before_link_id, prior.after_link_id]) })
  }

  const current = await currentId(env, p.id)
  if (current !== expected) {
    return refuse('current_draft_stale', 'The product\'s current draft is not the one this request expected', 409,
      { current_link_id: current })
  }
  if (current) {
    const cur = await env.DB.prepare('SELECT canonical_url FROM links WHERE id = ?').bind(current).first<{ canonical_url: string }>()
    if (cur?.canonical_url === url) {
      return refuse('already_current', 'That URL is already the product\'s current draft', 409, { current_link_id: current })
    }
  }
  // Re-use the product's own archived row for this URL (its history row), so
  // re-promoting a draft never grows a second row for it.
  const reuse = await env.DB
    .prepare(`SELECT id FROM links WHERE owner_table = 'projects' AND owner_id = ? AND product_id = ?
               AND canonical_url = ? AND role = 'archive' AND deleted_at IS NULL`)
    .bind(p.project_id, p.id, url)
    .first<{ id: string }>()

  const changeId = `cdc_${generateId()}`
  const now = nowInstant()
  const afterId = reuse?.id ?? newId
  const receiptExists = 'EXISTS (SELECT 1 FROM current_draft_changes WHERE id = ?)'
  const candidateState = reuse
    ? `EXISTS (SELECT 1 FROM links WHERE id = ? AND product_id = ? AND role = 'archive' AND deleted_at IS NULL)`
    : `NOT EXISTS (SELECT 1 FROM links WHERE product_id = ? AND canonical_url = ? AND deleted_at IS NULL)`
  const candidateBinds = reuse ? [reuse.id, p.id] : [p.id, url]
  const stmts = [
    env.DB.prepare(
      `INSERT INTO current_draft_changes
         (id, product_id, op, idempotency_key, candidate_url, before_link_id, after_link_id, created_link, note, actor, origin, created_at)
       SELECT ?, ?, 'promote', ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE (SELECT id FROM links WHERE product_id = ? AND role = '${CURRENT_DRAFT_ROLE}' AND deleted_at IS NULL) IS ?
          AND ${candidateState}`,
    ).bind(changeId, p.id, key, url, expected, afterId, reuse ? 0 : 1, note, user.slug ?? user.email ?? null, origin, now,
      p.id, expected, ...candidateBinds),
  ]
  if (expected) {
    stmts.push(env.DB.prepare(
      `UPDATE links SET role = 'archive', updated_at = ?, last_mutation_id = ?
        WHERE id = ? AND role = '${CURRENT_DRAFT_ROLE}' AND ${receiptExists}`,
    ).bind(now, changeId, expected, changeId))
  }
  if (reuse) {
    stmts.push(env.DB.prepare(
      `UPDATE links SET role = '${CURRENT_DRAFT_ROLE}', updated_at = ?, last_mutation_id = ?,
              kind = COALESCE(?, kind)
        WHERE id = ? AND ${receiptExists}`,
    ).bind(now, changeId, kind, reuse.id, changeId))
  } else {
    const maxRow = await env.DB
      .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM links
                 WHERE owner_table = 'projects' AND owner_id = ? AND deleted_at IS NULL`)
      .bind(p.project_id)
      .first<{ m: number }>()
    stmts.push(env.DB.prepare(
      `INSERT INTO links (id, owner_table, owner_id, product_id, role, type, canonical_url, short_title,
                          source_raw, sort_order, kind, last_mutation_id, created_at, updated_at)
       SELECT ?, 'projects', ?, ?, '${CURRENT_DRAFT_ROLE}', ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE ${receiptExists}`,
    ).bind(newId, p.project_id, p.id, type, url, title, sourceRaw, (maxRow?.m ?? -1) + 1, kind, changeId, now, now, changeId))
  }

  try {
    await env.DB.batch(stmts)
  } catch (e) {
    if (isUniqueFailure(e)) {
      const won = await changeByKey(env, key)
      if (won) return json({ change: changeOut(won, true), rows: await rowsFor(env, [won.before_link_id, won.after_link_id]) })
      return refuse('current_draft_stale', 'Another change to this product\'s current draft landed first', 409,
        { current_link_id: await currentId(env, p.id) })
    }
    if (/FOREIGN KEY/.test(e instanceof Error ? e.message : String(e))) {
      return error(`${JSON.stringify(kind)} is not a link kind`, 400)
    }
    throw e
  }
  const landed = await env.DB.prepare(`SELECT ${CHANGE_COLS} FROM current_draft_changes WHERE id = ?`).bind(changeId).first<Change>()
  if (!landed) {
    return refuse('current_draft_stale', 'The product\'s current draft changed while this request ran; nothing was written', 409,
      { current_link_id: await currentId(env, p.id) })
  }
  return json({ change: changeOut(landed, false), rows: await rowsFor(env, [expected, afterId]) })
}

// POST /api/products/:id/current-draft/undo
// Body: { change_id: 'cdc_...', idempotency_key: string, origin?: string }
export async function handleUndoCurrentDraft(
  productId: string, request: Request, user: AuthUser, env: Env,
): Promise<Response> {
  const body = await readBody(request)
  if (!body) return error('JSON body required', 400)
  const changeIdIn = typeof body.change_id === 'string' ? body.change_id : ''
  const key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : ''
  if (!changeIdIn) return error('change_id is required', 400)
  if (!key || key.length > 200) return error('idempotency_key is required', 400)
  const origin = typeof body.origin === 'string' ? body.origin.slice(0, 80) : null

  const { product, block } = await readProduct(env, request, productId)
  if (block) return block
  const p = product!

  const prior = await changeByKey(env, key)
  if (prior) {
    if (prior.op !== 'undo' || prior.undoes_id !== changeIdIn) {
      return refuse('idempotency_mismatch', 'idempotency_key already names a different change', 409)
    }
    return json({ change: changeOut(prior, true), rows: await rowsFor(env, [prior.before_link_id, prior.after_link_id]) })
  }
  const promo = await env.DB.prepare(`SELECT ${CHANGE_COLS} FROM current_draft_changes WHERE id = ?`)
    .bind(changeIdIn).first<Change>()
  if (!promo || promo.product_id !== p.id) return error('Change not found', 404)
  if (promo.op !== 'promote') return refuse('not_a_promotion', 'Only a promotion can be undone', 400)
  if (promo.undone_by) return refuse('already_undone', 'That promotion was already undone', 409, { undone_by: promo.undone_by })
  const current = await currentId(env, p.id)
  if (current !== promo.after_link_id) {
    return refuse('current_draft_moved', 'The product\'s current draft changed after that promotion; undo it from the newer change', 409,
      { current_link_id: current })
  }
  const restore = promo.before_link_id
  if (restore) {
    const back = await env.DB.prepare(
      `SELECT id FROM links WHERE id = ? AND product_id = ? AND role = 'archive' AND deleted_at IS NULL`,
    ).bind(restore, p.id).first<{ id: string }>()
    if (!back) return refuse('previous_draft_gone', 'The draft that promotion replaced is no longer in the product\'s history', 409)
  }

  const undoId = `cdc_${generateId()}`
  const now = nowInstant()
  const receiptExists = 'EXISTS (SELECT 1 FROM current_draft_changes WHERE id = ?)'
  const stmts = [
    env.DB.prepare(
      `INSERT INTO current_draft_changes
         (id, product_id, op, idempotency_key, before_link_id, after_link_id, undoes_id, actor, origin, created_at)
       SELECT ?, ?, 'undo', ?, ?, ?, ?, ?, ?, ?
        WHERE (SELECT id FROM links WHERE product_id = ? AND role = '${CURRENT_DRAFT_ROLE}' AND deleted_at IS NULL) IS ?
          AND (? IS NULL OR EXISTS (SELECT 1 FROM links WHERE id = ? AND product_id = ? AND role = 'archive' AND deleted_at IS NULL))`,
    ).bind(undoId, p.id, key, promo.after_link_id, restore, promo.id, user.slug ?? user.email ?? null, origin, now,
      p.id, promo.after_link_id, restore, restore, p.id),
    env.DB.prepare(
      `UPDATE links SET role = 'archive', updated_at = ?, last_mutation_id = ?
        WHERE id = ? AND role = '${CURRENT_DRAFT_ROLE}' AND ${receiptExists}`,
    ).bind(now, undoId, promo.after_link_id, undoId),
  ]
  if (restore) {
    stmts.push(env.DB.prepare(
      `UPDATE links SET role = '${CURRENT_DRAFT_ROLE}', updated_at = ?, last_mutation_id = ?
        WHERE id = ? AND ${receiptExists}`,
    ).bind(now, undoId, restore, undoId))
  }
  stmts.push(env.DB.prepare(
    `UPDATE current_draft_changes SET undone_by = ? WHERE id = ? AND ${receiptExists}`,
  ).bind(undoId, promo.id, undoId))

  try {
    await env.DB.batch(stmts)
  } catch (e) {
    if (isUniqueFailure(e)) {
      return refuse('already_undone', 'That promotion was undone or replaced concurrently', 409,
        { current_link_id: await currentId(env, p.id) })
    }
    throw e
  }
  const landed = await env.DB.prepare(`SELECT ${CHANGE_COLS} FROM current_draft_changes WHERE id = ?`).bind(undoId).first<Change>()
  if (!landed) {
    return refuse('current_draft_moved', 'The product\'s current draft changed while this request ran; nothing was written', 409,
      { current_link_id: await currentId(env, p.id) })
  }
  return json({ change: changeOut(landed, false), rows: await rowsFor(env, [promo.after_link_id, restore]) })
}
