// Regression coverage for backlog #1118 — SmartCompose's file-attach path.
//
// Three claims went into that row; each gets its own test here:
//   1. multi-file parity   — a paste (or the file picker) carrying more than
//      one file used to silently keep only the first (`files?.[0]`,
//      `items.find(kind==='file')`). Fixed via a FIFO upload queue + a
//      `multiple` file input.
//   2. race 1 (uploading)  — the shared `uploading` boolean used to clear on
//      whichever upload finished first, even with a sibling still in flight.
//      Fixed by serializing all uploads through the same queue, so exactly
//      one upload is ever in flight per component instance and `uploading`
//      only clears once the queue is empty.
//   3. race 2 (stale val)  — a controlled SmartCompose's async insert
//      resolved a functional update against the `val` captured when the
//      upload STARTED, discarding anything the user typed while it was in
//      flight. Fixed with a `valRef` mirror read at insert time instead of a
//      closed-over variable.
//
// Runs in real Chromium (vitest.config.ts browser mode). Mounts with
// react-dom directly — the repo carries no testing-library.
//
// Run: npx vitest run src/__tests__/smart-compose-upload.test.tsx

import { describe, it, expect, afterEach, vi } from 'vitest'
import { useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SmartCompose from '../components/SmartCompose'
import { uploadFileToR2 } from '../lib/r2Upload'

vi.mock('../lib/r2Upload', () => ({
  uploadFileToR2: vi.fn(),
}))

const mockedUpload = vi.mocked(uploadFileToR2)

let mounted: { host: HTMLElement; root: Root }[] = []

async function mount(node: ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(node)
  mounted.push({ host, root })
  // React 19 commits asynchronously; poll rather than assume one tick is enough.
  for (let i = 0; i < 100; i++) {
    if (host.querySelector('textarea')) return host
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('SmartCompose never rendered')
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`waitFor timed out: ${label}`)
}

afterEach(() => {
  for (const { host, root } of mounted) {
    root.unmount()
    host.remove()
  }
  mounted = []
  vi.unstubAllGlobals()
  mockedUpload.mockReset()
})

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

function renderQuery(node: ReactElement): Promise<HTMLElement> {
  // useTeamSlugs (inside MentionInput) fires a real fetch on mount.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as Response))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mount(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>)
}

function pasteFiles(textarea: HTMLTextAreaElement, files: File[]) {
  const dt = new DataTransfer()
  for (const f of files) dt.items.add(f)
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: dt })
  textarea.dispatchEvent(event)
}

function setNativeValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function ControlledHarness({ onValue }: { onValue: (v: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <SmartCompose
      onSubmit={async () => {}}
      value={value}
      onChange={(next) => { setValue(next); onValue(next) }}
      uploadContext={{ type: 'project', id: 'proj-1' }}
      alwaysShowToolbar
    />
  )
}

describe('SmartCompose file attach (#1118)', () => {
  it('the file picker allows selecting more than one file (parity with OverviewQuickAdd)', async () => {
    const host = await renderQuery(
      <SmartCompose
        onSubmit={async () => {}}
        uploadContext={{ type: 'project', id: 'proj-1' }}
        alwaysShowToolbar
      />,
    )
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input.multiple).toBe(true)
  })

  it('pasting multiple files uploads every one of them, not just the first', async () => {
    const d1 = deferred<{ url: string; key: string }>()
    const d2 = deferred<{ url: string; key: string }>()
    mockedUpload.mockImplementation((file: File) =>
      file.name === 'first.txt' ? d1.promise : d2.promise,
    )

    const host = await renderQuery(
      <SmartCompose
        onSubmit={async () => {}}
        uploadContext={{ type: 'project', id: 'proj-1' }}
        alwaysShowToolbar
      />,
    )
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!
    const fileA = new File(['a'], 'first.txt', { type: 'text/plain' })
    const fileB = new File(['b'], 'second.txt', { type: 'text/plain' })
    pasteFiles(textarea, [fileA, fileB])

    // Queue serializes uploads (one in flight at a time — also the race-1
    // fix), so the second file's upload doesn't start until the first
    // resolves. Resolve both and confirm BOTH were actually requested.
    await waitFor(() => mockedUpload.mock.calls.length >= 1, 'first upload requested')
    expect(mockedUpload.mock.calls[0][0].name).toBe('first.txt')
    d1.resolve({ url: '/files/first', key: 'k1' })

    await waitFor(() => mockedUpload.mock.calls.length >= 2, 'second upload requested')
    expect(mockedUpload.mock.calls[1][0].name).toBe('second.txt')
    d2.resolve({ url: '/files/second', key: 'k2' })

    await waitFor(() => textarea.value.includes('first') && textarea.value.includes('second'), 'both links inserted')
  })

  it('uploading stays true until every queued file finishes, not just the fastest one', async () => {
    const d1 = deferred<{ url: string; key: string }>()
    const d2 = deferred<{ url: string; key: string }>()
    mockedUpload.mockImplementation((file: File) =>
      file.name === 'first.txt' ? d1.promise : d2.promise,
    )

    const host = await renderQuery(
      <SmartCompose
        onSubmit={async () => {}}
        uploadContext={{ type: 'project', id: 'proj-1' }}
        alwaysShowToolbar
      />,
    )
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!
    const attachBtn = () => host.querySelector<HTMLButtonElement>('button[aria-label="Attach file"]')!

    pasteFiles(textarea, [
      new File(['a'], 'first.txt', { type: 'text/plain' }),
      new File(['b'], 'second.txt', { type: 'text/plain' }),
    ])

    await waitFor(() => mockedUpload.mock.calls.length >= 1, 'first upload requested')
    await waitFor(() => attachBtn().disabled === true, 'attach disabled while first file uploads')

    // First file finishes; second is still queued/in-flight — the old bug
    // cleared `uploading` right here, re-enabling Attach mid-batch.
    d1.resolve({ url: '/files/first', key: 'k1' })
    await waitFor(() => mockedUpload.mock.calls.length >= 2, 'second upload requested')
    expect(attachBtn().disabled).toBe(true)

    // Second (last) file finishes — only now should uploading clear.
    d2.resolve({ url: '/files/second', key: 'k2' })
    await waitFor(() => attachBtn().disabled === false, 'attach re-enabled once queue drains')
  })

  it('a controlled insert that resolves after further typing keeps the typed text', async () => {
    const upload = deferred<{ url: string; key: string }>()
    mockedUpload.mockImplementation(() => upload.promise)

    let latestValue = ''
    const host = await renderQuery(<ControlledHarness onValue={(v) => { latestValue = v }} />)
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!

    pasteFiles(textarea, [new File(['a'], 'shot.txt', { type: 'text/plain' })])
    await waitFor(() => mockedUpload.mock.calls.length >= 1, 'upload requested')

    // User keeps typing while the upload is still in flight.
    setNativeValue(textarea, 'meanwhile I kept typing')
    await waitFor(() => latestValue === 'meanwhile I kept typing', 'typed text committed')

    // Upload finishes; insertAtCursor's functional update must read the
    // value as of NOW, not the empty string captured when the paste fired.
    upload.resolve({ url: '/files/shot', key: 'k1' })
    await waitFor(() => latestValue.includes('shot'), 'markdown link inserted')

    expect(latestValue.startsWith('meanwhile I kept typing')).toBe(true)
    expect(latestValue).toContain('shot')
  })
})
