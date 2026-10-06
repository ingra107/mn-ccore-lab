// Regression coverage for backlog #1356 -- OverviewQuickAdd (the task panel's
// quick composer) kept ONE `uploading` boolean and drove it with
// `files.forEach(uploadToCompose)`. A multi-file drop started N independent
// async chains against that one flag: the first chain to finish set it false
// while its siblings were still in flight, so the Attach button re-enabled
// and its spinner stopped mid-batch. The fix routes every file through the
// shared upload queue (src/lib/useUploadQueue.ts), so `uploading` is derived
// from the queue and cannot read false while a file is still pending.
//
// Runs in real Chromium (vitest.config.ts browser mode).
// Run: npx vitest run --config vitest.config.ts src/__tests__/overview-quick-add-upload.test.tsx

import { describe, it, expect, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OverviewQuickAdd } from '../components/tasks/TaskDetailPanel'
import { mount as mountShared, cleanupMountsAfterEach } from './testMount'
import { uploadFileToR2 } from '../lib/r2Upload'

vi.mock('../lib/r2Upload', () => ({
  uploadFileToR2: vi.fn(),
}))

const mockedUpload = vi.mocked(uploadFileToR2)

cleanupMountsAfterEach()

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`waitFor timed out: ${label}`)
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

afterEach(() => {
  vi.unstubAllGlobals()
  mockedUpload.mockReset()
})

function render(node: ReactElement): Promise<HTMLElement> {
  // MentionInput's team lookup fires a real fetch on mount.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as Response))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mountShared(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
    { ready: (h) => h.querySelector('textarea'), label: 'OverviewQuickAdd' },
  )
}

function dropFiles(target: Element, files: File[]) {
  const dt = new DataTransfer()
  for (const f of files) dt.items.add(f)
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
}

function setNativeValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('OverviewQuickAdd file attach (#1356)', () => {
  it('a multi-file drop keeps Attach disabled until the LAST file finishes', async () => {
    const d1 = deferred<{ url: string; key: string }>()
    const d2 = deferred<{ url: string; key: string }>()
    mockedUpload.mockImplementation((file: File) => (file.name === 'first.txt' ? d1.promise : d2.promise))

    const host = await render(<OverviewQuickAdd taskId="task_1" onJumpToTab={() => {}} />)
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!
    // The action row (with Attach) renders only while composing.
    setNativeValue(textarea, 'x')
    const attachBtn = () => host.querySelector<HTMLButtonElement>('button[aria-label="Attach file"]')
    await waitFor(() => attachBtn() !== null, 'action row visible')

    dropFiles(textarea, [
      new File(['a'], 'first.txt', { type: 'text/plain' }),
      new File(['b'], 'second.txt', { type: 'text/plain' }),
    ])
    await waitFor(() => mockedUpload.mock.calls.length >= 1, 'first upload requested')
    await waitFor(() => attachBtn()!.disabled === true, 'attach disabled while uploading')

    // The second file is still pending. Today's code clears the flag here.
    d1.resolve({ url: '/files/first', key: 'k1' })
    await waitFor(() => textarea.value.includes('first.txt'), 'first link appended')
    expect(attachBtn()!.disabled).toBe(true)

    d2.resolve({ url: '/files/second', key: 'k2' })
    await waitFor(() => textarea.value.includes('second.txt'), 'second link appended')
    await waitFor(() => attachBtn()!.disabled === false, 'attach re-enabled once every file is done')
    expect(mockedUpload).toHaveBeenCalledTimes(2)
  })

  it('a paste carrying several files uploads every one, not just the first', async () => {
    mockedUpload.mockImplementation(async (file: File) => ({ url: `/files/${file.name}`, key: file.name }))
    const host = await render(<OverviewQuickAdd taskId="task_1" onJumpToTab={() => {}} />)
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!
    const dt = new DataTransfer()
    dt.items.add(new File(['a'], 'a.txt', { type: 'text/plain' }))
    dt.items.add(new File(['b'], 'b.txt', { type: 'text/plain' }))
    const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(ev, 'clipboardData', { value: dt })
    textarea.dispatchEvent(ev)
    await waitFor(() => textarea.value.includes('a.txt') && textarea.value.includes('b.txt'), 'both links appended')
    expect(mockedUpload).toHaveBeenCalledTimes(2)
  })
})
