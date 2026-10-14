// Guards useDismissable (G7-5, 2026-10-14): an in-page popover closes on
// Escape and on a press outside it, and a press on the trigger or inside the
// menu does not close it. Real Chromium (vitest browser mode).

import { describe, it, expect } from 'vitest'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDismissable } from '../hooks/useDismissable'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

function Popover({ escape = true }: { escape?: boolean }) {
  const [open, setOpen] = useState(true)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismissable(open, close, [triggerRef, menuRef], { escape })
  // Effects run in declaration order, so once this one has run the hook's
  // listeners are attached: tests wait on data-armed instead of a sleep.
  const [armed, setArmed] = useState(false)
  useEffect(() => { setArmed(open) }, [open])
  return (
    <div data-armed={armed ? 'true' : 'false'}>
      <button ref={triggerRef} data-testid="trigger" onClick={() => setOpen((v) => !v)}>toggle</button>
      {open && <div ref={menuRef} role="menu"><span data-testid="inside">item</span></div>}
      <p data-testid="outside">elsewhere</p>
      <iframe data-testid="frame" title="frame" srcDoc="<button>in</button>" />
    </div>
  )
}

function press(el: Element) {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
}

async function setup(escape = true) {
  return mount(<Popover escape={escape} />, { ready: (h) => h.querySelector('[data-armed=true] [role=menu]'), label: 'armed menu' })
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

  // Touch: a finger landing outside may be the start of a page scroll, so the
  // menu waits for the tap's click before it closes.
  it('on touch, stays open on pointerdown outside and closes on the tap', async () => {
    const host = await setup()
    const outside = host.querySelector('[data-testid=outside]')!
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))
    await new Promise((r) => setTimeout(r, 50))
    expect(host.querySelector('[role=menu]')).not.toBeNull()
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await expect.poll(() => host.querySelector('[role=menu]')).toBeNull()
  })

  // A press inside an iframe never reaches this document; focus moving into it does.
  it('closes when focus moves into an iframe', async () => {
    const host = await setup()
    const frame = host.querySelector<HTMLIFrameElement>('[data-testid=frame]')!
    await expect.poll(() => frame.contentDocument?.querySelector('button')).not.toBeNull()
    frame.focus()
    window.dispatchEvent(new FocusEvent('blur'))
    await expect.poll(() => host.querySelector('[role=menu]')).toBeNull()
  })

  // One Escape closes the popover only, not the drawer or page listening behind it.
  it('Escape does not reach a document listener behind the popover', async () => {
    await setup()
    let behind = 0
    const onKey = () => { behind += 1 }
    document.addEventListener('keydown', onKey)
    try {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(behind).toBe(0)
    } finally {
      document.removeEventListener('keydown', onKey)
    }
  })

  it('with escape: false, leaves Escape to the caller', async () => {
    const host = await setup(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    expect(host.querySelector('[role=menu]')).not.toBeNull()
  })
})
