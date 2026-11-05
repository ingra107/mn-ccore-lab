import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEARCH_TYPE_ORDER, openSearchResult, orderSearchTypes } from '../searchTypes'

const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8')

describe('orderSearchTypes', () => {
  it('lists products and artifacts, which a hand-kept list dropped', () => {
    expect(orderSearchTypes(['artifact', 'task', 'product', 'project'])).toEqual(['task', 'project', 'product', 'artifact'])
  })
  it('keeps a type it has never heard of, after the known ones', () => {
    expect(orderSearchTypes(['zzz', 'task'])).toEqual(['task', 'zzz'])
  })
})

describe('a search link that carries ?open= has a page that reads it', () => {
  it('the Ideas tab consumes ?open= (search emits it for an idea)', () => {
    expect(read('api/routes/search.ts')).toContain('tab=ideas&open=')
    expect(read('src/pages/portal/IdeasPage.tsx')).toMatch(/useOpenParam\(\s*'open'/)
  })
})

describe('every result type the route can return has a place in the order', () => {
  it('TYPE_PRIORITY keys (route) and typeConfig keys (page) are all in SEARCH_TYPE_ORDER', () => {
    const route = read('api/routes/search.ts')
    const prio = route.slice(route.indexOf('const TYPE_PRIORITY'), route.indexOf('};', route.indexOf('const TYPE_PRIORITY')))
    const routeKeys = [...prio.matchAll(/^\s+(\w+):\s*\d+/gm)].map((m) => m[1])
    const page = read('src/pages/portal/SearchPage.tsx')
    const cfg = page.slice(page.indexOf('const typeConfig'), page.indexOf('\n}\n', page.indexOf('const typeConfig')))
    const pageKeys = [...cfg.matchAll(/^\s+(\w+): \{ icon:/gm)].map((m) => m[1])
    expect(routeKeys.length).toBeGreaterThan(10)
    expect(pageKeys.length).toBeGreaterThan(10)
    for (const k of [...routeKeys, ...pageKeys]) expect(SEARCH_TYPE_ORDER as readonly string[], k).toContain(k)
  })
})

describe('openSearchResult', () => {
  const fake = () => {
    const calls: unknown[][] = []
    return { calls, open: (...a: unknown[]) => { calls.push(a); return null }, location: { href: 'start' } }
  }
  it('Enter on a public-site row opens a new tab and leaves the portal tab alone', () => {
    const w = fake()
    openSearchResult({ url: '/publications/1', details: { external: true } }, w as never)
    expect(w.calls).toEqual([['/publications/1', '_blank', 'noopener']])
    expect(w.location.href).toBe('start')
  })
  it('Enter on any other row stays in this tab', () => {
    const w = fake()
    openSearchResult({ url: '/portal/projects/a', details: {} }, w as never)
    expect(w.calls).toEqual([])
    expect(w.location.href).toBe('/portal/projects/a')
  })
})
