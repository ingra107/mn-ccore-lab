// week-plan-start.ts -- "Start these N" on a week plan, and the daily packet cap.
//
// Nick, 2026-10-29: "... and then you could get started on those things".
// Decision (fixed v1 contract): PB Context/Decisions/2026-10-30-planning-conversation.md.
//
// Only Start creates work. The answer to a source='week_plan' question carries
// typed picks (shared/weekPlan.ts); the write that stores it also inserts one
// ai_requests row per pick with start:true, in the SAME D1 batch, each INSERT
// guarded on the row write having landed (mutations.ts commitRowWrite
// `dependents`). So an answer never lands without its requests, and a request
// never exists for an answer that did not land. The rows go through the one
// ai_requests insert (routes/ai-requests.ts aiRequestInsert).
//
// The cap: at most PACKET_DAILY_CAP packets a Chicago day, counted on the Hub
// across the 05:15 PB job and Start (dailyPacketCount). A Start that would
// pass it is refused whole (409 daily_cap); nothing is stored.
//
// What the cap check does NOT stop: two writers counting at the same instant
// (a Start racing the 05:15 job's own count) can both pass and land 4. The
// count runs before the batch, and D1 has no way to make the batch's INSERTs
// conditional on a count without also making the answer conditional. One
// user, one job at 05:15: accepted, not prevented.

import type { Env, AuthUser } from '../helpers';
import { generateId } from '../helpers';
import { SITE_ADMIN_SLUG } from './viewer-db';
import { packetOwnerEmailSql } from './packet-owner';
import { ctDateString, ctToday } from './ct-date';
import { normalizeQuestionJsonFields } from './task-question';
import { aiRequestInsert, type AIRequestInsertRow } from '../routes/ai-requests';
import {
  PACKET_DAILY_CAP, PACKET_PREPARE_SOURCE_TYPE, WEEK_PLAN_SOURCE,
  parseWeekPlanSpec, pickDirection, isCivilDate, civilPlusDays, weekPlanNewlyStarted,
  type PacketPreparePayload,
} from '../../shared/weekPlan';

/** Where a packet's preparation came from: the 05:15 job, or a started pick
 *  (`request:<ai_request_id>`). Both count toward the cap. */
const PRODUCER_PREFIXES = ['prepare:', 'request:'] as const;

/**
 * [start, end) of a Chicago civil day as ISO UTC instants, DST-aware: local
 * midnight is 05:00Z under CDT and 06:00Z under CST, whichever is the instant
 * at which the Chicago date becomes `date`.
 */
export function ctDayBounds(date: string): { start: string; end: string } {
  const midnight = (d: string): number => {
    const base = Date.parse(`${d}T00:00:00Z`);
    for (const h of [5, 6]) {
      const t = base + h * 3600_000;
      if (ctDateString(new Date(t)) === d && ctDateString(new Date(t - 60_000)) !== d) return t;
    }
    return base + 6 * 3600_000;
  };
  return {
    start: new Date(midnight(date)).toISOString(),
    end: new Date(midnight(civilPlusDays(date, 1))).toISOString(),
  };
}

/** The day's count against the cap, as one bind-free SQL expression, so the
 *  same text can run on its own (dailyPacketCount) and sit inside the answer
 *  write's WHERE (weekPlanStart's capWhere), where it is evaluated in the
 *  write's own transaction. Counted:
 *   - packets created that Chicago day by a `prepare:` or `request:` producer;
 *   - packet_prepare requests still open (status 'pending', claimed or not),
 *     made by the packet owner (packetOwnerEmailSql), whose packet has not
 *     been published yet. A request whose `request:<id>` packet exists is
 *     counted once, as the packet.
 *  Every literal is a code constant or a validated ISO instant. */
export function dailyCountSql(date: string): string {
  const { start, end } = ctDayBounds(date);
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  if (!iso.test(start) || !iso.test(end)) throw new Error('dailyCountSql: bad day bounds');
  const prefixes = PRODUCER_PREFIXES.map((p) => `'${p}'`).join(', ');
  return `((SELECT COUNT(*) FROM task_packets WHERE substr(producer_key, 1, 8) IN (${prefixes})
             AND created_at >= '${start}' AND created_at < '${end}')
          + (SELECT COUNT(*) FROM ai_requests r WHERE r.source_type = '${PACKET_PREPARE_SOURCE_TYPE}' AND r.status = 'pending'
             AND ${packetOwnerEmailSql('r.requested_by')}
             AND NOT EXISTS (SELECT 1 FROM task_packets p WHERE p.producer_key = 'request:' || r.id)))`;
}

/** The day's count (see dailyCountSql). Reads through the caller's handle:
 *  task_packets is Nick-only (table-scope). */
export async function dailyPacketCount(db: D1Database, date: string): Promise<number> {
  const row = await db.prepare(`SELECT ${dailyCountSql(date)} AS n`).first<{ n: number }>();
  return row?.n ?? 0;
}

/** GET /api/packets/daily-count?date=YYYY-MM-DD (Nick or the PB key). The
 *  date defaults to today in Chicago. */
export async function handleDailyPacketCount(url: URL, db: D1Database, owner: boolean): Promise<Response> {
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
  if (!owner) return reply({ error: 'Nick only', code: 'forbidden' }, 403);
  const raw = url.searchParams.get('date');
  const date = raw === null || raw === '' ? ctToday() : raw;
  if (!isCivilDate(date)) return reply({ error: 'date must be YYYY-MM-DD', code: 'bad_request' }, 400);
  return reply({ date, used: await dailyPacketCount(db, date), cap: PACKET_DAILY_CAP });
}

type Guard = { sql: string; vals: unknown[] };

/** What a week plan's answer write does beyond the row: nothing, a refusal,
 *  or the request INSERTs that ride its batch plus the cap term its row write
 *  carries. */
export type WeekPlanStart =
  | null
  | { refusal: { used: number; cap: number; reason: string } }
  | { forbidden: string }
  | { started: number; capWhere: string; dependents: (landed: Guard) => D1PreparedStatement[] };

/**
 * Decide what a week plan answer starts. Runs AFTER applyPatch has judged the
 * answer (question rules, frozen, expired), so a bad answer reports its own
 * code and this sees only answers that will be stored.
 *
 * Starts: on the first answer, every pick with start:true; on a start flip
 * (shared/weekPlan.ts weekPlanFlipError), the flipped picks. Nothing else
 * starts anything; a stored answer cannot otherwise change.
 *
 * Only the packet owner may start work (the requests read as private and use
 * Nick's cap); anyone else's starting answer is refused (`forbidden`).
 *
 * The cap is enforced twice, and the second is the one that holds:
 *   1. a read here, which gives the 409 its numbers (`refusal`);
 *   2. `capWhere`, appended to the answer's own row UPDATE: the row lands
 *      only if (the day's count) + started <= cap, evaluated inside the
 *      write's batch. The request INSERTs are gated on that row landing, and
 *      the batch is one transaction, so a second Start racing this one (on
 *      another offer, or the 05:15 job's requests) sees these rows in its own
 *      count and its row write does not land; its retry then refuses at (1).
 *
 * Each request: source_type 'packet_prepare', source_id the picked task,
 * project_slug that task's project, prompt a readable line, context the JSON
 * PacketPreparePayload, requested_by the answering user's email.
 * expected_packet names the task's live, unused packet (id + current version)
 * when it has one, so the PB runner may replace it with the picked direction
 * after re-checking that version at publish; a used packet is not named, so
 * the runner skips it (a direction never bypasses a used packet).
 */
export async function weekPlanStart(
  env: Env,
  mut: { table: string; record_id: string; patch?: Record<string, unknown> },
  current: Record<string, unknown>,
  user: AuthUser,
): Promise<WeekPlanStart> {
  if (mut.table !== 'tasks' || !mut.patch) return null;
  if (current.source !== WEEK_PLAN_SOURCE || (current.kind ?? 'task') !== 'question') return null;
  const patch = normalizeQuestionJsonFields(mut.patch);
  if (!Object.prototype.hasOwnProperty.call(patch, 'question_answer_json')) return null;
  const answer = patch.question_answer_json;
  if (answer === null || answer === undefined || answer === current.question_answer_json) return null;
  const spec = parseWeekPlanSpec(current.question_spec_json);
  if (!spec) return null;
  const started = weekPlanNewlyStarted(current.question_answer_json ?? null, answer, spec);
  if (!started || started.length === 0) return null;

  const owner = await env.DB.prepare('SELECT lower(email) AS e FROM team_members WHERE slug = ?')
    .bind(SITE_ADMIN_SLUG).first<{ e: string | null }>();
  if (!owner?.e || (user.email ?? '').trim().toLowerCase() !== owner.e) {
    return { forbidden: 'week_plan_owner_only: only Nick can start work from a week plan' };
  }

  const today = ctToday();
  const used = await dailyPacketCount(env.DB, today);
  if (used + started.length > PACKET_DAILY_CAP) {
    return {
      refusal: {
        used, cap: PACKET_DAILY_CAP,
        reason: `daily_cap: starting ${started.length} would pass today's cap of ${PACKET_DAILY_CAP} (${used} used)`,
      },
    };
  }

  const ids = started.map((p) => p.task_id);
  const marks = ids.map(() => '?').join(', ');
  const [tasksRes, packetsRes] = await env.DB.batch([
    env.DB.prepare(`SELECT id, project_id, title FROM tasks WHERE id IN (${marks})`).bind(...ids),
    env.DB.prepare(
      `SELECT tp.id, tp.task_id, tp.current_version FROM task_packets tp
        WHERE tp.task_id IN (${marks}) AND tp.closed_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM task_packet_actions a WHERE a.packet_id = tp.id AND a.action = 'use')`,
    ).bind(...ids),
  ]);
  const taskOf = new Map((tasksRes.results as { id: string; project_id: string | null; title: string }[]).map((t) => [t.id, t]));
  const packetOf = new Map((packetsRes.results as { id: string; task_id: string; current_version: number }[]).map((p) => [p.task_id, p]));

  const rows: AIRequestInsertRow[] = started.map((pick) => {
    const direction = pickDirection(pick, spec);
    const live = packetOf.get(pick.task_id);
    const candidate = spec.candidates.find((c) => c.task_id === pick.task_id);
    const payload: PacketPreparePayload = {
      v: 1,
      task_id: pick.task_id,
      direction,
      option_key: pick.option_key,
      plan_question_id: mut.record_id,
      expected_packet: live ? { id: live.id, version: live.current_version } : null,
    };
    const title = taskOf.get(pick.task_id)?.title ?? candidate?.title ?? pick.task_id;
    return {
      id: generateId(),
      source_type: PACKET_PREPARE_SOURCE_TYPE,
      source_id: pick.task_id,
      project_slug: taskOf.get(pick.task_id)?.project_id ?? null,
      prompt: `Prepare the first step for "${title}": ${direction}`.slice(0, 2000),
      context: JSON.stringify(payload),
      requested_by: user.email,
    };
  });
  return {
    started: rows.length,
    capWhere: ` AND ${dailyCountSql(today)} + ${rows.length} <= ${PACKET_DAILY_CAP}`,
    dependents: (landed) => rows.map((r) => aiRequestInsert(env.DB, r, landed)),
  };
}
