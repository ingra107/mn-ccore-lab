import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWithTimeout } from '../api'

// fetchWithTimeout — extracted from useLocalPomodoro.ts (#252 finding 3) so it's
// reusable + node-mode testable without a browser.
describe('fetchWithTimeout', () => {
  const realFetch = global.fetch

  afterEach(() => {
    global.fetch = realFetch
    vi.useRealTimers()
  })

  it('resolves normally when the response arrives before the timeout', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response)
    const res = await fetchWithTimeout('http://localhost:9999/ping')
    expect(res.ok).toBe(true)
  })

  it('passes init options through to fetch, plus an abort signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response)
    global.fetch = fetchMock
    await fetchWithTimeout('http://localhost:9999/ping', { method: 'POST' }, 500)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/ping',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    )
  })

  it('aborts and rejects when the response does not arrive within timeoutMs', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
    ) as unknown as typeof fetch

    const promise = fetchWithTimeout('http://localhost:9999/hang', undefined, 100)
    const assertion = expect(promise).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })

  it('defaults to a 2000ms timeout when none is given', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
    ) as unknown as typeof fetch

    const promise = fetchWithTimeout('http://localhost:9999/hang')
    const assertion = expect(promise).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(2000)
    await assertion
  })
})
