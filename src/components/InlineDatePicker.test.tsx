// A done item's date reads neutrally; an open past-due one still reads overdue.
// Runs in real Chromium (vitest browser mode); mounts with react-dom directly.

import { describe, it, expect, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import InlineDatePicker from './InlineDatePicker'

let mounted: { host: HTMLElement; root: Root }[] = []

function mount(done: boolean | undefined): HTMLButtonElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  flushSync(() => root.render(<InlineDatePicker value="2020-01-15" onChange={() => {}} done={done} />))
  mounted.push({ host, root })
  return host.querySelector('button') as HTMLButtonElement
}

afterEach(() => {
  for (const m of mounted) { m.root.unmount(); m.host.remove() }
  mounted = []
})

describe('InlineDatePicker overdue state', () => {
  it('done + past date: plain date, no overdue, no maroon', () => {
    const btn = mount(true)
    const text = btn.textContent ?? ''
    expect(text).not.toContain('in -')
    expect(text.toLowerCase()).not.toContain('overdue')
    expect(text).toContain('Jan 15')
    expect(btn.style.color).not.toContain('maroon')
  })
  it('not done + past date: Nd overdue in maroon', () => {
    const btn = mount(false)
    expect(btn.textContent).toMatch(/\d+d overdue/)
    expect(btn.style.color).toContain('maroon')
  })
})
