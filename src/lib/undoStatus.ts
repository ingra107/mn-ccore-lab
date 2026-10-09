// What "Undo" puts back after a task is marked done. It is the status the task
// had BEFORE the click, so an in_progress, waiting or blocked task returns as
// itself. Only a task that was already done (or whose prior status is unknown)
// falls back to 'todo'. Shared by Today and Tasks through useTodayState.markDone.

export function statusToRestore(prior: string | null | undefined): string {
  return !prior || prior === 'done' ? 'todo' : prior
}
