// schema-v156 (2026-11-03): switching a task's kind writes { kind } and
// nothing else. Under v152 the picker also rewrote the title to add or keep a
// stored "Check in: " prefix (kindChangeFields); the label now comes from kind,
// so a kind flip must never touch the title.
//
// Real Chromium (vitest.config.ts browser mode): the real TaskInlineFieldRow,
// the real GhostSelect menu, a real click on the option.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskInlineFieldRow } from '../components/tasks/detail/FieldControls'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })) })
afterEach(() => { vi.unstubAllGlobals() })

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))

describe('kind picker', () => {
  for (const [from, to, label] of [['task', 'checkin', 'Check-in'], ['checkin', 'task', 'Task'], ['task', 'milestone', 'Milestone']] as const) {
    it(`${from} -> ${to} sends exactly { kind: '${to}' }`, async () => {
      const sent: Array<Record<string, unknown>> = []
      const host = await mount(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <TaskInlineFieldRow
            status="todo" priority="medium" kind={from} projectId={null} dueDate={null}
            onUpdate={(f) => { sent.push(f) }} onOpenEditor={() => {}}
          />
        </QueryClientProvider>,
        { ready: (h) => h.querySelector('button[aria-label="Kind"]'), label: `kind ${from}->${to}` },
      )
      host.querySelector<HTMLButtonElement>('button[aria-label="Kind"]')!.click()
      await tick()
      const opt = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.trim().startsWith(label))
      expect(opt, `option ${label}`).toBeTruthy()
      opt!.click()
      await tick()
      expect(sent).toEqual([{ kind: to }])
    })
  }
})
