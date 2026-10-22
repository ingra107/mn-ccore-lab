// userPrefStore.test.ts -- the per-person view-preference store behind
// useUserPref (PB #911): how the old per-device localStorage keys are seeded
// to the server on the first load, and how a write reaches the server or is
// put back. Real store module, fetch and localStorage faked at the edge.
//
// What must hold:
//   - before the server answers, an old key still shows (no flash of defaults)
//   - server has no row: the device value is PUT, and the old key goes only
//     once the PUT settles; a 503 or network failure keeps it for next load
//   - a scalar the server already holds wins; the device value is dropped
//   - a set (saved views) is unioned by id, so neither laptop's views are lost
//   - a write is sent once after the 300 ms wait; a refused write is put back
//   - a refetch's answer never overwrites a change made after it was sent
//   - a write made before the FIRST GET answers was made against a stale
//     copy: the server's value wins when it has one; else the write is sent
//   - writing the value already shown sends nothing

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  _resetUserPrefsForTests,
  enableUserPrefSync,
  planSeed,
  readLegacy,
  readUserPref,
  userPrefsStatus,
  writeUserPref,
} from '../../hooks/useUserPref'

class MemStorage implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  keys() { return [...this.m.keys()].sort() }
}

type Handler = (method: string, url: string, body: unknown) => { status: number; body?: unknown } | 'network'
let ls: MemStorage
let calls: Array<{ method: string; url: string; body: unknown }>
let server: Map<string, unknown>
let handler: Handler

/** The default fake Hub: stores PUTs, answers GET from what it holds. */
const hub: Handler = (method, url, body) => {
  if (method === 'GET') return { status: 200, body: { data: [...server].map(([key, value]) => ({ key, value })) } }
  const key = decodeURIComponent(url.split('/api/user-prefs/')[1])
  if (method === 'DELETE') { server.delete(key); return { status: 200, body: { data: { key, deleted: true } } } }
  const value = (body as { value: unknown }).value
  server.set(key, value)
  return { status: 200, body: { data: { key, value } } }
}

async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

beforeEach(() => {
  _resetUserPrefsForTests()
  ls = new MemStorage()
  calls = []
  server = new Map()
  handler = hub
  vi.stubGlobal('localStorage', ls)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, body })
    const r = handler(method, url, body)
    if (r === 'network') throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status })
  }))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

const LABPREFS = { manuscriptsReviewDays: 5, manuscriptsStaleDays: 20, taskStaleDays: 7, projectStaleDays: 14 }

describe('planSeed', () => {
  const entry = (key: string, value: unknown) => ({ key, value, lsKeys: [`old:${key}`] })
  it('PUTs a value the server lacks, drops a scalar the server holds, unions a set by id', () => {
    const steps = planSeed(
      [
        entry('labprefs', LABPREFS),
        entry('today.dueWindow', '7'),
        entry('savedViews.my-tasks', [{ id: 'a' }, { id: 'b' }]),
        entry('savedViews.other', [{ id: 'x' }]),
        entry('dashboard.tab', undefined),
      ],
      new Map<string, unknown>([['today.dueWindow', '30'], ['savedViews.my-tasks', [{ id: 'b' }, { id: 'c' }]], ['savedViews.other', [{ id: 'x' }]]]),
    )
    expect(steps).toEqual([
      { key: 'labprefs', lsKeys: ['old:labprefs'], put: LABPREFS },
      { key: 'today.dueWindow', lsKeys: ['old:today.dueWindow'] },
      { key: 'savedViews.my-tasks', lsKeys: ['old:savedViews.my-tasks'], put: [{ id: 'b' }, { id: 'c' }, { id: 'a' }] },
      { key: 'savedViews.other', lsKeys: ['old:savedViews.other'] },
      { key: 'dashboard.tab', lsKeys: ['old:dashboard.tab'] },
    ])
  })
})

describe('readLegacy', () => {
  it("maps every old key to its pref; a layout only for the signed-in person, v2 before v1", () => {
    ls.setItem('mnccore.labprefs.v1', JSON.stringify(LABPREFS))
    ls.setItem('mnccore.savedViews.v1.my-tasks', '[]')
    ls.setItem('mnccore.today.defaultView', 'agenda')
    ls.setItem('table-config-task-grid', JSON.stringify({ _v: 2 }))
    ls.setItem('mnccore-dashboard-tab', 'people')
    ls.setItem('mnccore-dashboard-layouts-v2:nick-ingraham:primary', JSON.stringify({ lg: [] }))
    ls.setItem('mnccore-dashboard-layouts-v1:nick-ingraham:primary', JSON.stringify({ lg: [] }))
    ls.setItem('mnccore-dashboard-layouts-v1:nick-ingraham:pinned', JSON.stringify({ lg: [{ i: 'a', x: 1, y: 0, w: 1, h: 1 }] }))
    ls.setItem('mnccore-dashboard-layouts-v2:casey-eddington:primary', JSON.stringify({ lg: [] }))
    ls.setItem('mn-ccore-theme', 'dark')
    ls.setItem('pulse-paused', '1')
    const got = Object.fromEntries(readLegacy(ls, 'nick-ingraham').map((e) => [e.key, e]))
    expect(Object.keys(got).sort()).toEqual([
      'dashboard.layout.pinned', 'dashboard.layout.primary', 'dashboard.tab', 'labprefs',
      'savedViews.my-tasks', 'tableConfig.task-grid', 'today.defaultView',
    ])
    expect(got['dashboard.layout.primary'].lsKeys).toEqual([
      'mnccore-dashboard-layouts-v2:nick-ingraham:primary', 'mnccore-dashboard-layouts-v1:nick-ingraham:primary',
    ])
    // A v1 layout is scaled into v2 cells (GRID_SCALE 3).
    expect((got['dashboard.layout.pinned'].value as { lg: Array<{ x: number; w: number }> }).lg[0]).toMatchObject({ x: 3, w: 3 })
    expect(got['today.defaultView'].value).toBe('agenda')
  })

  it('a browser below dashboard defaults version 4 seeds no cards or pins', () => {
    ls.setItem('mnccore-dashboard-version', '3')
    ls.setItem('mnccore-dashboard-cards', '["stats"]')
    const [e] = readLegacy(ls, null)
    expect(e).toEqual({ key: 'dashboard.cards', value: undefined, lsKeys: ['mnccore-dashboard-cards'] })
  })
})

describe('the store', () => {
  it('shows an old key before the server answers, then seeds it and removes it', async () => {
    ls.setItem('mnccore.labprefs.v1', JSON.stringify(LABPREFS))
    expect(readUserPref('labprefs')).toEqual(LABPREFS)
    enableUserPrefSync('nick-ingraham')
    expect(userPrefsStatus()).toBe('loading')
    await settle()
    expect(userPrefsStatus()).toBe('ready')
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET /api/user-prefs', 'PUT /api/user-prefs/labprefs'])
    expect(server.get('labprefs')).toEqual(LABPREFS)
    expect(ls.getItem('mnccore.labprefs.v1')).toBeNull()
    expect(JSON.parse(ls.getItem('mnccore.pref.labprefs')!)).toEqual(LABPREFS)
    expect(readUserPref('labprefs')).toEqual(LABPREFS)
  })

  it('a scalar the server holds wins; the old key is dropped with no PUT', async () => {
    server.set('today.dueWindow', '30')
    ls.setItem('mnccore.today.dueWindow', '7')
    enableUserPrefSync('nick-ingraham')
    await settle()
    expect(readUserPref('today.dueWindow')).toBe('30')
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
    expect(ls.getItem('mnccore.today.dueWindow')).toBeNull()
  })

  it('saved views from both laptops survive: the union is PUT', async () => {
    server.set('savedViews.my-tasks', [{ id: 'home', name: 'H', query: '', createdAt: 1 }])
    ls.setItem('mnccore.savedViews.v1.my-tasks', JSON.stringify([{ id: 'work', name: 'W', query: '', createdAt: 2 }]))
    enableUserPrefSync('nick-ingraham')
    await settle()
    expect((server.get('savedViews.my-tasks') as Array<{ id: string }>).map((v) => v.id)).toEqual(['home', 'work'])
    expect(ls.getItem('mnccore.savedViews.v1.my-tasks')).toBeNull()
  })

  it('a seed PUT that fails keeps the old key for the next load, and the value still shows', async () => {
    ls.setItem('mnccore.today.defaultView', 'agenda')
    handler = (m, u, b) => (m === 'PUT' ? { status: 503 } : hub(m, u, b))
    enableUserPrefSync('nick-ingraham')
    await settle()
    expect(ls.getItem('mnccore.today.defaultView')).toBe('agenda')
    expect(readUserPref('today.defaultView')).toBe('agenda')
    handler = () => 'network'
    _resetUserPrefsForTests()
    enableUserPrefSync('nick-ingraham')
    await settle()
    expect(userPrefsStatus()).toBe('offline')
    expect(ls.getItem('mnccore.today.defaultView')).toBe('agenda')
  })

  it('a write is sent once after the wait; a refused write puts back the server value', async () => {
    server.set('dashboard.tab', 'projects')
    enableUserPrefSync('nick-ingraham')
    await settle()
    vi.useFakeTimers()
    writeUserPref('dashboard.tab', 'people')
    writeUserPref('dashboard.tab', 'deadlines')
    expect(readUserPref('dashboard.tab')).toBe('deadlines')
    expect(calls.filter((c) => c.method === 'PUT')).toEqual([])
    await vi.advanceTimersByTimeAsync(300)
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([{ value: 'deadlines' }])
    expect(server.get('dashboard.tab')).toBe('deadlines')

    handler = (m, u, b) => (m === 'PUT' ? { status: 500 } : hub(m, u, b))
    writeUserPref('dashboard.tab', 'people')
    await vi.advanceTimersByTimeAsync(300)
    vi.useRealTimers()
    await settle()
    expect(readUserPref('dashboard.tab')).toBe('deadlines')
    expect(JSON.parse(ls.getItem('mnccore.pref.dashboard.tab')!)).toBe('deadlines')
  })

  it('a reset sends DELETE and the pref reads as unset', async () => {
    server.set('labprefs', LABPREFS)
    enableUserPrefSync('nick-ingraham')
    await settle()
    vi.useFakeTimers()
    writeUserPref('labprefs', undefined)
    await vi.advanceTimersByTimeAsync(300)
    vi.useRealTimers()
    await settle()
    expect(server.has('labprefs')).toBe(false)
    expect(readUserPref('labprefs')).toBeUndefined()
    expect(ls.getItem('mnccore.pref.labprefs')).toBeNull()
  })

  /** fetch that holds every GET until `release()`; other calls answer at once. Logs to `calls`. */
  function holdGets() {
    let release!: () => void
    let gate = new Promise<void>((r) => { release = r })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ method, url, body })
      if (method === 'GET') await gate
      const r = hub(method, url, body) as { status: number; body?: unknown }
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status })
    }))
    return {
      release: () => release(),
      rearm: () => { gate = new Promise<void>((r) => { release = r }) },
    }
  }

  it("a refetch's answer never overwrites a change made after it was sent", async () => {
    server.set('dashboard.tab', 'projects')
    const win = new EventTarget()
    vi.stubGlobal('window', win)
    const gets = holdGets()
    enableUserPrefSync('nick-ingraham')
    gets.release()
    await settle()
    expect(userPrefsStatus()).toBe('ready')
    gets.rearm()
    win.dispatchEvent(new Event('focus'))
    writeUserPref('dashboard.tab', 'people')
    gets.release()
    await settle()
    expect(readUserPref('dashboard.tab')).toBe('people')
  })

  // Review finding (w1021d L7): the Lab overview grid's fit pass writes its
  // layout with no user action while the first GET is out. That write was made
  // against this device's stale copy and must not be PUT over the layout the
  // other laptop arranged.
  it('a write made before the first GET answers loses to the server value, and sends nothing', async () => {
    const OTHER_LAPTOP = { lg: [{ i: 'stats', x: 0, y: 0, w: 6, h: 3 }] }
    const THIS_DEVICE = { lg: [{ i: 'stats', x: 0, y: 0, w: 12, h: 2 }] }
    server.set('dashboard.layout.primary', OTHER_LAPTOP)
    const gets = holdGets()
    enableUserPrefSync('nick-ingraham')
    writeUserPref('dashboard.layout.primary', THIS_DEVICE)
    expect(readUserPref('dashboard.layout.primary')).toEqual(THIS_DEVICE)
    gets.release()
    await settle()
    await new Promise((r) => setTimeout(r, 350))
    await settle()
    expect(readUserPref('dashboard.layout.primary')).toEqual(OTHER_LAPTOP)
    expect(server.get('dashboard.layout.primary')).toEqual(OTHER_LAPTOP)
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  it('a write made before the first GET answers is sent when the server has no value', async () => {
    const gets = holdGets()
    enableUserPrefSync('nick-ingraham')
    writeUserPref('dashboard.tab', 'people')
    gets.release()
    await settle()
    await new Promise((r) => setTimeout(r, 350))
    await settle()
    expect(server.get('dashboard.tab')).toBe('people')
    expect(readUserPref('dashboard.tab')).toBe('people')
  })

  it('a refetch that reads while a PUT is out does not put the old value back on screen', async () => {
    server.set('today.dueWindow', '7')
    const win = new EventTarget()
    vi.stubGlobal('window', win)
    let releasePut!: () => void
    const putGate = new Promise<void>((r) => { releasePut = r })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (method === 'PUT') await putGate
      const r = hub(method, url, body) as { status: number; body?: unknown }
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status })
    }))
    enableUserPrefSync('nick-ingraham')
    await settle()
    vi.useFakeTimers()
    writeUserPref('today.dueWindow', '30')
    await vi.advanceTimersByTimeAsync(300) // PUT sent, not answered
    vi.useRealTimers()
    win.dispatchEvent(new Event('focus')) // GET reads '7'
    await settle()
    expect(readUserPref('today.dueWindow')).toBe('30')
    releasePut()
    await settle()
    expect(readUserPref('today.dueWindow')).toBe('30')
    expect(server.get('today.dueWindow')).toBe('30')
  })

  it('writing the value already shown sends nothing', async () => {
    server.set('dashboard.layout.primary', { lg: [{ i: 'stats', x: 0, y: 0, w: 6, h: 3 }] })
    enableUserPrefSync('nick-ingraham')
    await settle()
    writeUserPref('dashboard.layout.primary', { lg: [{ i: 'stats', x: 0, y: 0, w: 6, h: 3 }] })
    await new Promise((r) => setTimeout(r, 350))
    await settle()
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  it('signed out, a write stays on this device', async () => {
    writeUserPref('dashboard.tab', 'people')
    await new Promise((r) => setTimeout(r, 350))
    expect(calls).toEqual([])
    expect(JSON.parse(ls.getItem('mnccore.pref.dashboard.tab')!)).toBe('people')
  })
})
