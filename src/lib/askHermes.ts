// One home for "typed @hermes → ask Hermes, then tell the user what happened".
//
// WHY (Nick 2026-07-23): he typed `@hermes add to the backlog …` into the Ctrl+I
// Quick Capture sheet and nothing happened. Not a bug — QuickCaptureInbox posts to
// /api/inbox-events/sync-bulk, which has no Hermes handling on either side, and
// Phase 8 had wired the prefix into the OTHER capture box (GlobalQuickAddModal,
// opened with `q`). Two capture boxes, one Hermes-aware, no way to tell them apart
// while typing. His ask lay untriaged in inbox_events; an earlier one that day
// ("what time is my CLIF meeting today") died the same way, silently.
//
// The fix is not a third copy of the routing block. Each capture surface that
// reaches the day feed calls askHermesOnDay(), so a NEW capture box gets the
// behavior by calling one function instead of by remembering to reimplement it.
// askHermesOnTask() is the task-lane analog (backlog #545): task compose
// surfaces call it instead of hand-rolling the private task-comment POST.
//
// hermesOutcomeToast() also closes the deferred /simplify finding from
// docs/superpowers/plans/2026-07-22-hermes-lane-unification.md ("3rd copy =
// extract") — the outcome→toast block was copied across SmartCompose,
// TaskDetailPanel and MorningThoughtCompose, and this change would have made it
// five. The only real variation was the verb, so that is the only parameter.
//
// ⚠️ KEEP the @hermes token in the posted body. The server's HERMES_DETECT_RE
// fires on the STORED text; stripping the token is a silent "no Hermes".

import { todayKey } from './taskGrouping'

/** What the server reports back about the dispatch attempt. */
export type HermesDispatch = { dispatched: boolean; reason?: string }

/** Result of asking Hermes: the post either landed (with a dispatch verdict) or threw. */
export type HermesAskResult =
  | { ok: true; hermes?: HermesDispatch }
  | { ok: false; error: Error }

// ── One lane config, one ask function (#125) ─────────────────────────────────
//
// askHermesOnDay, askHermesOnTask and askHermesOnMeeting were three copies of one
// try/fetch/parse-`hermes`/catch body; only the URL, the body and the failure label
// differed, and this file's own header named "3rd copy = extract" as the rule. They
// are lane entries now, and a fourth conversation surface is one more entry. The
// named functions below stay as one-line callers so the call sites read as before.

/** A conversation surface on the unified activity store. */
export type HermesLane = 'day' | 'task' | 'meeting'

interface LaneConfig {
  /** POST target for a new entry on this entity. */
  url(id: string): string
  /** JSON body; the content goes VERBATIM (the @hermes token stays). */
  body(content: string, visibility?: 'team' | 'author'): Record<string, unknown>
  /** Prefix of the thrown message when the server answers non-2xx. */
  failure: string
  /** The react-query key family the lane's feed reads (callers invalidate it). */
  keyFamily: string
}

const LANES: Record<HermesLane, LaneConfig> = {
  // Day threads default PRIVATE server-side; the body names no audience.
  day: {
    url: (dateKey) => `/api/days/${dateKey}/activity`,
    body: (content) => ({ content }),
    failure: '/api/days',
    keyFamily: 'day-activity',
  },
  // A typed @hermes prefix defaults PRIVATE (owner decision A): the task lane
  // always posts visibility='author'; a mid-text @hermes stays a team comment
  // because the composers route only a typed PREFIX here.
  task: {
    url: (taskId) => `/api/tasks/${taskId}/comments`,
    body: (content) => ({ content, visibility: 'author' }),
    failure: '/api/tasks comment',
    keyFamily: 'task-activity',
  },
  // A meeting page is a shared team surface, so an ordinary remark defaults
  // TEAM-visible; only a typed @hermes PREFIX makes the thread private.
  meeting: {
    url: (meetingId) => `/api/meetings/${encodeURIComponent(meetingId)}/activity`,
    body: (content, visibility = 'team') => ({ content, visibility }),
    failure: '/api/meetings activity',
    keyFamily: 'meeting-activity',
  },
}

/**
 * Post `content` to an entity's conversation as a Hermes ask. The body goes
 * VERBATIM (token intact): the stored text is what the server's HERMES_DETECT_RE
 * fires on, and stripping the token is a silent "no Hermes". The server answers
 * IN-THREAD. Never throws: callers branch on `ok`.
 */
export async function askHermesOnEntity(
  lane: HermesLane,
  id: string,
  content: string,
  opts: { visibility?: 'team' | 'author' } = {},
): Promise<HermesAskResult> {
  const cfg = LANES[lane]
  try {
    const res = await fetch(cfg.url(id), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg.body(content, opts.visibility)),
    })
    if (!res.ok) throw new Error(`${cfg.failure} ${res.status}`)
    const out = (await res.json().catch(() => ({}))) as { hermes?: HermesDispatch }
    return { ok: true, hermes: out.hermes }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * The react-query key a lane's feed reads, so callers invalidate the right thing.
 * The one key builder: a lane's family string is written here and nowhere else.
 */
export function activityQueryKey(lane: HermesLane, id: string): [string, string] {
  return [LANES[lane].keyFamily, id]
}

/**
 * Post `content` to the day feed as a Hermes ask: a private
 * (visibility='author') activity_entries row, answered in-thread.
 */
export function askHermesOnDay(content: string, dateKey: string = todayKey()): Promise<HermesAskResult> {
  return askHermesOnEntity('day', dateKey, content)
}

/** The react-query key the day feed reads. */
export function dayActivityQueryKey(dateKey: string = todayKey()): [string, string] {
  return activityQueryKey('day', dateKey)
}

/**
 * Post `content` to a task's comment thread as a Hermes ask, PRIVATE
 * (visibility='author'); the answer inherits it. Shared by SmartCompose task mode
 * and OverviewQuickAdd (TaskDetailPanel.tsx) so the two task composers cannot
 * drift on this contract (backlog #545).
 */
export function askHermesOnTask(taskId: string, content: string): Promise<HermesAskResult> {
  return askHermesOnEntity('task', taskId, content)
}

/**
 * Post `content` to a meeting's conversation (#124). `visibility` defaults TEAM:
 * only a typed `@hermes` PREFIX makes the thread private, matching the task
 * lane's rule that the prefix selects the default audience.
 */
export function askHermesOnMeeting(
  meetingId: string,
  content: string,
  visibility: 'team' | 'author' = 'team',
): Promise<HermesAskResult> {
  return askHermesOnEntity('meeting', meetingId, content, { visibility })
}

/** The react-query key the meeting feed reads. */
export function meetingActivityQueryKey(meetingId: string): [string, string] {
  return activityQueryKey('meeting', meetingId)
}

export type ToastKind = 'success' | 'info' | 'error'

/**
 * The user-facing copy for a Hermes ask. `verb` is the only thing that varies
 * between surfaces: the day bar and capture boxes SAVE, a task comment POSTS.
 *
 * The "saved privately but Hermes didn't run" cases stay `info`, not `error` —
 * the user's words are safely stored either way, and calling that a failure
 * reads as data loss.
 */
export function hermesOutcomeToast(
  result: HermesAskResult,
  verb: 'Saved' | 'Posted' = 'Saved'
): { kind: ToastKind; text: string } {
  if (!result.ok) {
    return { kind: 'error', text: `Sending to Hermes failed: ${result.error.message}` }
  }
  if (result.hermes && !result.hermes.dispatched) {
    return {
      kind: 'info',
      text:
        result.hermes.reason === 'empty'
          ? `${verb} privately — add a question for Hermes`
          : `${verb} privately, but Hermes could not be reached — try again`,
    }
  }
  return { kind: 'success', text: 'Asked Hermes' }
}
