// Guards useDismissable (G7-5, 2026-10-14): an in-page popover closes on
// Escape and on a press outside it, and a press on the trigger or inside the
// menu does not close it. Real Chromium (vitest browser mode).

import { describe, it, expect } from 'vitest'
import { useCallback, useRef, useState } from 'react'
import { useDismissable } from '../hooks/useDismissable'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

function Popover() {
  const [open, setOpen] = useState(true)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismissable(open, close, [triggerRef, menuRef])
  return (
    <div>
      <button ref={triggerRef} data-testid="trigger" onClick={() => setOpen((v) => !v)}>toggle</button>
      {open && <div ref={menuRef} role="menu"><span data-testid="inside">item</span></div>}
      <p data-testid="outside">elsewhere</p>
    </div>
  )
}

function press(el: Element) {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
}

async function setup() {
  return mount(<Popover />, { ready: (h) => h.querySelector('[role=menu]'), label: 'menu' })
}

describe('useDismissable', () => {
  it('closes on Escape and returns focus to the trigger', async () => {
    const host = await setup()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect.poll(() => host.querySelector('[role=menu]')).toBeNull()
    expect(document.activeElement).toBe(host.querySelector('[data-testid=trigger]'))
  })

  it('closes on a press outside', async () => {
    const host = await setup()
    press(host.querySelector('[data-testid=outside]')!)
    await expect.poll(() => host.querySelector('[role=menu]')).toBeNull()
  })

  it('stays open on a press inside the menu or on the trigger', async () => {
    const host = await setup()
    press(host.querySelector('[data-testid=inside]')!)
    press(host.querySelector('[data-testid=trigger]')!)
    await new Promise((r) => setTimeout(r, 50))
    expect(host.querySelector('[role=menu]')).not.toBeNull()
  })
})
