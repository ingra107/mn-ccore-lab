// The My Tasks bulk action that soft-deletes says Delete: Nick chose the plain word
// over Archive, 2026-11-05. The behaviour (action 'delete') did not change.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { BulkBar } from '../pages/MyTasks/components/BulkBar'
import { bulkDeleteCopy } from '../pages/MyTasks/constants'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.restoreAllMocks() })

describe('My Tasks bulk Delete', () => {
  it('the bar offers Delete and no Archive, and the button runs the action', async () => {
    const onDelete = vi.fn()
    const host = await mount(
      <BulkBar count={2} onClear={() => {}} onPlanToday={() => {}} commonDue={null} onSetDue={() => {}} onComplete={() => {}}
        onDelete={onDelete} onReassign={() => {}} onPriority={() => {}} onStatus={() => {}} assigneeOptions={[]} />,
      { ready: (h) => h.querySelector('button'), label: 'the bar' },
    )
    const buttons = [...host.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent?.trim())).not.toContain('Archive')
    buttons.find((b) => b.textContent?.trim() === 'Delete')!.click()
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it.each([[1, 'task'], [3, 'tasks']])('the confirm and toast say Delete for %i', (n, noun) => {
    const words = bulkDeleteCopy(n)
    expect(words.confirm.startsWith(`Delete ${n} ${noun}?`)).toBe(true)
    expect(words.toast).toBe(`Deleted ${n} ${noun}`)
    expect(`${words.confirm} ${words.toast}`).not.toMatch(/archive/i)
  })
})
