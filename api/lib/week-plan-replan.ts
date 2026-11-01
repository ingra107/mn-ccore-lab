// week-plan-replan.ts -- the Re-plan button: one owner-only request to PB.
//
// Nick, 2026-10-30: "Sunday evening, plus a Re-plan button (Recommended)".
// 2026-11-01: a mid-week Re-plan covers "Today forward" (past days and
// finished tasks stay; today..Sunday is re-planned from what is still open),
// and a Sunday press plans NEXT week. Plan: PB
// Scratch/plans/2026-11-01-replan-RECONCILED.md.
//
// A press is a LANE request (shared/weekPlan.ts LANE_SOURCE_TYPES): one
// ai_requests row, source_type 'week_replan', payload {v:1, pressed_on} (the
// Chicago date of the press) as JSON in `context`. The PB listener claims it
// on the ordinary claim/lease machinery and runs week_plan.run inside the
// lease (scripts/planning/replan_adapter.py); the new offer lands in Needs
// you, and the row's answer is a status line the button shows.
//
// Press twice: the insert is ONE statement, INSERT ... SELECT ... WHERE NOT
// EXISTS (a pending week_replan), and D1 runs one statement at a time, so two
// presses make one row; the second gets 409 {code:'replan_pending', id}.
// Level 2 (one chokepoint: no other route makes a week_replan row, and the
// generic POST /api/ai-requests refuses every lane source). A pending row no
// runner has claimed within REPLAN_UNCLAIMED_S does not block: the next press
// fails it in the same batch, so an old or absent listener cannot trap the
// button in Queued. Level 1 would be a
// partial unique index on ai_requests(source_type) WHERE status='pending' AND
// source_type='week_replan': one prod DDL statement, priced in the plan, not
// built (no migration in this change).

import type { Env, AuthUser } from '../helpers';
import { generateId, json } from '../helpers';
import { ctToday } from './ct-date';
import { aiRequestInsert } from '../routes/ai-requests';
import { REPLAN_UNCLAIMED_S, WEEK_REPLAN_SOURCE_TYPE, type ReplanState, type WeekReplanPayload } from '../../shared/weekPlan';

const NOW_S = "CAST(strftime('%s', 'now') AS INTEGER)";
/** The answer a never-claimed press gets when the next press replaces it. */
export const REPLAN_NOT_PICKED_UP = 'No PB laptop picked this up, so it was replaced by a new press.';
const PENDING_SQL = `source_type = '${WEEK_REPLAN_SOURCE_TYPE}' AND status = 'pending'`;

async function latest(db: D1Database): Promise<ReplanState | null> {
  const row = await db.prepare(
    `SELECT id, status, response,
            (claim_token IS NOT NULL AND claim_expires_at > ${NOW_S}) AS claimed,
            ${NOW_S} - CAST(strftime('%s', created_at) AS INTEGER) AS age_s
       FROM ai_requests WHERE source_type = ?
      ORDER BY created_at DESC, id DESC LIMIT 1`,
  ).bind(WEEK_REPLAN_SOURCE_TYPE).first<{ id: string; status: string; response: string | null; claimed: number; age_s: number }>();
  if (!row) return null;
  const status = row.status === 'completed' || row.status === 'failed' ? row.status : 'pending';
  return { id: row.id, status, claimed: !!row.claimed, response: row.response, age_s: Number(row.age_s) || 0 };
}

/** GET /api/week-plan/replan -- the latest re-plan request, or null. Nick only. */
export async function handleGetReplan(db: D1Database, owner: boolean): Promise<Response> {
  if (!owner) return json({ error: 'Nick only', code: 'forbidden' }, 403);
  return json({ data: await latest(db) });
}

/** POST /api/week-plan/replan -- press Re-plan. Nick only. 201 with the new
 *  request, or 409 {code:'replan_pending', id} when one is already pending. */
export async function handlePostReplan(env: Env, user: AuthUser, owner: boolean): Promise<Response> {
  if (!owner) return json({ error: 'Nick only', code: 'forbidden' }, 403);
  const pressedOn = ctToday();
  const payload: WeekReplanPayload = { v: 1, pressed_on: pressedOn };
  const id = generateId();
  // One batch (one D1 transaction): first fail a press no runner ever
  // claimed within REPLAN_UNCLAIMED_S, so it cannot block Re-plan forever
  // (claim_attempts = 0 and no token: nothing is working on it, and a claim
  // racing this statement either wins first, so the row no longer matches,
  // or finds it failed and is refused); then the guarded insert.
  const [, res] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE ai_requests SET status = 'failed', response = ?, responded_at = datetime('now')
        WHERE ${PENDING_SQL} AND claim_token IS NULL AND COALESCE(claim_attempts, 0) = 0
          AND CAST(strftime('%s', created_at) AS INTEGER) <= ${NOW_S} - ?`,
    ).bind(REPLAN_NOT_PICKED_UP, REPLAN_UNCLAIMED_S),
    aiRequestInsert(env.DB, {
      id,
      source_type: WEEK_REPLAN_SOURCE_TYPE,
      source_id: `week:${pressedOn}`,
      project_slug: null,
      prompt: `Re-plan the week (pressed ${pressedOn})`,
      context: JSON.stringify(payload),
      requested_by: user.email,
    }, { sql: `NOT EXISTS (SELECT 1 FROM ai_requests WHERE ${PENDING_SQL})`, vals: [] }),
  ]);
  if (res.meta.changes !== 1) {
    const open = await env.DB.prepare(`SELECT id FROM ai_requests WHERE ${PENDING_SQL} ORDER BY created_at ASC, id ASC LIMIT 1`)
      .first<{ id: string }>();
    return json({ error: 'A re-plan is already queued', code: 'replan_pending', id: open?.id ?? null }, 409);
  }
  return json({ data: await latest(env.DB) }, 201);
}
