// The failed-write floor (lib/writeFailures + UndoToastProvider), overnight
// 2026-10-14 lane H2. A prod audit at 390px found eight write paths that
// failed in silence: the Today check-circle and idea archive kept "Done /
// Undo" up while the row reverted, the Create Task sheet, the decision
// outcome and the Ask reply threw the typed text away, and the decision,
// digest and note writes said nothing at all. All of them shared one gap:
// nothing above the mutation surfaced a failure the caller forgot.
//
// These tests drive the provider through real mutations on a real
// QueryClient (browser mode, react-dom; the repo carries no testing-library).

import { describe, it, expect } from 'vitest'
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { UndoToastProvider, useUndoToast } from '../components/UndoToast'
import {
  INLINE_ERROR_META, failureMessage, linkedMutationIds, reason, specificErrorShown,
} from '../lib/writeFailures'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

async function until(pred: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (pred()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`timed out waiting for ${what}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const refused = () => new Promise((_resolve, reject) => setTimeout(() => reject(new TypeError('Failed to fetch')), 30))
const accepted = () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 30))

type Mode = 'undo-fails' | 'undo-succeeds' | 'caller-toasts' | 'inline' | 'plain-fails'

function Harness({ mode }: { mode: Mode }) {
  const { showUndo, showError } = useUndoToast()
  const write = useMutation({
    mutationFn: mode === 'undo-succeeds' ? accepted : refused,
    ...(mode === 'inline' ? { meta: INLINE_ERROR_META } : {}),
  })
  useEffect(() => {
    if (mode === 'caller-toasts') {
      write.mutate(undefined, { onError: () => showError('Could not archive the idea') })
      return
    }
    write.mutate(undefined)
    if (mode === 'undo-fails' || mode === 'undo-succeeds') showUndo('Task completed', () => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount
  }, [])
  return null
}

async function mountMode(mode: Mode): Promise<HTMLElement> {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return mount(
    <QueryClientProvider client={queryClient}>
      <UndoToastProvider>
        <Harness mode={mode} />
      </UndoToastProvider>
    </QueryClientProvider>,
    { ready: () => true, label: 'Harness' },
  )
}

const errorToasts = (host: HTMLElement) => host.querySelectorAll('[data-testid="error-toast"]')
const undoToasts = (host: HTMLElement) => host.querySelectorAll('[data-testid="undo-toast"]')

describe('failed-write floor', () => {
  it('withdraws the Undo toast of a failed write and names what did not save', async () => {
    const host = await mountMode('undo-fails')
    await until(() => undoToasts(host).length === 1, 'undo toast')
    await until(() => errorToasts(host).length === 1, 'error toast')
    expect(errorToasts(host)[0].textContent).toContain('Did not go through: Task completed. The Hub did not answer; try again.')
    await until(() => undoToasts(host).length === 0, 'undo toast withdrawn')
  })

  it('leaves the Undo toast alone when the write lands', async () => {
    const host = await mountMode('undo-succeeds')
    await sleep(300)
    expect(undoToasts(host).length).toBe(1)
    expect(errorToasts(host).length).toBe(0)
  })

  it('shows a failure the caller forgot', async () => {
    const host = await mountMode('plain-fails')
    await until(() => errorToasts(host).length === 1, 'error toast')
    expect(errorToasts(host)[0].textContent).toContain('Not saved. The Hub did not answer; try again.')
  })

  it("lets the caller's own error toast stand alone", async () => {
    const host = await mountMode('caller-toasts')
    await until(() => errorToasts(host).length === 1, 'caller error toast')
    await sleep(300)
    expect(errorToasts(host).length).toBe(1)
    expect(errorToasts(host)[0].textContent).toContain('Could not archive the idea')
  })

  it('stays out of a mutation that shows its error inline', async () => {
    const host = await mountMode('inline')
    await sleep(300)
    expect(errorToasts(host).length).toBe(0)
  })
})

describe('writeFailures rules', () => {
  it('reason: a 4xx speaks for itself, anything else gets a sentence', () => {
    expect(reason(Object.assign(new Error('Title is required'), { status: 400 }))).toBe('Title is required')
    expect(reason(Object.assign(new Error('boom'), { status: 500 }))).toBe('the Hub did not answer; try again.')
    expect(reason(new TypeError('Failed to fetch'))).toBe('the Hub did not answer; try again.')
  })

  it('failureMessage names the withdrawn Undo when there is one', () => {
    expect(failureMessage(new TypeError('x'), 'Idea → archived')).toBe('Did not go through: Idea → archived. The Hub did not answer; try again.')
    // The digest's Undo label is the outcome word itself; the toast must not contradict it.
    expect(failureMessage(new TypeError('x'), 'Saved')).toBe('Did not go through: Saved. The Hub did not answer; try again.')
    expect(failureMessage(new TypeError('x'))).toBe('Not saved. The Hub did not answer; try again.')
  })

  it('linkedMutationIds keeps only writes submitted beside the toast', () => {
    const ms = [
      { mutationId: 1, state: { submittedAt: 1000 } },
      { mutationId: 2, state: { submittedAt: 1200 } },
      { mutationId: 3, state: { submittedAt: 5000 } },
      { mutationId: 4, state: { submittedAt: 0 } },
    ]
    expect(linkedMutationIds(ms, 1100)).toEqual([1, 2])
  })

  it('specificErrorShown covers a toast just before or after the failure', () => {
    expect(specificErrorShown(950, 1000)).toBe(true)
    expect(specificErrorShown(1050, 1000)).toBe(true)
    expect(specificErrorShown(0, 5000)).toBe(false)
  })
})
