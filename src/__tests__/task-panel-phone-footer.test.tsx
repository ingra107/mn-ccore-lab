// The task panel (visual audit 2, H4 M2 M5), real panel, real index.css, real Chromium.
//  - On a phone the Complete bar sits at the bottom on every tab. It was sticky in
//    a column that did not fill the sheet, so it rode up with short tabs.
//  - The assignee is with the other fields, not under the activity feed.
//  - Created and Source each show once, and an empty Short title is not on the
//    first screen.
import '../index.css'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { page } from 'vitest/browser'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import TaskDetailPanel from '../components/tasks/TaskDetailPanel'
import { UndoToastProvider } from '../components/UndoToast'
import type { TaskRow } from '../lib/api'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const task = (over: Partial<TaskRow> = {}) => ({
  id: 'task_p1', title: 'A short task', status: 'todo', priority: 'medium',
  assignee: 'nick-ingraham', completed: 0, description: '', project_id: null, due_date: null,
  source: 'manual', created_at: '2026-11-01 00:00:00', watchers: null, ...over,
} as unknown as TaskRow)

function renderPanel() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  return mount(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><UndoToastProvider><TaskDetailPanel task={task()} onClose={() => {}} /></UndoToastProvider></MemoryRouter>
    </QueryClientProvider>,
    { ready: () => document.querySelector('[data-testid="task-detail-panel"]'), label: 'panel' },
  )
}
const panel = () => document.querySelector<HTMLElement>('[data-testid="task-detail-panel"]')!
const tab = (name: string) => [...panel().querySelectorAll<HTMLElement>('[role="tablist"] button,[role="tab"],[role="radio"]')].find((b) => b.textContent?.trim().startsWith(name))
const visibleText = () => panel().innerText

describe('task panel on a phone', () => {
  it('keeps the Complete bar at the bottom on every tab', async () => {
    await page.viewport(390, 844)
    await renderPanel()
    const bar = () => panel().querySelector<HTMLElement>('.task-detail-done-bar')!
    for (const name of ['Overview', 'Intelligence', 'Activity', 'Files', 'Details']) {
      tab(name)!.click()
      await expect.poll(() => Math.round(bar().getBoundingClientRect().bottom), { message: name }).toBe(844)
    }
  })
})

describe('task panel fields', () => {
  it('has the assignee above the composer, with the other fields', async () => {
    await page.viewport(1440, 900)
    await renderPanel()
    const assignee = panel().querySelector<HTMLElement>('button[aria-label^="Assignee:"]')!
    const status = panel().querySelector<HTMLElement>('[aria-label="Status"]')!
    const composer = panel().querySelector<HTMLElement>('textarea')!
    expect(assignee.getBoundingClientRect().bottom).toBeLessThan(composer.getBoundingClientRect().top)
    expect(Math.abs(assignee.getBoundingClientRect().top - status.getBoundingClientRect().top)).toBeLessThan(60)
  })

  it('states Created and Source once each, and keeps an empty Short title on Details', async () => {
    await page.viewport(1440, 900)
    await renderPanel()
    expect(visibleText()).not.toMatch(/Short title/)
    expect(visibleText()).not.toMatch(/manual/)
    expect(visibleText().match(/Created /g)).toHaveLength(1)
    tab('Details')!.click()
    await expect.poll(() => visibleText()).toMatch(/Short title/)
    expect(visibleText().match(/Created /g)).toHaveLength(1)
    expect(visibleText().match(/manual/g)).toHaveLength(1)
  })
})
