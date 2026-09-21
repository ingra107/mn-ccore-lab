// #128: "I clicked Writing for stage, got the toast saying it changed, and it
// didn't." The undo toast fires on click; the write itself can still be
// rejected (Rule 35 400, mutation 409, auth 401). Before this fix all three
// copies of the optimistic project writer rolled the cache back in silence,
// so the row snapped to its old value with no reason on screen. This guards
// the shared hook: a rejected write restores the cache AND surfaces the
// server's message through the toast layer.
//
// Runs in real Chromium (vitest.config.ts browser mode). Mounts with
// react-dom directly — the repo carries no testing-library.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UndoToastProvider } from '../components/UndoToast'
import { useUpdateProjectFields } from '../hooks/mutations/useProjectMutations'
import type { Project } from '../data/types'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

afterEach(() => {
  vi.unstubAllGlobals()
})

async function until(pred: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (pred()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`timed out waiting for ${what}`)
}

const seed = [{ slug: 'p1', stage: 'idea', title: 'P1' } as unknown as Project]

function Harness({ fields }: { fields: Record<string, unknown> }) {
  const update = useUpdateProjectFields()
  useEffect(() => {
    update.mutate({ slug: 'p1', fields })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount
  }, [])
  return null
}

async function mountWith(fields: Record<string, unknown>): Promise<{ host: HTMLElement; queryClient: QueryClient }> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queryClient.setQueryData<Project[]>(['projects'], seed)
  // Harness renders nothing; the assertions below poll for the toast themselves.
  const host = await mount(
    <QueryClientProvider client={queryClient}>
      <UndoToastProvider>
        <Harness fields={fields} />
      </UndoToastProvider>
    </QueryClientProvider>,
    { ready: () => true, label: 'Harness' },
  )
  return { host, queryClient }
}

describe('useUpdateProjectFields: a rejected write is never silent (#128)', () => {
  it('rolls the cache back and puts the server reason on screen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: 'Invalid stage: "nope". Must be one of: idea, writing' }),
    }))
    const { host, queryClient } = await mountWith({ stage: 'nope' })

    await until(() => /Could not save stage/.test(host.textContent ?? ''), 'error toast')
    expect(host.textContent).toContain('Invalid stage: "nope"')
    expect(queryClient.getQueryData<Project[]>(['projects'])?.[0].stage).toBe('idea')
  })

  it('an accepted write shows no error and keeps the optimistic value', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { slug: 'p1', stage: 'writing' } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { host, queryClient } = await mountWith({ stage: 'writing' })

    await until(() => fetchMock.mock.calls.length > 0, 'POST')
    await new Promise((r) => setTimeout(r, 50))
    expect(host.textContent ?? '').not.toMatch(/Could not save/)
    expect(queryClient.getQueryData<Project[]>(['projects'])?.[0].stage).toBe('writing')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/projects/p1')
    expect(JSON.parse(init.body as string)).toEqual({ stage: 'writing' })
  })
})
