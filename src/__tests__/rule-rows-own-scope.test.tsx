// #165: the check-in and milestone rows are styled by `.tk .tk-ms ...`, and the
// meeting page mounts the shared row with no `.tk` around it, so a check-in
// read as "Check-inAdams R21 draft revisions5d" with no check box. The row
// carries its own scope, so no surface can render it bare.

import '../index.css'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CheckinRow, MilestoneCardRow } from '../components/tasks/TaskCardRow'
import type { TaskRow } from '../lib/api'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const task = { id: 't', title: 'Adams R21 draft revisions', short_title: null, kind: 'checkin', status: 'todo', completed: 0, due_date: '2026-11-09', assignee: 'nick-ingraham' } as unknown as TaskRow
const noop = () => {}
const bare = (node: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient()}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>
)

describe('rule rows outside a .tk surface (#165)', () => {
  it('a check-in lays out in a row with spaced parts and a drawn check box', async () => {
    const host = await mount(bare(<CheckinRow task={task} project={null} isDone={false} onToggleDone={noop} isExpanded={false} onToggleExpand={noop} />), { ready: (h) => h.querySelector('.tk-ms'), label: 'check-in' })
    expect(getComputedStyle(host.querySelector('.tk-ms')!).display).toBe('flex')
    expect(parseFloat(getComputedStyle(host.querySelector('.tk-ms')!).columnGap)).toBeGreaterThan(0)
    expect(host.querySelector<HTMLElement>('.tk-ck')!.getBoundingClientRect().width).toBe(17)
  })

  it('a milestone lays out in a row too', async () => {
    const host = await mount(bare(<MilestoneCardRow task={{ ...task, kind: 'milestone' } as TaskRow} card project={null} isDone={false} onToggleDone={noop} isExpanded={false} onToggleExpand={noop} />), { ready: (h) => h.querySelector('.tk-ms'), label: 'milestone' })
    expect(getComputedStyle(host.querySelector('.tk-ms')!).display).toBe('flex')
  })
})
