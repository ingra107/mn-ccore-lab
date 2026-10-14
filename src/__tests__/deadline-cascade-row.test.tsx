// Cascade rows (overnight audit 2026-10-14, G4-5 / G4-6): a selected row is
// ringed in the accent, never its status red; Simulate is the accent, not the
// going-stale orange; the row selects through a real title button and is
// itself role-free, so no button nests inside a role=button (axe
// nested-interactive); the chevron has a name.
//
// Real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect } from 'vitest'
import DeadlineCascade from '../components/DeadlineCascade'
import type { CascadeGraph } from '../lib/api'
import { mount, waitFor, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const graph: CascadeGraph = {
  nodes: [
    { id: 'a', type: 'task', title: 'Send out meeting notes', due_date: '2020-01-01', status: 'todo', project_id: 'p', project_title: 'P' },
    { id: 'b', type: 'task', title: 'Draft results', due_date: '2099-01-01', status: 'todo', project_id: 'p', project_title: 'P' },
  ],
  dependencies: [{ upstream_id: 'a', downstream_id: 'b', lag_days: 2 } as CascadeGraph['dependencies'][number]],
}

describe('DeadlineCascade row', () => {
  it('selects by keyboard, rings the selection in the accent and draws Simulate in the accent', async () => {
    const h = await mount(<DeadlineCascade graph={graph} onSimulateImpact={() => {}} />, { ready: (x) => x.querySelector('.cascade-row'), label: 'DeadlineCascade' })
    const row = h.querySelector('.cascade-row') as HTMLElement
    expect(row.hasAttribute('role')).toBe(false)
    expect(row.hasAttribute('tabindex')).toBe(false)
    // No interactive element inside another interactive element.
    expect(h.querySelector('[role="button"] button, button button')).toBeNull()
    expect(h.querySelector('button[aria-expanded][aria-label^="Collapse"]')).not.toBeNull()
    const select = row.querySelector('button.cascade-row-select') as HTMLButtonElement
    expect(select.textContent).toBe('Send out meeting notes')
    expect(select.getAttribute('aria-pressed')).toBe('false')
    select.focus()
    select.click()
    await waitFor(() => select.getAttribute('aria-pressed') === 'true', 'row selected')
    expect(row.style.border).toContain('var(--job-accent)')
    const simulate = await waitFor(() => Array.from(h.querySelectorAll('button')).find((b) => b.textContent === 'Simulate'), 'Simulate button')
    expect(simulate.style.color).toBe('var(--job-accent)')
  })
})
