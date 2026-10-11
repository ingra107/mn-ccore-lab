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

// Controls that act on Enter or Space themselves: a button, a link, a tab, a
// menu option. A list shortcut bound on `document` must let these keys through
// when focus sits on one, or a keyboard user can no longer press a focused
// button (Enter on the Grants "Post-Award" tab opened the row detail instead,
// cold review 2026-10-10).
const ACTIVATABLE = 'a[href],button,summary,[role="button"],[role="link"],[role="tab"],[role="option"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="checkbox"],[role="radio"],[role="switch"]'

export function isActivatableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest(ACTIVATABLE) !== null
}
