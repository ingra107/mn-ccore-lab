// Overnight 2026-10-14 mobile pass (Tasks lane): the task panel and the bits
// of My Tasks a phone could not reach. Each test pins one mechanism the prod
// probe found broken:
//   - TaskDetailPanel mounted inside a transformed box drew inside it
//     (position:fixed is laid out against a transformed ancestor).
//   - Escape with a menu open inside the panel closed the whole panel.
//   - PageTransition's exiting copy rendered the NEXT page once, so the page
//     mounted twice and lost a consumed ?create=true.
//   - A touch long-press never selected (mouse-only timers).
//   - The phone view picker showed no active segment for ?view=columns.
//   - Bulk Delete's armed state never disarmed.
//
// Runs in real Chromium (vitest.config.ts browser mode).
// Run: npx vitest run --config vitest.config.ts src/__tests__/task-panel-mobile.test.tsx

import { describe, it, expect, afterEach, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import TaskDetailPanel from '../components/tasks/TaskDetailPanel'
import PageTransition from '../components/PageTransition'
import { UndoToastProvider } from '../components/UndoToast'
import BulkActionToolbar from '../components/tasks/BulkActionToolbar'
import { ViewPicker } from '../pages/MyTasks/components/ViewPicker'
import { useLongPress } from '../hooks/useLongPress'
import { useBackToClose } from '../hooks/useBackToClose'
import { SleekTable, SleekRow, type SleekColumn } from '../components/table/SleekRows'
import type { TaskRow } from '../lib/api'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const task = {
  id: 'task_test_1', title: 'Write the panel test', status: 'todo', priority: 'medium',
  assignee: 'nick-ingraham', completed: 0, description: '', project_id: null, due_date: null,
} as unknown as TaskRow

function panelTree(onClose: () => void) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UndoToastProvider>
          {/* A transformed ancestor, like a virtualizer row or a grid widget. */}
          <div data-testid="transformed" style={{ transform: 'translateY(40px)', width: 200, height: 50, overflow: 'hidden' }}>
            <TaskDetailPanel task={task} onClose={onClose} />
          </div>
        </UndoToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('TaskDetailPanel', () => {
  it('portals to <body>, so a transformed ancestor cannot capture it', async () => {
    await mount(panelTree(() => {}), { ready: () => document.querySelector('[data-testid="task-detail-panel"]'), label: 'panel' })
    const panel = document.querySelector<HTMLElement>('[data-testid="task-detail-panel"]')!
    const box = document.querySelector('[data-testid="transformed"]')!
    expect(box.contains(panel)).toBe(false)
    expect(panel.parentElement).toBe(document.body)
    const backdrop = document.querySelector<HTMLElement>('[data-testid="detail-backdrop"]')!
    expect(box.contains(backdrop)).toBe(false)
  })

  it('an Escape a menu already consumed leaves the panel open; a plain Escape closes it', async () => {
    const onClose = vi.fn()
    await mount(panelTree(onClose), { ready: () => document.querySelector('[data-testid="task-detail-panel"] button'), label: 'panel' })
    const btn = document.querySelector<HTMLElement>('[data-testid="close-detail-panel"]')
      ?? document.querySelector<HTMLElement>('[data-testid="task-detail-panel"] button')!
    const escape = () => btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    // The panel's document listener lands in a passive effect after commit:
    // wait until a plain Escape reaches it, so the checks below are not vacuous.
    await expect.poll(() => { escape(); return onClose.mock.calls.length > 0 }).toBe(true)
    onClose.mockClear()
    // A menu's own handler runs first and calls preventDefault (GhostSelect).
    const consume = (e: Event) => e.preventDefault()
    btn.addEventListener('keydown', consume)
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(onClose).not.toHaveBeenCalled()
    btn.removeEventListener('keydown', consume)
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('useBackToClose', () => {
  function Overlay({ onClose }: { onClose: () => void }) {
    useBackToClose(onClose, true)
    return <p data-testid="overlay">open</p>
  }

  it('Back closes the overlay', async () => {
    const onClose = vi.fn()
    function Host() {
      const [open, setOpen] = useState(true)
      return open ? <><Overlay onClose={() => { onClose(); setOpen(false) }} /><button data-testid="x" onClick={() => setOpen(false)}>x</button></> : <p data-testid="closed">closed</p>
    }
    const host = await mount(<Host />, { ready: (h) => h.querySelector('[data-testid="overlay"]'), label: 'overlay' })
    await expect.poll(() => (history.state as { overlay?: string } | null)?.overlay).toBeTruthy()
    history.back()
    await expect.poll(() => onClose.mock.calls.length).toBe(1)
    await waitFor(() => host.querySelector('[data-testid="closed"]'), 'closed by Back')
  })

  it('closing it another way steps back off its entry', async () => {
    function Host() {
      const [open, setOpen] = useState(true)
      return open ? <><Overlay onClose={() => setOpen(false)} /><button data-testid="x" onClick={() => setOpen(false)}>x</button></> : <p data-testid="closed">closed</p>
    }
    const host = await mount(<Host />, { ready: (h) => h.querySelector('[data-testid="overlay"]'), label: 'overlay' })
    await expect.poll(() => (history.state as { overlay?: string } | null)?.overlay).toBeTruthy()
    host.querySelector<HTMLElement>('[data-testid="x"]')!.click()
    await expect.poll(() => (history.state as { overlay?: string } | null)?.overlay).toBeUndefined()
  })

  it('closing one overlay and opening the next does not close the new one', async () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    function Host() {
      const [which, setWhich] = useState<'a' | 'b'>('a')
      return (
        <>
          {which === 'a' ? <Overlay key="a" onClose={closeA} /> : <Overlay key="b" onClose={closeB} />}
          <button data-testid="swap" onClick={() => setWhich('b')}>swap</button>
        </>
      )
    }
    const host = await mount(<Host />, { ready: (h) => h.querySelector('[data-testid="overlay"]'), label: 'overlay A' })
    await expect.poll(() => (history.state as { overlay?: string } | null)?.overlay).toBeTruthy()
    const markerA = (history.state as { overlay: string }).overlay
    host.querySelector<HTMLElement>('[data-testid="swap"]')!.click()
    // B pushes its own entry only after A's step-back lands.
    await expect.poll(() => (history.state as { overlay?: string } | null)?.overlay).not.toBe(markerA)
    await expect.poll(() => (history.state as { overlay?: string } | null)?.overlay).toBeTruthy()
    await new Promise((r) => setTimeout(r, 200))
    expect(closeA).not.toHaveBeenCalled()
    expect(closeB).not.toHaveBeenCalled()
  })
})

describe('PageTransition', () => {
  it('mounts the next page once (the exiting copy keeps the old page)', async () => {
    let mountsB = 0
    function PageB() {
      useEffect(() => { mountsB += 1 }, [])
      return <p data-testid="page-b">B</p>
    }
    function Shell() {
      const location = useLocation()
      return (
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={location.pathname} transitionKey={location.pathname} />
        </AnimatePresence>
      )
    }
    const host = await mount(
      <MemoryRouter initialEntries={['/a']}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/a" element={<Link to="/b?create=true" data-testid="go">go</Link>} />
            <Route path="/b" element={<PageB />} />
          </Route>
        </Routes>
      </MemoryRouter>,
      { ready: (h) => h.querySelector('[data-testid="go"]'), label: 'page A' },
    )
    host.querySelector<HTMLElement>('[data-testid="go"]')!.click()
    await waitFor(() => host.querySelector('[data-testid="page-b"]') && !host.querySelector('[data-testid="go"]'), 'page B alone')
    // Let any trailing exit/enter settle before counting.
    await new Promise((r) => setTimeout(r, 300))
    expect(mountsB).toBe(1)
  })
})

describe('useLongPress', () => {
  it('a touch hold fires once and swallows the click that ends it', async () => {
    const fired = vi.fn()
    const clicked = vi.fn()
    function Row() {
      const bind = useLongPress(() => fired(), { thresholdMs: 100, mouse: true })
      return <div data-testid="row" {...bind} onClick={clicked} style={{ width: 100, height: 40 }}>row</div>
    }
    const host = await mount(<Row />, { ready: (h) => h.querySelector('[data-testid="row"]'), label: 'row' })
    const row = host.querySelector<HTMLElement>('[data-testid="row"]')!
    const touch = new Touch({ identifier: 1, target: row, clientX: 10, clientY: 10 })
    row.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true }))
    await expect.poll(() => fired.mock.calls.length).toBe(1)
    row.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touch], bubbles: true, cancelable: true }))
    row.click()
    expect(clicked).not.toHaveBeenCalled()
    // A later ordinary tap is a click again.
    row.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true }))
    row.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touch], bubbles: true, cancelable: true }))
    row.click()
    expect(clicked).toHaveBeenCalledTimes(1)
    expect(fired).toHaveBeenCalledTimes(1)
  })
})

describe('SleekRow long-press', () => {
  it('a touch hold calls onLongPress and the row click does not follow', async () => {
    const onLongPress = vi.fn()
    const onClick = vi.fn()
    const cols: SleekColumn<{ id: string }>[] = [{ key: 'title', width: '1fr', phone: 'title', render: (r) => r.id }]
    const host = await mount(
      <SleekTable columns={cols} header={false}>
        <SleekRow row={{ id: 'r1' }} onClick={onClick} onLongPress={onLongPress} />
      </SleekTable>,
      { ready: (h) => h.querySelector('[role="row"]'), label: 'sleek row' },
    )
    const row = host.querySelector<HTMLElement>('[role="row"]')!
    const touch = new Touch({ identifier: 2, target: row, clientX: 5, clientY: 5 })
    row.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true }))
    await expect.poll(() => onLongPress.mock.calls.length, { timeout: 2000 }).toBe(1)
    row.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touch], bubbles: true, cancelable: true }))
    row.click()
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('ViewPicker on a phone', () => {
  it('shows List active for a stored desktop view', async () => {
    function Picker() {
      const [v, setV] = useState<'columns' | 'list' | 'table' | 'lanes' | 'board'>('columns')
      return <ViewPicker view={v} setView={setV} isPhone />
    }
    const host = await mount(<Picker />, { ready: (h) => h.querySelector('[role="tab"]'), label: 'picker' })
    const active = [...host.querySelectorAll('[role="tab"]')].filter((t) => t.getAttribute('aria-selected') === 'true')
    expect(active.map((t) => t.textContent)).toEqual(['List'])
  })
})

describe('BulkActionToolbar delete', () => {
  it('arms with a count, then disarms itself', async () => {
    const tasks = [{ id: 't1', completed: false }] as unknown as TaskRow[]
    const host = await mount(
      <BulkActionToolbar selectedIds={new Set(['t1'])} selectedTasks={tasks} onClear={() => {}} onBulkAction={() => {}} isUpdating={false} />,
      { ready: (h) => h.querySelectorAll('button').length >= 6, label: 'toolbar' },
    )
    const del = () => [...host.querySelectorAll('button')].find((b) => /^Delete/.test((b.textContent ?? '').trim()))!
    del().click()
    await expect.poll(() => del().textContent?.trim()).toBe('Delete 1?')
    await expect.poll(() => del().textContent?.trim(), { timeout: 7000 }).toBe('Delete')
  })
})
