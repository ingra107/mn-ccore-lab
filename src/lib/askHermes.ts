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

/**
 * Post `content` to the day feed as a Hermes ask.
 *
 * The body goes VERBATIM (token intact) to POST /api/days/:date/activity, which
 * stores a private (visibility='author') activity_entries row and fires the
 * in-thread Hermes answer. Never throws — callers branch on `ok`.
 */
export async function askHermesOnDay(
  content: string,
  dateKey: string = todayKey()
): Promise<HermesAskResult> {
  try {
    const res = await fetch(`/api/days/${dateKey}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) throw new Error(`/api/days ${res.status}`)
    const out = (await res.json().catch(() => ({}))) as { hermes?: HermesDispatch }
    return { ok: true, hermes: out.hermes }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/** The react-query key the day feed reads, so callers invalidate the right thing. */
export function dayActivityQueryKey(dateKey: string = todayKey()): [string, string] {
  return ['day-activity', dateKey]
}

/**
 * Post `content` to a task's comment thread as a Hermes ask.
 *
 * The body goes VERBATIM (token intact) to POST /api/tasks/:id/comments as a
 * PRIVATE (visibility='author') activity_entries row -- owner decision A: a
 * typed @hermes prefix defaults private (a mid-text @hermes stays a team
 * comment). The server's HERMES_DETECT_RE fires on the stored token and
 * answers IN-THREAD (source_type='task_comment'); the answer inherits
 * visibility='author'. Never throws -- callers branch on `ok`.
 *
 * Task-lane analog of askHermesOnDay(): shared by SmartCompose task mode and
 * OverviewQuickAdd (TaskDetailPanel.tsx) so the two task composers cannot
 * drift on this contract again (backlog #545 -- the same block had been
 * hand-threaded through both in four separate commits).
 */
export async function askHermesOnTask(taskId: string, content: string): Promise<HermesAskResult> {
  try {
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, visibility: 'author' }),
    })
    if (!res.ok) throw new Error(`/api/tasks comment ${res.status}`)
    const out = (await res.json().catch(() => ({}))) as { hermes?: HermesDispatch }
    return { ok: true, hermes: out.hermes }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) }
  }
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
