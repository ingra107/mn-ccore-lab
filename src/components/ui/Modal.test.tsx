// Modal vs. child focus and Escape: a child autoFocus wins over the panel
// focus, and an Escape that closes an open InlineSelect listbox leaves the
// modal open. Runs in real Chromium (vitest browser mode).

import { describe, it, expect, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useState } from 'react'
import Modal from './Modal'
import InlineSelect from '../InlineSelect'

let mounted: { host: HTMLElement; root: Root }[] = []

const OPTIONS = ['a', 'b', 'c', 'd', 'e', 'f'].map((v) => ({ value: v, label: v.toUpperCase() }))

function Harness({ withSelect }: { withSelect?: boolean }) {
  const [open, setOpen] = useState(true)
  const [val, setVal] = useState('a')
  return (
    <>
      <span data-testid="state">{open ? 'open' : 'closed'}</span>
      <Modal open={open} onClose={() => setOpen(false)} title="T">
        <input data-testid="auto" autoFocus />
        {withSelect && <InlineSelect value={val} options={OPTIONS} onChange={setVal} />}
      </Modal>
    </>
  )
}

function mount(withSelect = false): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  flushSync(() => root.render(<Harness withSelect={withSelect} />))
  mounted.push({ host, root })
  return host
}

const tick = () => new Promise((r) => setTimeout(r, 50))
const esc = (el: Element) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))

afterEach(() => {
  for (const m of mounted) { m.root.unmount(); m.host.remove() }
  mounted = []
  document.body.style.overflow = ''
})

describe('Modal focus and Escape', () => {
  it('keeps a child autoFocus instead of pulling focus to the panel', async () => {
    mount()
    await tick()
    expect((document.activeElement as HTMLElement).dataset.testid).toBe('auto')
  })

  it('Escape closes the modal when no listbox is open', async () => {
    const host = mount()
    await tick()
    esc(document.activeElement!)
    await tick()
    expect(host.querySelector('[data-testid=state]')!.textContent).toBe('closed')
  })

  it('Escape in an open InlineSelect closes only the listbox', async () => {
    const host = mount(true)
    await tick()
    document.querySelector<HTMLButtonElement>('[aria-haspopup=listbox]')!.click()
    await tick()
    const filter = document.querySelector<HTMLInputElement>('[role=listbox] input')!
    expect(filter).toBeTruthy()
    filter.focus()
    esc(filter)
    await tick()
    expect(document.querySelector('[role=listbox]')).toBeNull()
    expect(host.querySelector('[data-testid=state]')!.textContent).toBe('open')
    // A second Escape now closes the modal.
    esc(document.activeElement!)
    await tick()
    expect(host.querySelector('[data-testid=state]')!.textContent).toBe('closed')
  })

  it('Tab inside the portalled filter input is not pulled into the panel', async () => {
    mount(true)
    await tick()
    document.querySelector<HTMLButtonElement>('[aria-haspopup=listbox]')!.click()
    await tick()
    const filter = document.querySelector<HTMLInputElement>('[role=listbox] input')!
    filter.focus()
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    filter.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(filter)
  })
})
