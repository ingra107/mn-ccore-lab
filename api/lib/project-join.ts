// project-join.ts -- the project directory and requests to join (schema-v139).
//
// Nick, 2026-10-13: members "can request to get added to projects ... kind of
// like slack where it's a channel so they have some visibility to those
// channels ... but Nate and I need to approve that". Before joining, a member
// sees a project's name, one-line description and PI, and nothing else.
//
// WHAT A NON-MEMBER CAN READ. Only the `project_directory` view, through
// DirectoryRow: five columns, fixed by the view's own SELECT list. A view body
// reads the real tables, not the caller's filtered copies (viewer-db.ts), which
// is how a non-member sees the row at all; and because the view has no
// description, task or file column, no query against it can return one. This
// module is the only code that names the view (project-join.contract.test.ts
// sweeps for that), and no statement here names the view together with a scoped
// table, so the view is never read under a viewer's CTE prefix.
//
// WHO DECIDES. JOIN_APPROVER_SLUGS (shared/joinApprovers.ts), mirrored by a CHECK in
// the migration. The decision is a plain UPDATE of the request; the database
// triggers add the member, notify the requester and close Nick's Telegram
// question in the same transaction. Nate is not a member of most projects, so
// nothing on the decision path reads a project through his handle.
//
// NICK'S TELEGRAM. A request by anyone but Nick mints one kind='question' task
// assigned to Nick, with no project and nobody else named, so the requester can
// never read or answer it (taskRule). PB's listener sends a Telegram card for
// every question row; a tap writes the answer and the database decides the
// request. Minting needs the raw handle (the requester cannot read the row it
// writes), so it is a capability made once per request in api/index.ts, as
// slugClaimCheck is: it can only ever mint this one shape, and the tasks
// trigger in schema-v139 refuses any other.

import type { AuthUser, Env } from '../helpers'
import { generateId } from '../helpers'
import { applyMutation } from '../routes/mutations'
import { isJoinApprover, JOIN_TELEGRAM_APPROVER } from '../../shared/joinApprovers'
import { DIRECTORY_COLUMNS } from './project-join-columns'

export { DIRECTORY_COLUMNS }

/** One row of `project_directory`. Built only from the view; nothing else may be added. */
export type DirectoryRow = { readonly [K in (typeof DIRECTORY_COLUMNS)[number]]: string | null } & { readonly project_id: string; readonly name: string }

export type JoinState = 'member' | 'pending' | 'declined' | 'none'

/** A directory row plus the CALLER's own relation to it (their membership and their own requests). */
export interface DirectoryEntry extends DirectoryRow {
  readonly state: JoinState
  readonly request_id: string | null
  /** When state is 'declined': the decline note and date, for the requester alone. */
  readonly decided_note: string | null
  readonly decided_at: string | null
}

export type JoinRequestStatus = 'pending' | 'approved' | 'declined'

export interface JoinRequestRow {
  id: string
  project_id: string
  requester_slug: string
  note: string | null
  status: JoinRequestStatus
  decided_by: string | null
  decided_via: string | null
  decided_note: string | null
  decided_at: string | null
  created_at: string
}

/** A request as an approver sees it on Today: the request, the directory row, who asked. */
export interface JoinRequestForApprover extends JoinRequestRow {
  project_name: string | null
  blurb: string | null
  pi_name: string | null
  requester_name: string | null
  requester_photo: string | null
}

const SELECT_DIRECTORY = `SELECT ${DIRECTORY_COLUMNS.join(', ')} FROM project_directory`
const REQUEST_COLS = 'id, project_id, requester_slug, note, status, decided_by, decided_via, decided_note, decided_at, created_at'

/** Every listed project, by name. */
export async function readDirectory(db: D1Database): Promise<DirectoryRow[]> {
  const { results } = await db.prepare(`${SELECT_DIRECTORY} ORDER BY name COLLATE NOCASE`).all<DirectoryRow>()
  return results ?? []
}

/** One listed project, or null (unlisted: deleted, done, Peripheral Brain, unknown). */
export async function readDirectoryRow(db: D1Database, projectId: string): Promise<DirectoryRow | null> {
  return (await db.prepare(`${SELECT_DIRECTORY} WHERE project_id = ?`).bind(projectId).first<DirectoryRow>()) ?? null
}

/** The caller's directory: each listed project with the caller's own state on it. */
export async function readDirectoryFor(db: D1Database, slug: string): Promise<DirectoryEntry[]> {
  const rows = await readDirectory(db)
  // Three statements on purpose: the view is never named beside a scoped table.
  const mine = await db.prepare('SELECT project_id FROM project_members WHERE member_slug = ?').bind(slug).all<{ project_id: string }>()
  const memberOf = new Set((mine.results ?? []).map((r) => r.project_id))
  const reqs = await db.prepare(
    `SELECT ${REQUEST_COLS} FROM project_join_requests WHERE requester_slug = ? ORDER BY created_at DESC`,
  ).bind(slug).all<JoinRequestRow>()
  // Newest request per project decides the state; an approved one is a membership.
  const latest = new Map<string, JoinRequestRow>()
  for (const r of reqs.results ?? []) if (!latest.has(r.project_id)) latest.set(r.project_id, r)
  return rows.map((row) => {
    const req = latest.get(row.project_id)
    const state: JoinState = memberOf.has(row.project_id)
      ? 'member'
      : req?.status === 'pending' ? 'pending'
        : req?.status === 'declined' ? 'declined'
          : 'none'
    return {
      ...row,
      state,
      request_id: state === 'pending' || state === 'declined' ? req?.id ?? null : null,
      decided_note: state === 'declined' ? req?.decided_note ?? null : null,
      decided_at: state === 'declined' ? req?.decided_at ?? null : null,
    }
  })
}

// ── requests ────────────────────────────────────────────────────────────────

/** Mints Nick's Telegram question for one request. Built in api/index.ts from the raw handle. */
export type JoinQuestionMinter = (args: {
  taskId: string
  requestId: string
  requesterName: string
  projectName: string
  note: string | null
  user: AuthUser
}) => Promise<{ ok: true } | { ok: false; reason: string }>

/**
 * Nick's Telegram question for one request. PB's Ask parser
 * (scripts/questions/spec.py) is the reader: choice keys of 1..8 ascii
 * characters, `rec` naming an authored choice, and the free-text `other`
 * last (PB appends it by construction and strips it on parse).
 * project-join.contract.test.ts pins the shape.
 */
export function joinQuestionSpec(args: { requestId: string; requesterName: string; projectName: string; note: string | null }) {
  const { requestId, requesterName, projectName, note } = args
  return {
    v: 1,
    kind: 'project_join',
    prompt: `${requesterName} asks to join ${projectName}${note ? `: "${note}"` : ''}`,
    choices: [
      { key: 'approve', label: 'Approve', payload: { request_id: requestId } },
      { key: 'decline', label: 'Decline', payload: { request_id: requestId } },
      { key: 'other', label: 'Other' },
    ],
    allow_text: true,
    rec: 'approve',
  }
}

/**
 * The capability. `raw` is the unscoped handle: the requester cannot read the
 * row it writes, so applyMutation's read-back would fail on their handle. The
 * capability's only output is this one question shape, and the schema-v139
 * tasks trigger refuses any other shape on source='project_join'.
 */
export function joinQuestionMinter(env: Env, raw: D1Database): JoinQuestionMinter {
  return async ({ taskId, requestId, requesterName, projectName, note, user }) => {
    const spec = joinQuestionSpec({ requestId, requesterName, projectName, note })
    const res = await applyMutation({ ...env, DB: raw }, {
      table: 'tasks',
      record_id: taskId,
      op: 'insert',
      // record_id is the row's id; watchers is off the wire and stays NULL.
      payload: {
        // The request id keeps the title unique (task-title dedup keys on it).
        title: `Join request: ${requesterName} -> ${projectName} (${requestId})`,
        kind: 'question',
        source: 'project_join',
        status: 'todo',
        assignee: JOIN_TELEGRAM_APPROVER,
        assigned_by: null,
        project_id: null,
        question_spec_json: JSON.stringify(spec),
      },
      route: 'project-join',
      user,
    })
    if (res.status === 'accepted' || res.status === 'merged_clean') return { ok: true }
    return { ok: false, reason: `${res.status}: ${res.reason ?? res.code ?? 'no reason'}` }
  }
}

export type SubmitOutcome =
  | { kind: 'created'; request: JoinRequestRow; telegram: 'sent' | 'none' | 'failed' }
  | { kind: 'existing'; request: JoinRequestRow }
  | { kind: 'not_listed' }
  | { kind: 'member' }

const NOTE_MAX = 280

/** Trim a note; '' means none. Over the limit is the caller's 400, not a silent cut. */
export function cleanJoinNote(raw: unknown): { ok: true; note: string | null } | { ok: false; reason: string } {
  if (raw === undefined || raw === null) return { ok: true, note: null }
  if (typeof raw !== 'string') return { ok: false, reason: 'note must be a string' }
  const note = raw.trim()
  if (note.length === 0) return { ok: true, note: null }
  if (note.length > NOTE_MAX) return { ok: false, reason: `note is ${note.length} characters; the limit is ${NOTE_MAX}` }
  return { ok: true, note }
}

async function pendingRequest(db: D1Database, projectId: string, slug: string): Promise<JoinRequestRow | null> {
  return (await db.prepare(
    `SELECT ${REQUEST_COLS} FROM project_join_requests WHERE project_id = ? AND requester_slug = ? AND status = 'pending'`,
  ).bind(projectId, slug).first<JoinRequestRow>()) ?? null
}

function raised(e: unknown, code: string): boolean {
  return (e instanceof Error ? e.message : String(e)).includes(code)
}

/**
 * Ask to join `projectId` as `requester`. `db` is the requester's own handle.
 * One pending request per (project, person): a second ask returns the first.
 */
export async function submitJoinRequest(
  db: D1Database,
  args: { projectId: string; requester: { slug: string; name: string }; note: string | null; user: AuthUser; mint: JoinQuestionMinter },
): Promise<SubmitOutcome> {
  const { projectId, requester, note, user, mint } = args
  const row = await readDirectoryRow(db, projectId)
  if (!row) return { kind: 'not_listed' }
  const already = await db.prepare('SELECT 1 AS x FROM project_members WHERE project_id = ? AND member_slug = ?')
    .bind(projectId, requester.slug).first()
  if (already) return { kind: 'member' }
  const existing = await pendingRequest(db, projectId, requester.slug)
  if (existing) return { kind: 'existing', request: existing }

  const id = generateId()
  // Nick cannot answer his own request, so his asks get no Telegram question;
  // Nate decides them on Today.
  const taskId = requester.slug === JOIN_TELEGRAM_APPROVER ? null : generateId('task')
  try {
    await db.prepare(
      'INSERT INTO project_join_requests (id, project_id, requester_slug, note, question_task_id) VALUES (?, ?, ?, ?, ?)',
    ).bind(id, projectId, requester.slug, note, taskId).run()
  } catch (e) {
    // The database is the judge (schema-v139 trg_pjr_guard_ins and the
    // one-pending index); these are the races past the reads above.
    if (raised(e, 'join_already_member')) return { kind: 'member' }
    if (raised(e, 'join_not_listed')) return { kind: 'not_listed' }
    if (raised(e, 'UNIQUE')) {
      const winner = await pendingRequest(db, projectId, requester.slug)
      if (winner) return { kind: 'existing', request: winner }
    }
    throw e
  }
  const request = (await db.prepare(`SELECT ${REQUEST_COLS} FROM project_join_requests WHERE id = ?`).bind(id).first<JoinRequestRow>())!
  let telegram: 'sent' | 'none' | 'failed' = 'none'
  if (taskId) {
    try {
      const minted = await mint({ taskId, requestId: id, requesterName: requester.name, projectName: row.name, note, user })
      telegram = minted.ok ? 'sent' : 'failed'
      // The request stands without its Telegram card: both approvers still see
      // it on Today. Fail loud in the error ledger, not to the requester.
      if (!minted.ok) console.error('project-join: Telegram question not minted', id, minted.reason)
    } catch (e) {
      telegram = 'failed'
      console.error('project-join: Telegram question not minted', id, (e as Error).message)
    }
  }
  return { kind: 'created', request, telegram }
}

// ── decisions ───────────────────────────────────────────────────────────────

export type DecideOutcome =
  | { kind: 'decided'; request: JoinRequestRow }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'not_found' }
  | { kind: 'already'; request: JoinRequestRow }

/**
 * Approve or decline. `db` is the approver's own handle; approvers read every
 * request (table-scope), so nothing here depends on seeing the project.
 */
export async function decideJoinRequest(
  db: D1Database,
  args: { id: string; deciderSlug: string; decision: 'approve' | 'decline'; note: string | null },
): Promise<DecideOutcome> {
  const { id, deciderSlug, decision, note } = args
  if (!isJoinApprover(deciderSlug)) return { kind: 'forbidden', reason: 'Only Nick or Nate can approve a request to join' }
  const req = await db.prepare(`SELECT ${REQUEST_COLS} FROM project_join_requests WHERE id = ?`).bind(id).first<JoinRequestRow>()
  if (!req) return { kind: 'not_found' }
  if (req.requester_slug === deciderSlug) return { kind: 'forbidden', reason: 'You cannot decide your own request' }
  if (req.status !== 'pending') return { kind: 'already', request: req }
  const res = await db.prepare(
    `UPDATE project_join_requests
        SET status = ?, decided_by = ?, decided_via = 'hub', decided_note = ?,
            decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND status = 'pending'`,
  ).bind(decision === 'approve' ? 'approved' : 'declined', deciderSlug, note, id).run()
  const after = (await db.prepare(`SELECT ${REQUEST_COLS} FROM project_join_requests WHERE id = ?`).bind(id).first<JoinRequestRow>())!
  if ((res.meta?.changes ?? 0) === 0) return { kind: 'already', request: after }
  return { kind: 'decided', request: after }
}

/** Pending requests (and the last 14 days of decided ones), for an approver's Today card. */
export async function readRequestsForApprover(db: D1Database, approverSlug: string): Promise<JoinRequestForApprover[]> {
  if (!isJoinApprover(approverSlug)) return []
  const { results } = await db.prepare(
    `SELECT r.id, r.project_id, r.requester_slug, r.note, r.status, r.decided_by, r.decided_via, r.decided_note,
            r.decided_at, r.created_at,
            d.name AS project_name, d.blurb AS blurb, d.pi_name AS pi_name,
            COALESCE(NULLIF(trim(tm.preferred_name), ''), tm.name) AS requester_name, tm.photo_url AS requester_photo
       FROM project_join_requests r
       LEFT JOIN project_directory d ON d.project_id = r.project_id
       LEFT JOIN team_members tm ON tm.slug = r.requester_slug
      WHERE r.requester_slug <> ?
        AND (r.status = 'pending' OR r.decided_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-14 days'))
      ORDER BY r.status = 'pending' DESC, r.created_at ASC`,
  ).bind(approverSlug).all<JoinRequestForApprover>()
  return results ?? []
}

// ── the one-line description ────────────────────────────────────────────────

export const BLURB_MAX = 140

/** A blurb as stored: one line, 1..140 characters. null clears it. */
export function cleanBlurb(raw: unknown): { ok: true; blurb: string | null } | { ok: false; reason: string } {
  if (raw === null || raw === undefined) return { ok: true, blurb: null }
  if (typeof raw !== 'string') return { ok: false, reason: 'blurb must be a string or null' }
  if (/[\r\n]/.test(raw)) return { ok: false, reason: 'blurb is one line: no line breaks' }
  const blurb = raw.trim()
  if (blurb.length === 0) return { ok: true, blurb: null }
  if (blurb.length > BLURB_MAX) return { ok: false, reason: `blurb is ${blurb.length} characters; the limit is ${BLURB_MAX}` }
  return { ok: true, blurb }
}
