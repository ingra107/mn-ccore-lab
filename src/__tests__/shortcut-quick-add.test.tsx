// `c` opens the one quick-add in place (Rule 63d). It used to navigate to
// My Tasks with ?create=true and open a second create form there. `n` is not
// a global key: Ideas and Decisions own their local n.
import { describe, it, expect } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { QUICK_ADD_EVENT } from '../components/GlobalQuickAddModal'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

function Probe() {
  useKeyboardShortcuts()
  const loc = useLocation()
  return <span data-testid="where">{loc.pathname + loc.search}</span>
}

const press = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

describe('global create shortcuts', () => {
  it('c opens quick add where you are, and does not navigate', async () => {
    const host = await mount(
      <MemoryRouter initialEntries={['/portal/calendar']}><Probe /></MemoryRouter>,
      { ready: (h) => h.querySelector('[data-testid="where"]'), label: 'probe' },
    )
    let opened = 0
    const on = () => { opened++ }
    window.addEventListener(QUICK_ADD_EVENT, on)
    try {
      press('c')
      expect(opened).toBe(1)
      await new Promise((r) => setTimeout(r, 50))
      expect(host.querySelector('[data-testid="where"]')!.textContent).toBe('/portal/calendar')
    } finally { window.removeEventListener(QUICK_ADD_EVENT, on) }
  })

  it('n does nothing globally', async () => {
    const host = await mount(
      <MemoryRouter initialEntries={['/portal/my-tasks']}><Probe /></MemoryRouter>,
      { ready: (h) => h.querySelector('[data-testid="where"]'), label: 'probe' },
    )
    let opened = 0
    const on = () => { opened++ }
    window.addEventListener(QUICK_ADD_EVENT, on)
    try {
      press('n')
      await new Promise((r) => setTimeout(r, 50))
      expect(opened).toBe(0)
      expect(host.querySelector('[data-testid="where"]')!.textContent).toBe('/portal/my-tasks')
    } finally { window.removeEventListener(QUICK_ADD_EVENT, on) }
  })
})
