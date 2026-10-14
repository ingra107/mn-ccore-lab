// Overnight 2026-10-14 mobile pass (Tasks lane), cold-review follow-up: the
// changes the first commit only read as correct, now run at a phone width in
// real Chromium with the app stylesheet loaded.
//   - Undo toasts sit above the 56px tab bar and inside the screen.
//   - The My Tasks top bar keeps Create Task on screen at 390px.
//   - The task panel's swipe-to-close ignores a swipe that starts at the left
//     edge (the OS back gesture) and still works from further in.
//   - My Tasks keeps ?assignee=, asks the server for that member's tasks,
//     and "Show mine" goes back to the viewer's own list.
//
// Run: npx vitest run --config vitest.config.ts src/__tests__/tasks-phone-layout.test.tsx

import '../index.css'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { useEffect, type ReactNode } from 'react'
import { page } from 'vitest/browser'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AuthContext } from '../hooks/useAuth'
import { UndoToastProvider, useUndoToast } from '../components/UndoToast'
import TaskDetailPanel from '../components/tasks/TaskDetailPanel'
import { TopBar } from '../pages/MyTasks/components/TopBar'
import MyTasks from '../pages/MyTasks'
import type { TaskRow } from '../lib/api'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(async () => {
  vi.unstubAllGlobals()
  await page.viewport(1280, 900)
})

const user = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true, isMember: true,
  canShowAllProjects: false, piResolved: true,
}

function stubFetch() {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    urls.push(String(url))
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response
  }))
  return urls
}

function tree(node: ReactNode, initial = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false } as never}>
        <MemoryRouter initialEntries={[initial]}>
          <UndoToastProvider>{node}</UndoToastProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

const toastReady = () => document.querySelector('[data-testid="toast-container"] > div')

describe('Undo toast placement', () => {
  function Fire() {
    const { showUndo } = useUndoToast()
    useEffect(() => { showUndo('Completed task', () => {}) }, [showUndo])
    return null
  }

  it('on a phone it sits above the tab bar and inside the screen', async () => {
    await page.viewport(390, 844)
    stubFetch()
    await mount(tree(<Fire />), { ready: toastReady, label: 'toast' })
    const r = document.querySelector<HTMLElement>('[data-testid="toast-container"] > div')!.getBoundingClientRect()
    // MobileTabBar is 56px tall at the bottom; --fab-base lifts to 72px.
    expect(r.bottom).toBeLessThanOrEqual(844 - 56)
    expect(r.left).toBeGreaterThanOrEqual(16)
    expect(r.right).toBeLessThanOrEqual(390 - 16)
    expect(r.width).toBeGreaterThanOrEqual(240)
  })

  it('on a desktop it keeps the 24px base', async () => {
    stubFetch()
    await mount(tree(<Fire />), { ready: toastReady, label: 'toast' })
    const container = document.querySelector<HTMLElement>('[data-testid="toast-container"]')!
    expect(Math.round(900 - container.getBoundingClientRect().bottom)).toBe(24)
  })
})

describe('My Tasks top bar on a phone', () => {
  const createButton = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Create Task'))

  it('Create Task and search both fit at 390px with no sideways scroll', async () => {
    await page.viewport(390, 844)
    stubFetch()
    const onCreate = vi.fn()
    await mount(tree(
      <TopBar
        view="list" setView={() => {}} search="" setSearch={() => {}}
        filter={{ priority: null, project: null, mentee: null, group: null, hideCompleted: true }} setFilter={() => {}}
        quickView="all" setQuickView={() => {}} taskCount={3} projectOptions={[]}
        currentQuery="" onApplyView={() => {}} onCreateTask={onCreate}
      />,
    ), { ready: createButton, label: 'top bar' })
    const create = createButton()!
    const rc = create.getBoundingClientRect()
    expect(rc.width).toBeGreaterThan(0)
    expect(rc.left).toBeGreaterThanOrEqual(0)
    expect(rc.right).toBeLessThanOrEqual(390)
    const search = create.parentElement!.querySelector<HTMLInputElement>('input')!
    const rs = search.getBoundingClientRect()
    expect(rs.right).toBeLessThanOrEqual(390)
    expect(rs.width).toBeGreaterThanOrEqual(80)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
    create.click()
    expect(onCreate).toHaveBeenCalledTimes(1)
  })
})

describe('Task panel swipe on a phone', () => {
  const task = {
    id: 'task_swipe_1', title: 'Swipe me', status: 'todo', priority: 'medium',
    assignee: 'nick-ingraham', completed: 0, description: '', project_id: null, due_date: null,
  } as unknown as TaskRow

  async function swipeFrom(x: number) {
    await page.viewport(390, 844)
    stubFetch()
    const onClose = vi.fn()
    await mount(tree(<TaskDetailPanel task={task} onClose={onClose} />), {
      ready: () => document.querySelector('[data-testid="task-detail-panel"]'), label: 'panel',
    })
    const panel = document.querySelector<HTMLElement>('[data-testid="task-detail-panel"]')!
    // Let the enter animation finish, so the drag starts from rest.
    await new Promise((r) => setTimeout(r, 400))
    const at = (type: string, cx: number, target: EventTarget) =>
      target.dispatchEvent(new PointerEvent(type, {
        pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: 300,
        button: 0, buttons: 1, bubbles: true, cancelable: true,
      }))
    at('pointerdown', x, panel)
    for (let i = 1; i <= 10; i++) {
      at('pointermove', x + i * 25, window)
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    }
    at('pointerup', x + 250, window)
    await new Promise((r) => setTimeout(r, 300))
    return onClose
  }

  it('a swipe from 100px in closes the panel', async () => {
    expect((await swipeFrom(100)).mock.calls.length).toBeGreaterThan(0)
  })

  it('the same swipe from the left edge does not (the OS back gesture owns it)', async () => {
    expect((await swipeFrom(10)).mock.calls.length).toBe(0)
  })
})

describe('My Tasks ?assignee=', () => {
  function Url() {
    const loc = useLocation()
    return <output data-testid="url">{loc.search}</output>
  }
  const showMine = (h: HTMLElement) => [...h.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Show mine')

  it("scopes to that member, says so, and Show mine returns to the viewer's list", async () => {
    const urls = stubFetch()
    const host = await mount(tree(<><MyTasks /><Url /></>, '/tasks?assignee=nate-mesfin'), {
      ready: showMine, label: 'notice',
    })
    expect(host.textContent).toContain("Showing Nathan's tasks")
    const asked = (slug: string) => urls.some((u) => u.includes('/api/tasks') && u.includes(`assignee=${slug}`))
    await expect.poll(() => asked('nate-mesfin')).toBe(true)
    expect(host.querySelector('[data-testid="url"]')!.textContent).toContain('assignee=nate-mesfin')
    showMine(host)!.click()
    await waitFor(() => !host.textContent?.includes("Showing Nathan's tasks"), 'notice gone')
    await expect.poll(() => asked('nick-ingraham')).toBe(true)
    await expect.poll(() => host.querySelector('[data-testid="url"]')!.textContent).not.toContain('assignee=')
  })
})
