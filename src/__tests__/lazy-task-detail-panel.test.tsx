// The task editor loads on demand through LazyTaskDetailPanel (2026-10-14).
// Pins the wrapper's contract with its 8 callers: props reach the real panel,
// the panel's mount effects (where its focus trap runs) still fire once the
// chunk arrives, and the wrapper's own Suspense keeps the page around it on
// screen while it loads. The stub records its mount effect instead of moving
// focus: browser-mode files share one Chromium, and a test that takes focus
// can steal it from a neighbour that relies on autoFocus.
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
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => { ref.current?.setAttribute('data-mounted', 'yes') }, [])
    return (
      <div ref={ref} role="dialog" data-task={task.id}>
        <button onClick={onClose}>Close</button>
      </div>
    )
  },
}))

cleanupMountsAfterEach()

describe('LazyTaskDetailPanel', () => {
  it('passes props through, runs mount effects, and leaves the page rendered', async () => {
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
    await expect.poll(() => dialog.dataset.mounted).toBe('yes')
    dialog.querySelector('button')!.click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
