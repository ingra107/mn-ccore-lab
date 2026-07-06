// isEditableTarget — the shared "does this event originate in an editable
// form field" predicate (INPUT / TEXTAREA / SELECT / contentEditable).
//
// Extracted 2026-07-06 (simplify pass): the identical check existed as
// private copies in useKeyboardShortcuts, useListKeyboardNav,
// useProjectKeyboardNav, useTaskKeyboardShortcuts and dndSensors — this is
// the one to import; see improvement-backlog for converging the older copies.

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}
