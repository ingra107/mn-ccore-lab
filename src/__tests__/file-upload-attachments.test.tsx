// FileUpload (the attachments drop zone on task, project and meeting pages),
// backlog #1031. It used to carry its own presign/PUT/done chain; it now calls
// the shared uploadFileToR2 through the shared upload queue. Two claims:
//   1. it routes through the shared chain with the entity it was given;
//   2. a failure message stays on screen. Before, the message was written
//      as the upload ended, but the text only rendered while `uploading` was
//      true, so "Upload failed: ..." vanished the instant it was set.
//
// Runs in real Chromium (vitest.config.ts browser mode).
// Run: npx vitest run --config vitest.config.ts src/__tests__/file-upload-attachments.test.tsx

import { describe, it, expect, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FileUpload from '../components/FileUpload'
import { mount, cleanupMountsAfterEach } from './testMount'
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

afterEach(() => {
  vi.unstubAllGlobals()
  mockedUpload.mockReset()
})

async function render(): Promise<HTMLElement> {
  // The attachment list query fetches on mount; an empty list is fine.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) } as Response))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mount(
    <QueryClientProvider client={queryClient}><FileUpload entityType="project" entityId="proj-1" /></QueryClientProvider>,
    { ready: (h) => h.querySelector('input[type="file"]'), label: 'FileUpload' },
  )
}

function choose(host: HTMLElement, file: File) {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
  const dt = new DataTransfer()
  dt.items.add(file)
  input.files = dt.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('FileUpload (#1031)', () => {
  it('uploads through the shared chain with its own entity', async () => {
    mockedUpload.mockResolvedValue({ url: '/api/files/k/raw', key: 'k' })
    const host = await render()
    choose(host, new File(['a'], 'notes.pdf', { type: 'application/pdf' }))
    await waitFor(() => mockedUpload.mock.calls.length === 1, 'upload requested')
    expect(mockedUpload.mock.calls[0][0].name).toBe('notes.pdf')
    expect(mockedUpload.mock.calls[0][1]).toEqual({ type: 'project', id: 'proj-1' })
    await waitFor(() => (host.textContent || '').includes('Drop a file or click to upload'), 'back to idle')
  })

  it('a failed upload leaves its error on screen', async () => {
    mockedUpload.mockRejectedValue(new Error('Upload to storage failed (503)'))
    const host = await render()
    choose(host, new File(['a'], 'notes.pdf', { type: 'application/pdf' }))
    await waitFor(() => mockedUpload.mock.calls.length === 1, 'upload requested')
    await waitFor(() => host.querySelector('[role="alert"]') !== null, 'error rendered')
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Upload to storage failed (503)')
  })

  // The failure message clears itself after 3s. That timer used to run
  // uncancelled, so a second upload started inside the window had its
  // "Uploading X..." label blanked while it was still in flight.
  it('a new upload cancels the previous failure message timer', async () => {
    let finishSecond!: (v: { url: string; key: string }) => void
    mockedUpload
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(() => new Promise((res) => { finishSecond = res }))
    const host = await render()
    choose(host, new File(['a'], 'first.pdf', { type: 'application/pdf' }))
    await waitFor(() => host.querySelector('[role="alert"]') !== null, 'first failure shown')

    choose(host, new File(['b'], 'second.pdf', { type: 'application/pdf' }))
    await waitFor(() => mockedUpload.mock.calls.length === 2, 'second upload started')
    await new Promise((r) => setTimeout(r, 3300)) // past the old timer
    expect(host.textContent || '').toContain('Uploading second.pdf')
    finishSecond({ url: '/api/files/k/raw', key: 'k' })
    await waitFor(() => (host.textContent || '').includes('Drop a file or click to upload'), 'back to idle')
  }, 10000)
})
