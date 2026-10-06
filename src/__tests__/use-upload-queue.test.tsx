// useUploadQueue (src/lib/useUploadQueue.ts) on unmount. A composer closed
// mid-batch used to keep draining its queue: every file still waiting was
// uploaded to R2 with nothing left to insert its link, an orphan attachment.
// Unmount now drops the waiting files; only the one already in flight finishes.
//
// Runs in real Chromium (vitest.config.ts browser mode).
// Run: npx vitest run --config vitest.config.ts src/__tests__/use-upload-queue.test.tsx

import { describe, it, expect, vi } from 'vitest'
import { useEffect } from 'react'
import { useUploadQueue } from '../lib/useUploadQueue'
import { mount, unmountAll, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => { resolve = res })
  return { promise, resolve }
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`waitFor timed out: ${label}`)
}

function Harness({ worker, files }: { worker: (f: File) => Promise<void>; files: File[] }) {
  const { enqueue, uploading } = useUploadQueue(worker)
  useEffect(() => { enqueue(files) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <span data-uploading={uploading ? 'yes' : 'no'}>q</span>
}

describe('useUploadQueue', () => {
  it('unmount drops the waiting files; only the in-flight one finishes', async () => {
    const first = deferred()
    const worker = vi.fn((f: File) => (f.name === 'a.txt' ? first.promise : Promise.resolve()))
    const files = ['a.txt', 'b.txt', 'c.txt'].map((n) => new File([n], n, { type: 'text/plain' }))
    await mount(<Harness worker={worker} files={files} />, { ready: (h) => h.querySelector('span'), label: 'Harness' })
    await waitFor(() => worker.mock.calls.length === 1, 'first file started')

    unmountAll()
    first.resolve()
    await new Promise((r) => setTimeout(r, 50))
    expect(worker).toHaveBeenCalledTimes(1)
  })

  it('drains every file in order while mounted and clears uploading at the end', async () => {
    const order: string[] = []
    const worker = vi.fn(async (f: File) => { order.push(f.name) })
    const files = ['a.txt', 'b.txt', 'c.txt'].map((n) => new File([n], n, { type: 'text/plain' }))
    const host = await mount(<Harness worker={worker} files={files} />, { ready: (h) => h.querySelector('span'), label: 'Harness' })
    await waitFor(() => order.length === 3, 'all three drained')
    expect(order).toEqual(['a.txt', 'b.txt', 'c.txt'])
    await waitFor(() => host.querySelector('span')!.dataset.uploading === 'no', 'uploading cleared')
  })
})
