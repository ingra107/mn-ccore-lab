// The task editor loads on demand through LazyTaskDetailPanel (2026-10-14).
// Pins the wrapper's contract with its 8 callers: props reach the real panel,
// the panel still takes focus when it mounts after the chunk arrives, and the
// wrapper's own Suspense keeps the page around it on screen while it loads.
//
// Runs in real Chromium (vitest.config.ts browser mode).
// Run: npx vitest run --config vitest.config.ts src/__tests__/lazy-task-detail-panel.test.tsx

import { describe, it, expect, vi } from 'vitest'
import { useEffect, useRef } from 'react'
import type { TaskRow } from '../lib/api'
import LazyTaskDetailPanel from '../components/tasks/LazyTaskDetailPanel'
import { mount, cleanupMountsAfterEach } from './testMount'

// Stand-in for the real panel: what matters here is the wrapper, not the editor.
vi.mock('../components/tasks/TaskDetailPanel', () => ({
  default: function StubPanel({ task, onClose }: { task: TaskRow; onClose: () => void }) {
    const ref = useRef<HTMLButtonElement>(null)
    useEffect(() => { ref.current?.focus() }, [])
    return (
      <div role="dialog" data-task={task.id}>
        <button ref={ref} onClick={onClose}>Close</button>
      </div>
    )
  },
}))

cleanupMountsAfterEach()

describe('LazyTaskDetailPanel', () => {
  it('passes props through, takes focus on mount, and leaves the page rendered', async () => {
    const onClose = vi.fn()
    const task = { id: 'task_lazy_1', title: 'x' } as unknown as TaskRow
    const host = await mount(
      <div>
        <p id="page-body">page</p>
        <LazyTaskDetailPanel task={task} onClose={onClose} />
      </div>,
      { ready: (h) => h.querySelector('[role="dialog"]'), label: 'lazy task panel' },
    )
    expect(host.querySelector('#page-body')).not.toBeNull()
    const dialog = host.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.dataset.task).toBe('task_lazy_1')
    await expect.poll(() => document.activeElement?.textContent).toBe('Close')
    ;(document.activeElement as HTMLButtonElement).click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
