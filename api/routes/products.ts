// Products read routes (schema-v124/v125, 2026-10-11).
//
// GET /api/products?seq_after=N&limit=K&include_deleted=1
// GET /api/product-funding?seq_after=N&limit=K&include_deleted=1
//   The PB sync pull lane (scripts/db/sync/drivers/hub.py, opaque-PK pull
//   body). PI/API-key gated, like /api/links: PB's cache mirrors every row,
//   tombstones included, ordered by seq so the client advances its cursor to
//   the max seq it saw. Writes go through POST /api/mutations only.
//
// GET /api/projects/:slug/products
//   Team-facing: the live products of one project the caller can see
//   (assertProjectVisible, membership), with each stage's label and the
//   kind's labels, ordered home first then sort_order, plus `kinds`: every
//   live kind with its ladder, so the UI draws a ladder and offers "add a
//   product" without a copy of the kind data. What the product UI (plan
//   step 8) reads.
//
// Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.

import type { Env } from '../types';
import { json, error, isPiRequest, assertProjectVisible, generateId } from '../helpers';
import type { AuthUser } from '../helpers';
import { applyMutation, hashTouched } from './mutations';

/** Columns PB's cache holds (PB scripts/db/migrations/144_products.sql). */
const SYNC_COLS: Record<'products' | 'product_funding', string> = {
  products: [
    'id', 'project_id', 'kind', 'stage', 'title', 'short_name', 'waiting_on',
    'venue', 'due_date', 'deadline', 'folder', 'repo_url', 'stage_entered_at',
    'stage_notes', 'sort_order', 'is_home', 'lineage_rank', 'grew_from_id',
    'grew_from_rank', 'deleted_at', 'seq', 'last_mutation_id', 'created_at', 'updated_at',
  ].join(', '),
  product_funding: [
    'id', 'product_id', 'funder_id', 'funder_kind', 'deleted_at', 'seq',
    'last_mutation_id', 'created_at', 'updated_at',
  ].join(', '),
};

export async function handleGetProductsSync(
  table: 'products' | 'product_funding', url: URL, request: Request, env: Env,
): Promise<Response> {
  if (!(await isPiRequest(request, env))) {
    return error('Forbidden -- PI access only', 403);
  }
  const seqAfterRaw = url.searchParams.get('seq_after');
  let seqAfter = 0;
  if (seqAfterRaw !== null) {
    seqAfter = Number.parseInt(seqAfterRaw, 10);
    if (!Number.isFinite(seqAfter) || seqAfter < 0) {
      return error('seq_after must be a non-negative integer', 400);
    }
  }
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw
    ? Math.min(Math.max(Number.parseInt(limitRaw, 10) || 2000, 1), 5000)
    : 2000;
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (url.searchParams.get('include_deleted') !== '1') conditions.push('deleted_at IS NULL');
  if (seqAfter > 0) {
    conditions.push('seq > ?');
    params.push(seqAfter);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const { results } = await env.DB.prepare(
    `SELECT ${SYNC_COLS[table]} FROM ${table} ${where} ORDER BY seq ASC LIMIT ?`,
  ).bind(...params).all<Record<string, unknown>>();
  const rows = results ?? [];
  return json({ data: rows, count: rows.length });
}

/** One product row as the team-facing reads send it (labels joined in). */
const PRODUCT_LIST_SQL = `SELECT p.id, p.project_id, p.kind, k.label AS kind_label, k.sort_order AS kind_sort,
            p.stage, s.label AS stage_label, s.ordinal AS stage_ordinal, s.is_terminal AS stage_is_terminal,
            p.title, p.short_name, p.waiting_on, p.venue, p.due_date, p.deadline,
            p.folder, p.repo_url, p.stage_entered_at, p.stage_notes, p.sort_order,
            p.is_home, p.lineage_rank, p.grew_from_id, p.seq, p.created_at, p.updated_at
       FROM products p
       JOIN product_kinds k ON k.kind = p.kind
       JOIN product_stages s ON s.kind = p.kind AND s.stage = p.stage`;

/** Every live kind with its live ladder: the UI holds no copy of kind data. */
async function kindsWithLadders(env: Env): Promise<Record<string, unknown>[]> {
  const kinds = await env.DB.prepare(
    `SELECT kind, label, plural_label, has_page, can_fund, sort_order
       FROM product_kinds WHERE deleted_at IS NULL ORDER BY sort_order, kind`,
  ).all<Record<string, unknown>>();
  const stages = await env.DB.prepare(
    `SELECT kind, stage, label, ordinal, is_terminal
       FROM product_stages WHERE deleted_at IS NULL ORDER BY kind, ordinal`,
  ).all<Record<string, unknown>>();
  const ladders = new Map<string, Record<string, unknown>[]>();
  for (const st of stages.results ?? []) {
    const list = ladders.get(st.kind as string) ?? [];
    list.push({ stage: st.stage, label: st.label, ordinal: st.ordinal, is_terminal: st.is_terminal });
    ladders.set(st.kind as string, list);
  }
  return (kinds.results ?? []).map((k) => ({ ...k, stages: ladders.get(k.kind as string) ?? [] }));
}

export async function handleGetProjectProducts(
  slugOrId: string, request: Request, env: Env,
): Promise<Response> {
  const project = await env.DB
    .prepare('SELECT id FROM projects WHERE slug = ? OR id = ? LIMIT 1')
    .bind(slugOrId, slugOrId)
    .first<{ id: string }>();
  if (!project) return error('Project not found', 404);
  const block = await assertProjectVisible(request, env, project.id);
  if (block) return block;
  const { results } = await env.DB.prepare(
    `${PRODUCT_LIST_SQL}
      WHERE p.project_id = ? AND p.deleted_at IS NULL
      ORDER BY p.is_home DESC, p.sort_order, p.id`,
  ).bind(project.id).all<Record<string, unknown>>();
  return json({ products: results ?? [], kinds: await kindsWithLadders(env) });
}

// GET /api/projects/products -- the list views' bulk read (Projects list
// stage cell, Manuscripts stage and drag). The live products of every live
// project the caller can see, grouped by project id, plus the kinds. Which
// projects come back is the caller's handle (table-scope byProject on
// products): a member gets the projects they are on, the PI theirs.
export async function handleGetAllProjectProducts(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `${PRODUCT_LIST_SQL}
       JOIN projects pr ON pr.id = p.project_id AND pr.deleted_at IS NULL
      WHERE p.deleted_at IS NULL
      ORDER BY p.project_id, p.is_home DESC, p.sort_order, p.id`,
  ).all<Record<string, unknown>>();
  const byProject: Record<string, Record<string, unknown>[]> = {};
  for (const r of results ?? []) (byProject[r.project_id as string] ??= []).push(r);
  return json({ byProject, kinds: await kindsWithLadders(env) });
}

// ── POST /api/projects/:slug/products ───────────────────────────────────────
//
// A project member changes a product's stage, adds a product, or moves the
// home marker -- on THAT project's products only (Nick, 2026-10-12: "Yes,
// members of that project"). The gate is the one POST /api/projects/:slug
// uses (handleUpdateProject): the project is read through the caller's handle
// and assertProjectVisible must pass. Every write goes through applyMutation
// with a `hub_ui:` origin, so the ledger, the triggers and the refusal codes
// are the ones /api/mutations has; /api/mutations itself stays PI-only.
//
// Body (one action):
//   { action: 'stage', product_id, stage, base_seq?, from_stage? }
//       base_seq + from_stage make it a compare-and-swap: a stale tab whose
//       product moved since gets 409 instead of overwriting the newer stage.
//   { action: 'home', product_id }        (v125 hands the marker over)
//   { action: 'add', kind, stage, name?, grew_from_id? }
//       grew_from_id must be a live product of the same project; the lineage
//       ranks are derived here, never taken from the client.
// Answers 200 { product } (the canonical row, seq included) or 4xx with the
// Worker's own reason.

const PRODUCT_WRITE_ROUTE = 'handleProjectProductWrite';

export async function handleProjectProductWrite(
  slugOrId: string, request: Request, user: AuthUser, env: Env,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return error('JSON body required', 400);
  }
  const project = await env.DB
    .prepare('SELECT id FROM projects WHERE (slug = ? OR id = ?) AND deleted_at IS NULL LIMIT 1')
    .bind(slugOrId, slugOrId)
    .first<{ id: string }>();
  if (!project) return error('Project not found', 404);
  const block = await assertProjectVisible(request, env, project.id);
  if (block) return block;

  const ownProduct = async (id: unknown) => {
    if (typeof id !== 'string' || !id) return null;
    return env.DB.prepare(
      'SELECT id, stage, lineage_rank FROM products WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    ).bind(id, project.id).first<{ id: string; stage: string; lineage_rank: number }>();
  };

  let result: Awaited<ReturnType<typeof applyMutation>>;
  let recordId: string;
  if (body.action === 'stage') {
    const product = await ownProduct(body.product_id);
    if (!product) return error('Product not found in this project', 404);
    if (typeof body.stage !== 'string' || !body.stage) return error('stage required', 400);
    recordId = product.id;
    const cas = typeof body.base_seq === 'number' && typeof body.from_stage === 'string';
    result = await applyMutation(env, {
      table: 'products', record_id: product.id, op: 'update', patch: { stage: body.stage },
      route: PRODUCT_WRITE_ROUTE, user,
      ...(cas ? {
        base_seq: body.base_seq as number,
        base_row_hash: await hashTouched({ stage: body.from_stage }, ['stage']),
      } : {}),
    });
  } else if (body.action === 'home') {
    const product = await ownProduct(body.product_id);
    if (!product) return error('Product not found in this project', 404);
    recordId = product.id;
    result = await applyMutation(env, {
      table: 'products', record_id: product.id, op: 'update', patch: { is_home: 1 },
      route: PRODUCT_WRITE_ROUTE, user,
    });
  } else if (body.action === 'add') {
    if (typeof body.kind !== 'string' || typeof body.stage !== 'string') return error('kind and stage required', 400);
    const payload: Record<string, unknown> = { project_id: project.id, kind: body.kind, stage: body.stage, is_home: 0 };
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    if (name) { payload.title = name; payload.short_name = name; }
    if (body.grew_from_id != null && body.grew_from_id !== '') {
      const parent = await ownProduct(body.grew_from_id);
      if (!parent) return error('grew_from must be a live product of this project', 400);
      payload.grew_from_id = parent.id;
      payload.grew_from_rank = parent.lineage_rank;
      payload.lineage_rank = parent.lineage_rank + 1;
    }
    recordId = generateId('product');
    result = await applyMutation(env, {
      table: 'products', record_id: recordId, op: 'insert', payload,
      route: PRODUCT_WRITE_ROUTE, user,
    });
  } else {
    return error("action must be 'stage', 'home' or 'add'", 400);
  }

  if (result.status !== 'accepted' && result.status !== 'merged_clean') {
    return json({ error: result.reason ?? result.status, status: result.status, code: result.code ?? null }, 409);
  }
  const product = await env.DB.prepare(
    `SELECT p.id, p.project_id, p.kind, p.stage, s.label AS stage_label, p.is_home, p.seq,
            p.stage_entered_at, p.lineage_rank, p.grew_from_id
       FROM products p JOIN product_stages s ON s.kind = p.kind AND s.stage = p.stage
      WHERE p.id = ?`,
  ).bind(recordId).first();
  return json({ product });
}
