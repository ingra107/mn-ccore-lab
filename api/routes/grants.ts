// The Grants page reads products (Nick 2026-10-12: "we can keep grants
// separate so use the current grants page to build out and make sure it reads
// the right stuff"). Rows are the grant_application, award and honor products
// of the projects the caller can see, joined to their project (name, PI);
// their dates and money are schema-v128's award terms; their post-award
// milestones are tasks with kind='milestone' and that product_id.
//
// GET /api/grants            the rows + the grant kinds' ladders
// GET /api/grants/timeline   the same rows, each with its milestones (Gantt)
//
// Both are public GETs: the /pulse kiosk and the public home read them through
// the anonShape (id, venue, bucket; no dates, no names). Which rows come back is the
// caller's handle (table-scope byProject on products): a member gets the
// projects they are on, an anonymous reader the non-PB projects.
//
// The legacy `grants` table (a 2026-03-24 display seed for the dashboard card)
// is no longer read; it retires in phase 2 with Nick's go.
// Decision: PB Context/Decisions/2026-10-12-product-award-terms.md.

import type { Env } from '../types';
import { json } from '../helpers';
import { PRODUCT_LIST_SQL, kindsWithLadders, GRANT_KINDS } from './products';

export { GRANT_KINDS };
const KIND_IN = `(${GRANT_KINDS.map((k) => `'${k}'`).join(', ')})`;

/**
 * The page's three buckets, from data alone: a terminal stage has ended
 * (not funded, closed, not received); a live award is active; anything else
 * (an application in preparation or under review, an honor in progress) is
 * proposed.
 */
export const GRANT_BUCKET_SQL = `CASE
    WHEN s.is_terminal = 1 THEN 'ended'
    WHEN p.kind = 'award' THEN 'active'
    ELSE 'proposed'
  END`;

const GRANT_ROWS_SQL = `${PRODUCT_LIST_SQL.replace(
  'FROM products p',
  `, ${GRANT_BUCKET_SQL} AS bucket,
            pr.slug AS project_slug, pr.title AS project_title, pr.short_name AS project_short_name, pr.pi AS pi
       FROM products p`,
)}
       JOIN projects pr ON pr.id = p.project_id AND pr.deleted_at IS NULL
      WHERE p.deleted_at IS NULL AND p.kind IN ${KIND_IN}
      ORDER BY CASE ${GRANT_BUCKET_SQL} WHEN 'active' THEN 0 WHEN 'proposed' THEN 1 ELSE 2 END,
               COALESCE(p.period_start, p.deadline, p.due_date, '9999') ASC, pr.title, p.lineage_rank`;

async function grantRows(env: Env): Promise<Record<string, unknown>[]> {
  const { results } = await env.DB.prepare(GRANT_ROWS_SQL).all<Record<string, unknown>>();
  return results ?? [];
}

async function grantKinds(env: Env): Promise<Record<string, unknown>[]> {
  const all = await kindsWithLadders(env);
  return all.filter((k) => (GRANT_KINDS as readonly string[]).includes(k.kind as string));
}

export async function handleGetGrants(env: Env): Promise<Response> {
  const data = await grantRows(env);
  return json({ data, count: data.length, kinds: await grantKinds(env) });
}

export async function handleGrantsTimeline(env: Env): Promise<Response> {
  const rows = await grantRows(env);
  // Post-award milestones: milestone tasks on these products. The caller's
  // handle scopes tasks too, so a reader sees only milestones they may see.
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.title, t.due_date, t.deadline, t.status, t.completed, t.product_id
       FROM tasks t
       JOIN products p ON p.id = t.product_id AND p.deleted_at IS NULL AND p.kind IN ${KIND_IN}
      WHERE t.kind = 'milestone' AND t.deleted_at IS NULL AND t.status <> 'deleted'
      ORDER BY COALESCE(t.due_date, t.deadline) ASC`,
  ).all<Record<string, unknown>>();
  const byProduct: Record<string, Record<string, unknown>[]> = {};
  for (const m of results ?? []) (byProduct[m.product_id as string] ??= []).push(m);
  const data = rows.map((r) => ({ ...r, milestones: byProduct[r.id as string] ?? [] }));
  return json({ data, count: data.length, kinds: await grantKinds(env) });
}

/** Counts the PI dashboard and the stats line read: from the same rows. */
export async function grantCounts(env: Env): Promise<{ proposed: number; active: number; active_funding: number; total: number }> {
  const row = await env.DB.prepare(
    `SELECT
        SUM(CASE WHEN ${GRANT_BUCKET_SQL} = 'proposed' THEN 1 ELSE 0 END) AS proposed,
        SUM(CASE WHEN ${GRANT_BUCKET_SQL} = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN ${GRANT_BUCKET_SQL} = 'active' THEN COALESCE(p.amount_usd, 0) ELSE 0 END) AS active_funding,
        COUNT(*) AS total
       FROM products p
       JOIN product_stages s ON s.kind = p.kind AND s.stage = p.stage
       JOIN projects pr ON pr.id = p.project_id AND pr.deleted_at IS NULL
      WHERE p.deleted_at IS NULL AND p.kind IN ${KIND_IN}`,
  ).first<{ proposed: number | null; active: number | null; active_funding: number | null; total: number | null }>();
  return {
    proposed: row?.proposed ?? 0,
    active: row?.active ?? 0,
    active_funding: row?.active_funding ?? 0,
    total: row?.total ?? 0,
  };
}
