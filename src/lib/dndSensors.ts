// Input-safe dnd-kit sensors.
//
// dnd-kit's stock KeyboardSensor activates a drag on Space/Enter for ANY
// keydown that bubbles up to the draggable node — it only rejects bubbled
// events when the draggable wires setActivatorNodeRef, which ours don't
// (see KeyboardSensor.activators: `if (activator && event.target !== activator)`).
// When a form field is nested inside a draggable (Today's TaskRow wraps the
// expanded TaskDetailDrawer → SmartCompose textarea), typing a space in the
// comment box picked up the row: preventDefault ate the character and the
// DragOverlay ghost appeared over the page. PointerSensor has the sibling
// failure — drag-selecting text inside a nested field starts a row drag.
//
// These subclasses reject activation when the event originates in an editable
// element and delegate everything else to the stock activators, so keyboard
// a11y (focus the row → Space to pick up, arrows to move) is unchanged.

import { KeyboardSensor, PointerSensor } from '@dnd-kit/core'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

export class InputSafeKeyboardSensor extends KeyboardSensor {
  static activators: typeof KeyboardSensor.activators = KeyboardSensor.activators.map(
    (activator) => ({
      ...activator,
      handler: (...args: Parameters<typeof activator.handler>) =>
        isEditableTarget(args[0].target) ? false : activator.handler(...args),
    }),
  )
}

export class InputSafePointerSensor extends PointerSensor {
  static activators: typeof PointerSensor.activators = PointerSensor.activators.map(
    (activator) => ({
      ...activator,
      handler: (...args: Parameters<typeof activator.handler>) =>
        isEditableTarget(args[0].target) ? false : activator.handler(...args),
    }),
  )
}
