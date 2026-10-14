// writeFailures — the rules for how a failed write reaches the person.
//
// A write (any TanStack mutation) that fails must never be silent, and must
// never leave a success or Undo toast standing for a change that did not land
// (ethos #3, fail loud). Before this file, every one of ~90 mutations had to
// remember its own error toast, and about half did not: the Today check-circle,
// the Create Task sheet, idea archive, decisions, Ask replies and the digest
// all failed silently (overnight 2026-10-14 audit, lane H2).
//
// The floor now lives in one place, UndoToastProvider, which watches the
// MutationCache:
//   1. A failed mutation withdraws the Undo toast that was shown for it.
//   2. It then gets an error toast, unless the code that ran it already showed
//      one (a specific message beats the generic one) or the mutation declares
//      that it shows its error inline (`meta: INLINE_ERROR_META`).
// The pure decisions are here so they can be tested without a DOM.

/** Put on a mutation that renders its own error next to the field it belongs
 *  to (an inline message), so the provider does not also toast it. */
export const INLINE_ERROR_META = { errorSurface: 'inline' } as const

export function showsItsOwnError(meta: Record<string, unknown> | undefined): boolean {
  return meta?.errorSurface === 'inline'
}

/** The words a refusal toast shows. Hub routes answer a 4xx in plain words;
 *  anything else (a 5xx, a dropped connection) has no sentence for a person,
 *  so it gets one. */
export function reason(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status
  if (err instanceof Error && err.message && typeof status === 'number' && status < 500) return err.message
  return 'the Hub did not answer; try again.'
}

/** The generic failure toast. When the failure withdrew an Undo toast, name
 *  what did not save ("Task completed: not saved. ..."). */
export function failureMessage(err: unknown, undoMessage?: string): string {
  const why = reason(err)
  const sentence = why.charAt(0).toUpperCase() + why.slice(1)
  return undoMessage ? `${undoMessage}: not saved. ${sentence}` : `Not saved. ${sentence}`
}

/** How close (ms) a mutation's submit must sit to an Undo toast for the two to
 *  be the same action. Callers run `mutate()` and `showUndo()` back to back in
 *  one handler, a few ms apart at most. */
export const UNDO_LINK_WINDOW_MS = 250

/** The mutations an Undo toast shown at `shownAt` speaks for: those submitted
 *  within the link window of it. */
export function linkedMutationIds(
  mutations: ReadonlyArray<{ mutationId: number; state: { submittedAt: number } }>,
  shownAt: number,
  windowMs = UNDO_LINK_WINDOW_MS,
): number[] {
  return mutations
    .filter((m) => m.state.submittedAt > 0 && Math.abs(m.state.submittedAt - shownAt) <= windowMs)
    .map((m) => m.mutationId)
}

/** How long before a failure a specific error toast still counts as covering
 *  it: a hook-level onError toasts just before the cache hears the failure, a
 *  call-site onError or a mutateAsync catch just after. */
export const SPECIFIC_ERROR_WINDOW_MS = 1000
/** How long after a failure to wait for a specific toast before the generic
 *  one shows. */
export const GENERIC_ERROR_DELAY_MS = 120

export function specificErrorShown(lastSpecificErrorAt: number, failedAt: number): boolean {
  return lastSpecificErrorAt >= failedAt - SPECIFIC_ERROR_WINDOW_MS
}
