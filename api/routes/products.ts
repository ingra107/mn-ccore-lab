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
//   (the project is read through the caller's handle: membership), with
//   each stage's label and the
//   kind's labels, ordered home first then sort_order, plus `kinds`: every
//   live kind with its ladder, so the UI draws a ladder and offers "add a
//   product" without a copy of the kind data. What the product UI (plan
//   step 8) reads.
//
// Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.

import type { Env } from '../types';
import { json, error, isPiRequest, generateId } from '../helpers';
import type { AuthUser } from '../helpers';
import { applyMutation, hashTouched } from './mutations';

/** Columns PB's cache holds (PB scripts/db/migrations/144_products.sql + 146). */
const SYNC_COLS: Record<'products' | 'product_funding', string> = {
  products: [
    'id', 'project_id', 'kind', 'stage', 'title', 'short_name', 'waiting_on',
    'venue', 'due_date', 'deadline', 'folder', 'repo_url', 'stage_entered_at',
    'stage_notes', 'sort_order', 'is_home', 'lineage_rank', 'grew_from_id',
    'grew_from_rank', 'deleted_at', 'seq', 'last_mutation_id', 'created_at', 'updated_at',
    'period_start', 'period_end', 'amount_usd',
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
export const PRODUCT_LIST_SQL = `SELECT p.id, p.project_id, p.kind, k.label AS kind_label, k.sort_order AS kind_sort,
            p.stage, s.label AS stage_label, s.ordinal AS stage_ordinal, s.is_terminal AS stage_is_terminal,
            p.title, p.short_name, p.waiting_on, p.venue, p.due_date, p.deadline,
            p.folder, p.repo_url, p.stage_entered_at, p.stage_notes, p.sort_order,
            p.is_home, p.lineage_rank, p.grew_from_id, p.seq, p.created_at, p.updated_at,
            p.period_start, p.period_end, p.amount_usd
       FROM products p
       JOIN product_kinds k ON k.kind = p.kind
       JOIN product_stages s ON s.kind = p.kind AND s.stage = p.stage`;

/** Every live kind with its live ladder: the UI holds no copy of kind data. */
export async function kindsWithLadders(env: Env): Promise<Record<string, unknown>[]> {
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
  slugOrId: string, env: Env,
): Promise<Response> {
  const project = await env.DB
    .prepare('SELECT id FROM projects WHERE slug = ? OR id = ? LIMIT 1')
    .bind(slugOrId, slugOrId)
    .first<{ id: string }>();
  // env.DB is the caller's handle: a project they are not on reads as absent.
  if (!project) return error('Project not found', 404);
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
// uses (handleUpdateProject): the project is read through the caller's handle,
// so a project the caller is not on reads as absent (404). Every write goes through applyMutation
// with a `hub_ui:` origin, so the ledger, the triggers and the refusal codes
// are the ones /api/mutations has; /api/mutations itself stays PI-only.
//
// Body (one action):
//   { action: 'stage', product_id, stage, base_seq?, from_stage? }
//       base_seq + from_stage make it a compare-and-swap: a stale tab whose
//       product moved since gets 409 instead of overwriting the newer stage.
//   { action: 'home', product_id }        (v125 hands the marker over)
//   { action: 'terms', product_id, fields: {venue?, due_date?, deadline?,
//       period_start?, period_end?, amount_usd?}, base_seq?, from? }
//       The Grants page's inline edits and Gantt drag; base_seq + from (the
//       values the screen showed) make it a compare-and-swap. schema-v128
//       CHECKs each term against the kind.
//   { action: 'milestone', product_id, title, due_date?, deadline? }
//       A post-award milestone: a kind='milestone' task on the product.
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

  const ownProduct = async (id: unknown) => {
    if (typeof id !== 'string' || !id) return null;
    return env.DB.prepare(
      `SELECT id, kind, stage, lineage_rank, period_start, period_end, amount_usd
         FROM products WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
    ).bind(id, project.id).first<{
      id: string; kind: string; stage: string; lineage_rank: number
      period_start: string | null; period_end: string | null; amount_usd: number | null
    }>();
  };
  // A kind/stage pair off the ladder is the caller's input: answer 400 here,
  // in words, before the write's FK refusal turns it into a 409.
  const onLadder = async (kind: string, stage: string) => !!(await env.DB.prepare(
    'SELECT 1 FROM product_stages WHERE kind = ? AND stage = ? AND deleted_at IS NULL',
  ).bind(kind, stage).first());

  let result: Awaited<ReturnType<typeof applyMutation>>;
  let recordId: string;
  if (body.action === 'stage') {
    const product = await ownProduct(body.product_id);
    if (!product) return error('Product not found in this project', 404);
    if (typeof body.stage !== 'string' || !body.stage) return error('stage required', 400);
    if (!(await onLadder(product.kind, body.stage))) return error("That stage is not on this product's ladder.", 400);
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
  } else if (body.action === 'terms') {
    // The Grants page's inline edits and Gantt drag: venue, the two-date pair
    // and the award terms. schema-v128 CHECKs each term against the kind, so
    // a wrong-kind value is refused by the arbiter, not by a copy of the rule.
    const product = await ownProduct(body.product_id);
    if (!product) return error('Product not found in this project', 404);
    const fields = (body.fields ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!TERM_FIELDS.has(k)) return error(`${k} cannot be set here`, 400);
      if (v === '' || v === null || v === undefined) { patch[k] = null; continue; }
      if (k === 'amount_usd') {
        const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
        if (!Number.isInteger(n) || n < 0) return error('The amount is whole dollars, 0 or more.', 400);
        patch[k] = n;
      } else if (k === 'venue') {
        patch[k] = String(v).trim().slice(0, 120) || null;
      } else {
        if (typeof v !== 'string' || !ISO_DATE.test(v)) return error('Dates are YYYY-MM-DD.', 400);
        if (!isCalendarDate(v)) return error(`${v} is not a date on the calendar.`, 400);
        patch[k] = v;
      }
    }
    if (Object.keys(patch).length === 0) return error('fields required', 400);
    const termError = termsRefusal(product.kind, { ...product, ...patch });
    if (termError) return error(termError, 400);
    recordId = product.id;
    // Compare-and-swap when the screen says what it saw: a stale tab (or a
    // drag over a bar someone just moved) is refused, never overwrites.
    const from = body.from as Record<string, unknown> | undefined;
    const cas = typeof body.base_seq === 'number' && from && typeof from === 'object';
    const keys = Object.keys(patch);
    result = await applyMutation(env, {
      table: 'products', record_id: product.id, op: 'update', patch,
      route: PRODUCT_WRITE_ROUTE, user,
      ...(cas ? {
        base_seq: body.base_seq as number,
        base_row_hash: await hashTouched(Object.fromEntries(keys.map((k) => [k, from![k] ?? null])), keys),
      } : {}),
    });
  } else if (body.action === 'milestone') {
    // A post-award milestone (progress report, NCE, closeout) is a task with
    // kind='milestone' on this product (schema-v109 + tasks.product_id, v124).
    // The two-date rule holds: due_date is the internal date, deadline the
    // hard one. v124's trigger refuses a product from another project.
    const product = await ownProduct(body.product_id);
    if (!product) return error('Product not found in this project', 404);
    if (!(GRANT_KINDS as readonly string[]).includes(product.kind)) {
      return error('A post-award milestone goes on a grant application, award or honor.', 400);
    }
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    if (!title) return error('A milestone needs a title.', 400);
    const due = body.due_date ?? null;
    const hard = body.deadline ?? null;
    for (const d of [due, hard]) {
      if (d !== null && (typeof d !== 'string' || !ISO_DATE.test(d))) return error('Dates are YYYY-MM-DD.', 400);
      if (d !== null && !isCalendarDate(d)) return error(`${d} is not a date on the calendar.`, 400);
    }
    if (!due && !hard) return error('A milestone needs a date.', 400);
    recordId = generateId('task');
    result = await applyMutation(env, {
      table: 'tasks', record_id: recordId, op: 'insert',
      payload: {
        title, description: title, kind: 'milestone', status: 'todo', priority: 'medium',
        completed: 0, completed_at: null, completed_by: null,
        project_id: project.id, product_id: product.id,
        due_date: due, deadline: hard,
        assignee: user.slug, assigned_by: user.email, source: 'manual',
      },
      route: PRODUCT_WRITE_ROUTE, user,
    });
    if (result.status === 'accepted' || result.status === 'merged_clean') {
      const row = result.canonical_payload ?? {};
      return json({ milestone: {
        id: row.id ?? recordId, title: row.title, due_date: row.due_date ?? null, deadline: row.deadline ?? null,
        status: row.status, completed: row.completed, product_id: row.product_id, seq: row.seq,
      } });
    }
  } else if (body.action === 'add') {
    if (typeof body.kind !== 'string' || typeof body.stage !== 'string') return error('kind and stage required', 400);
    if (!(await onLadder(body.kind, body.stage))) return error('That kind and stage do not go together.', 400);
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
    return error("action must be 'stage', 'home', 'terms', 'milestone' or 'add'", 400);
  }

  if (result.status !== 'accepted' && result.status !== 'merged_clean') {
    const refusal = plainRefusal(result, body.action as string);
    return json({ error: refusal.message, code: result.code ?? result.status }, refusal.status);
  }
  // The row the write produced is on the result (commitRowWrite / applyInsert
  // read it inside the same request); only the stage's rung is looked up.
  const row = result.canonical_payload ?? {};
  const label = await env.DB.prepare('SELECT label, is_terminal FROM product_stages WHERE kind = ? AND stage = ?')
    .bind(row.kind ?? null, row.stage ?? null).first<{ label: string; is_terminal: number }>();
  return json({
    product: {
      id: row.id ?? recordId, project_id: row.project_id, kind: row.kind, stage: row.stage,
      stage_label: label?.label ?? row.stage, stage_is_terminal: label?.is_terminal ?? 0,
      is_home: row.is_home, seq: row.seq,
      stage_entered_at: row.stage_entered_at, lineage_rank: row.lineage_rank, grew_from_id: row.grew_from_id,
      venue: row.venue ?? null, due_date: row.due_date ?? null, deadline: row.deadline ?? null,
      period_start: row.period_start ?? null, period_end: row.period_end ?? null, amount_usd: row.amount_usd ?? null,
    },
  });
}

/** What the Grants page may set through the member route. */
const TERM_FIELDS = new Set(['venue', 'due_date', 'deadline', 'period_start', 'period_end', 'amount_usd']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day in YYYY-MM-DD: 2026-02-30 and 2026-13-01 are not.
 *  schema-v128's CHECK refuses them too (date(x) = x); this says so in words. */
export function isCalendarDate(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** The product kinds the Grants page lists, and the only ones a post-award
 *  milestone may sit on: a milestone of a manuscript or an abstract is a
 *  plain task with a date, not this page's milestone. */
export const GRANT_KINDS = ['grant_application', 'award', 'honor'] as const;

/**
 * The words for a term the schema would refuse (schema-v128's CHECKs). The
 * CHECK is the rule; this only says it before the write, in a sentence,
 * so the toast is not a constraint name. A rule here that the CHECK lacks
 * would be a second, stricter copy -- keep the two the same.
 */
export function termsRefusal(
  kind: string,
  row: { period_start?: unknown; period_end?: unknown; amount_usd?: unknown },
): string | null {
  const has = (v: unknown) => v !== null && v !== undefined
  if (has(row.period_start) && kind !== 'award' && kind !== 'grant_application') {
    return 'Only a grant application or an award has a start date.'
  }
  if (has(row.period_end) && kind !== 'award') return 'Only an award has an end date; an application has a proposed start.'
  if (has(row.amount_usd) && kind !== 'award') return 'Only an award carries an amount.'
  if (has(row.period_end) && !has(row.period_start)) return 'Set the start date first.'
  if (has(row.period_end) && String(row.period_end) <= String(row.period_start)) return 'The end date comes after the start.'
  return null
}

/**
 * A refused product write in words a member can act on. The Worker's own
 * reason (seq numbers, hashes, constraint text) stays in the server log via
 * the ledger; it is not a sentence for the toast. A value the schema refuses
 * is the caller's input (400); a row that moved, or contention, is a 409.
 */
export function plainRefusal(
  result: { status: string; code?: string; reason?: string },
  action: string,
): { status: 400 | 409; message: string } {
  const reason = result.reason ?? '';
  if (result.status === 'conflict' || result.code === 'cas_contention') {
    return { status: 409, message: 'Someone changed this a moment ago; the page has refreshed. Try again.' };
  }
  if (/product_home_live/.test(reason)) {
    return { status: 409, message: 'Mark another product home first.' };
  }
  if (/product_last_live/.test(reason)) {
    return { status: 409, message: 'A project keeps at least one product.' };
  }
  if (['constraint', 'value_invalid', 'enum_domain', 'unknown_field', 'protected_null'].includes(result.code ?? '')) {
    if (action === 'add') return { status: 400, message: 'That kind and stage do not go together.' };
    if (action === 'stage') return { status: 400, message: "That stage is not on this product's ladder." };
    return { status: 400, message: 'That change is not allowed for this product.' };
  }
  return { status: 409, message: 'Could not save that change; try again.' };
}
