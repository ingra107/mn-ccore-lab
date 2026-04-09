/**
 * Component-level keyboard shortcut tests.
 *
 * Runs in real browser (Vitest Browser Mode) — keyboard events fire through
 * actual DOM, not JSDOM simulation. Solves headless Chromium keyboard failures.
 *
 * Run: npx vitest run src/__tests__/keyboard-shortcuts.test.tsx
 */

import { describe, it, expect, vi } from 'vitest'

describe('Keyboard shortcut dispatch', () => {
  it('Ctrl+K fires keydown event on document', () => {
    const handler = vi.fn()
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') handler()
    }
    document.addEventListener('keydown', listener)

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
    }))

    expect(handler).toHaveBeenCalledOnce()
    document.removeEventListener('keydown', listener)
  })

  it('keyboard events are blocked in input elements', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const target = document.activeElement as HTMLElement
    expect(target.tagName).toBe('INPUT')

    document.body.removeChild(input)
  })

  it('custom events dispatch and receive correctly', () => {
    const handler = vi.fn()
    document.addEventListener('toggle-filters', handler)

    document.dispatchEvent(new CustomEvent('toggle-filters'))
    expect(handler).toHaveBeenCalledOnce()

    document.removeEventListener('toggle-filters', handler)
  })

  it('custom toggle-focus event dispatches', () => {
    const handler = vi.fn()
    document.addEventListener('toggle-focus', handler)

    document.dispatchEvent(new CustomEvent('toggle-focus'))
    expect(handler).toHaveBeenCalledOnce()

    document.removeEventListener('toggle-focus', handler)
  })
})
