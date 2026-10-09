// The admin "Show all projects" state and its one fetch wrapper (#145).
// Runs in real Chromium (vitest.config.ts browser mode).
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import {
  ALL_PROJECTS_HEADER,
  getAllProjectsOn,
  installAllProjectsFetch,
  setAllProjectsOn,
} from './allProjects'

const calls: Array<{ url: string; headers: Headers }> = []

beforeAll(() => {
  // A stub underneath the wrapper: it records what would go on the wire.
  window.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ url, headers: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)) })
    return new Response('{}')
  }) as typeof window.fetch
  installAllProjectsFetch()
  installAllProjectsFetch() // idempotent: a second install must not stack a second wrapper
})

afterEach(() => {
  setAllProjectsOn(false)
  calls.length = 0
})

describe('allProjects switch state', () => {
  it('is off on load and is not read from storage', () => {
    localStorage.setItem('allProjects', '1')
    sessionStorage.setItem('allProjects', '1')
    expect(getAllProjectsOn()).toBe(false)
  })
})

describe('installAllProjectsFetch', () => {
  it('sends no header while the switch is off', async () => {
    await fetch('/api/projects')
    expect(calls).toHaveLength(1)
    expect(calls[0].headers.has(ALL_PROJECTS_HEADER)).toBe(false)
  })

  it('sends the header on every same-origin /api/ request while on', async () => {
    setAllProjectsOn(true)
    await fetch('/api/projects')
    await fetch('/api/tasks?x=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    await fetch(new URL('/api/auth/me', window.location.origin))
    await fetch(new Request(`${window.location.origin}/api/team`, { headers: { 'X-Other': 'keep' } }))
    expect(calls).toHaveLength(4)
    for (const c of calls) expect(c.headers.get(ALL_PROJECTS_HEADER)).toBe('1')
    expect(calls[1].headers.get('Content-Type')).toBe('application/json')
    expect(calls[3].headers.get('X-Other')).toBe('keep')
  })

  it('leaves other URLs alone: cross-origin and non-/api/ paths', async () => {
    setAllProjectsOn(true)
    await fetch('https://example.com/api/projects')
    await fetch('/assets/app.js')
    await fetch('/apiary')
    expect(calls).toHaveLength(3)
    for (const c of calls) expect(c.headers.has(ALL_PROJECTS_HEADER)).toBe(false)
  })

  it('stops sending the header once the switch goes off', async () => {
    setAllProjectsOn(true)
    setAllProjectsOn(false)
    await fetch('/api/projects')
    expect(calls[0].headers.has(ALL_PROJECTS_HEADER)).toBe(false)
  })
})
