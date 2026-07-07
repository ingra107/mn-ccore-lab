/**
 * InputSafeKeyboardSensor / InputSafePointerSensor activator guards.
 *
 * Regression for the Today-page comment bug (2026-07-06): the stock dnd-kit
 * KeyboardSensor activates on Space/Enter bubbling out of a textarea nested
 * inside a draggable (Today TaskRow wraps TaskDetailDrawer's SmartCompose),
 * eating the keystroke and popping the DragOverlay ghost.
 *
 * Run: npx vitest run src/__tests__/dnd-input-safe-sensors.test.tsx
 */

import { describe, it, expect, vi } from 'vitest'
import { InputSafeKeyboardSensor, InputSafePointerSensor, InputSafeTouchSensor } from '../lib/dndSensors'

// Minimal activator context: no activatorNode registered (the TaskRow case —
// listeners spread on the wrapper, setActivatorNodeRef unused).
const context = { active: { activatorNode: { current: null } } }

function fireKeyboardActivator(target: HTMLElement) {
  const event = {
    nativeEvent: { code: 'Space' },
    target,
    preventDefault: vi.fn(),
  }
  return InputSafeKeyboardSensor.activators[0].handler(
    event as never,
    {} as never,
    context as never,
  )
}

function firePointerActivator(target: HTMLElement) {
  const event = {
    nativeEvent: { isPrimary: true, button: 0 },
    target,
  }
  // PointerSensor's activator signature is (event, options) — no context arg.
  return InputSafePointerSensor.activators[0].handler(event as never, {} as never)
}

function fireTouchActivator(target: HTMLElement) {
  const event = {
    // TouchSensor extends the same AbstractPointerSensor base as
    // PointerSensor and shares its (event, options) activator signature;
    // its real handler additionally reads nativeEvent.touches.length.
    nativeEvent: { touches: [{}] },
    target,
  }
  return InputSafeTouchSensor.activators[0].handler(event as never, {} as never)
}

describe('InputSafeKeyboardSensor', () => {
  it('does NOT activate on Space bubbling from a textarea', () => {
    expect(fireKeyboardActivator(document.createElement('textarea'))).toBe(false)
  })

  it('does NOT activate from input / select / contentEditable', () => {
    expect(fireKeyboardActivator(document.createElement('input'))).toBe(false)
    expect(fireKeyboardActivator(document.createElement('select'))).toBe(false)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    document.body.appendChild(editable) // isContentEditable resolves only in-document
    expect(fireKeyboardActivator(editable)).toBe(false)
    editable.remove()
  })

  it('still activates on Space from a non-editable element (a11y preserved)', () => {
    expect(fireKeyboardActivator(document.createElement('div'))).toBe(true)
  })
})

describe('InputSafePointerSensor', () => {
  it('does NOT activate on pointerdown inside a textarea (text selection)', () => {
    expect(firePointerActivator(document.createElement('textarea'))).toBe(false)
  })

  it('still activates on pointerdown from a non-editable element', () => {
    expect(firePointerActivator(document.createElement('div'))).toBe(true)
  })
})

describe('InputSafeTouchSensor', () => {
  it('does NOT activate on touchstart inside a textarea (mobile #481)', () => {
    expect(fireTouchActivator(document.createElement('textarea'))).toBe(false)
  })

  it('still activates on touchstart from a non-editable element (long-press drag preserved)', () => {
    expect(fireTouchActivator(document.createElement('div'))).toBe(true)
  })
})
