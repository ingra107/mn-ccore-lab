/**
 * uploadFileToR2 — the shared presign -> PUT -> done chain extracted from
 * SmartCompose + TaskDetailPanel's OverviewQuickAdd (backlog #545). Locks the
 * happy path, the fallback URL construction, the entityType default, and
 * that every failure step throws loud instead of resolving silently.
 *
 * Run: npx vitest run --config vitest.config.lib.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { uploadFileToR2 } from '../r2Upload'

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

const FILE = new File(['hello'], 'shot.png', { type: 'image/png' })

describe('uploadFileToR2', () => {
  const realFetch = global.fetch

  afterEach(() => {
    global.fetch = realFetch
    vi.restoreAllMocks()
  })

  it('runs presign -> PUT -> done in order and returns the server url', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { uploadUrl: 'https://r2.example/put', key: 'k1' } }))
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
      .mockResolvedValueOnce(jsonResponse({ data: { url: '/api/files/k1/raw' } }))
    global.fetch = fetchMock

    const out = await uploadFileToR2(FILE, { type: 'task', id: 'task_1' })

    expect(out).toEqual({ url: '/api/files/k1/raw', key: 'k1' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/upload/url', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        filename: 'shot.png',
        contentType: 'image/png',
        context: { type: 'task', id: 'task_1' },
      }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://r2.example/put', expect.objectContaining({ method: 'PUT', body: FILE }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/upload/done', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        key: 'k1',
        filename: 'shot.png',
        contentType: 'image/png',
        sizeBytes: FILE.size,
        entityType: 'task', // defaults to ctx.type when entityType is omitted
        entityId: 'task_1',
      }),
    }))
  })

  it('overrides entityType when ctx.entityType is set', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { uploadUrl: 'https://r2.example/put', key: 'k2' } }))
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
      .mockResolvedValueOnce(jsonResponse({ data: { url: '/api/files/k2/raw' } }))

    await uploadFileToR2(FILE, { type: 'daily_thought', id: 'day_1', entityType: 'task' })

    const doneCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[2]
    expect(JSON.parse(doneCall[1].body as string).entityType).toBe('task')
  })

  it('falls back to the constructed /api/files/:key/raw link when done omits url', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { uploadUrl: 'https://r2.example/put', key: 'k3' } }))
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
      .mockResolvedValueOnce(jsonResponse({ data: {} }))

    const out = await uploadFileToR2(FILE, { type: 'task', id: 'task_1' })
    expect(out.url).toBe('/api/files/k3/raw')
  })

  it('throws loud on a non-ok presign response (never resolves silently)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
    await expect(uploadFileToR2(FILE, { type: 'task', id: 'task_1' }))
      .rejects.toThrow('Failed to get upload URL (500)')
  })

  it('throws loud when presign is ok but the payload is missing uploadUrl/key', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ data: {} }))
    await expect(uploadFileToR2(FILE, { type: 'task', id: 'task_1' }))
      .rejects.toThrow('Failed to get upload URL — R2 may not be configured')
  })

  it('throws loud on a failed PUT to storage', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { uploadUrl: 'https://r2.example/put', key: 'k4' } }))
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    await expect(uploadFileToR2(FILE, { type: 'task', id: 'task_1' }))
      .rejects.toThrow('Upload to storage failed (503)')
  })

  it('throws loud when recording the attachment fails', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { uploadUrl: 'https://r2.example/put', key: 'k5' } }))
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
    await expect(uploadFileToR2(FILE, { type: 'task', id: 'task_1' }))
      .rejects.toThrow('Recording attachment failed (500)')
  })
})
