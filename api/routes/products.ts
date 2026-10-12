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
import { json, error, isPiRequest, assertProjectVisible } from '../helpers';

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
    `SELECT p.id, p.project_id, p.kind, k.label AS kind_label, p.stage, s.label AS stage_label,
            s.ordinal AS stage_ordinal, s.is_terminal AS stage_is_terminal,
            p.title, p.short_name, p.waiting_on, p.venue, p.due_date, p.deadline,
            p.folder, p.repo_url, p.stage_entered_at, p.stage_notes, p.sort_order,
            p.is_home, p.lineage_rank, p.grew_from_id, p.created_at, p.updated_at
       FROM products p
       JOIN product_kinds k ON k.kind = p.kind
       JOIN product_stages s ON s.kind = p.kind AND s.stage = p.stage
      WHERE p.project_id = ? AND p.deleted_at IS NULL
      ORDER BY p.is_home DESC, p.sort_order, p.id`,
  ).bind(project.id).all<Record<string, unknown>>();
  const kinds = await env.DB.prepare(
    `SELECT kind, label, plural_label, has_page, can_fund, sort_order
       FROM product_kinds WHERE deleted_at IS NULL ORDER BY sort_order, kind`,
  ).all<Record<string, unknown>>();
  const stages = await env.DB.prepare(
    `SELECT kind, stage, label, ordinal, is_terminal
       FROM product_stages WHERE deleted_at IS NULL ORDER BY kind, ordinal`,
  ).all<Record<string, unknown>>();
  const ladders = new Map<string, Record<string, unknown>[]>();
  for (const s of stages.results ?? []) {
    const list = ladders.get(s.kind as string) ?? [];
    list.push({ stage: s.stage, label: s.label, ordinal: s.ordinal, is_terminal: s.is_terminal });
    ladders.set(s.kind as string, list);
  }
  return json({
    products: results ?? [],
    kinds: (kinds.results ?? []).map((k) => ({ ...k, stages: ladders.get(k.kind as string) ?? [] })),
  });
}
