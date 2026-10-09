// CardRow keyboard contract (Today round 2 review): the card header is the one
// focus owner. It is a button with aria-expanded, Enter and Space expand it,
// and a key pressed on an inner control does not.
//
// Runs in real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardRow } from './TaskCardRow'
import type { TaskRow } from '../../lib/api'

let mounted: { host: HTMLElement; root: Root }[] = []
afterEach(() => {
  for (const { host, root } of mounted) { root.unmount(); host.remove() }
  mounted = []
})

const task = {
  id: 't1', title: 'Draft methods', short_title: null, description: '', assignee: 'nick-ingraham',
  assigned_by: null, watchers: null, due_date: null, priority: 'medium', status: 'todo',
  completed: 0, completed_at: null, project_id: null, group_override: null, acknowledged_at: '2026-01-01',
} as unknown as TaskRow

function mount(onToggleExpand: () => void, isExpanded = false, onAncestorKey: () => void = () => {}): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  root.render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <div className="tk" onKeyDown={onAncestorKey}>
          <CardRow card task={task} project={null} isDone={false} onToggleDone={() => {}} isExpanded={isExpanded} onToggleExpand={onToggleExpand} />
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return host
}

async function header(host: HTMLElement): Promise<HTMLElement> {
  for (let i = 0; i < 100; i++) {
    const el = host.querySelector<HTMLElement>('.tk-tch')
    if (el) return el
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('header never rendered')
}

const key = (target: HTMLElement, k: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

describe('CardRow header keyboard contract', () => {
  it('is a focusable button that reports expanded state', async () => {
    const h = await header(mount(() => {}, true))
    expect(h.getAttribute('role')).toBe('button')
    expect(h.tabIndex).toBe(0)
    expect(h.getAttribute('aria-expanded')).toBe('true')
  })

  it('Enter and Space expand, and stop before a dnd-kit activator above it', async () => {
    let n = 0
    let leaked = 0
    const host = mount(() => { n++ }, false, () => { leaked++ })
    const h = await header(host)
    key(h, 'Enter')
    key(h, ' ')
    expect(n).toBe(2)
    key(h, 'a')
    expect(n).toBe(2)
    expect(leaked).toBe(1) // only the ignored 'a' reaches a React ancestor (where dnd-kit listens); Enter/Space stop at the header
  })

  it('a key on the done box does not expand the card', async () => {
    let n = 0
    const h = await header(mount(() => { n++ }))
    key(h.querySelector<HTMLElement>('button.tk-ck')!, 'Enter')
    expect(n).toBe(0)
  })

  it('has exactly one focusable ancestor-level stop above the controls (no role on the wrapper)', async () => {
    const host = mount(() => {})
    await header(host)
    expect(host.querySelectorAll('[role="button"]').length).toBe(1)
  })
})
