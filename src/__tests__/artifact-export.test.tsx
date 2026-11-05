// S09: an artifact's Copy and Download say what the file is. An HTML artifact is not
// Markdown. Real page, stubbed fetch, real Blob.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { UndoToastProvider } from '../components/UndoToast'
import { AuthContext } from '../hooks/useAuth'
import ArtifactPage from '../pages/portal/ArtifactPage'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
const user = { email: 'bob@umn.edu', slug: 'bob', name: 'Bob', isAuthenticated: true, isPi: false, isMember: true, canShowAllProjects: false, piResolved: true }

async function open(content_type: string, body_md: string) {
  const artifact = { id: 'art_1', title: 'The Doc', body_md, content_type, visibility: 'team', version: 1, created_by: 'bob', created_at: '2026-11-01 10:00:00', updated_at: '2026-11-01 10:00:00', versions: [], tags: [] }
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/activity')) return json({ data: [], hidden_count: 0 })
    if (url.includes('/api/artifacts/art_1')) return json({ data: artifact })
    return json({ data: [] })
  })
  return mount(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false } as never}>
        <UndoToastProvider>
          <MemoryRouter initialEntries={['/portal/artifacts/art_1']}>
            <Routes><Route path="/portal/artifacts/:id" element={<ArtifactPage />} /></Routes>
          </MemoryRouter>
        </UndoToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
    { ready: (h) => h.textContent?.includes('The Doc') && h.querySelector('button'), label: 'artifact' },
  )
}

const named = (h: Element, name: string) => [...h.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)

async function download(host: Element, name: string) {
  let blob: Blob | undefined
  let filename = ''
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b as Blob; return 'blob:x' })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filename = this.download })
  named(host, name)!.click()
  return { type: blob?.type, filename }
}

describe('S09: artifact export', () => {
  it('HTML: the labels, the toast, the file name and the type all say HTML', async () => {
    const host = await open('html', '<h1>Hi</h1>')
    expect(named(host, 'Copy markdown')).toBeUndefined()
    expect(named(host, 'Download .md')).toBeUndefined()
    const write = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    named(host, 'Copy HTML')!.click()
    await waitFor(() => write.mock.calls.length === 1, 'the copy')
    expect(write).toHaveBeenCalledWith('<h1>Hi</h1>')
    await waitFor(() => /HTML copied/.test(document.body.textContent ?? ''), 'the toast')
    expect(await download(host, 'Download .html')).toEqual({ type: 'text/html', filename: 'the-doc.html' })
  })

  it('Markdown is unchanged', async () => {
    const host = await open('markdown', '# Hi')
    expect(named(host, 'Copy markdown')).toBeTruthy()
    expect(await download(host, 'Download .md')).toEqual({ type: 'text/markdown', filename: 'the-doc.md' })
  })

  it('a missing content type is Markdown', async () => {
    const host = await open(undefined as unknown as string, '# Hi')
    expect(named(host, 'Copy markdown')).toBeTruthy()
  })
})
