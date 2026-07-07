// isEditableTarget — the shared "does this event originate in an editable
// form field" predicate (INPUT / TEXTAREA / SELECT / contentEditable).
//
// Extracted 2026-07-06 (simplify pass) from dndSensors' private copy; the
// same day, #486 converged the remaining private copies onto this one:
// useKeyboardShortcuts, useListKeyboardNav, useProjectKeyboardNav,
// useTaskKeyboardShortcuts, GlobalQuickAddModal, MeetingDetail (the last two
// were missing the SELECT check — an oversight, fixed by the convergence).
// This is the one to import for any future "ignore this shortcut while
// typing" guard.

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}
