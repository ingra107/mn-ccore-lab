// A failed task write puts back only the fields IT wrote (refuter 3, S1 and
// S1t, 2026-11-01). useUpdateTask / useUpdateTaskStatus used to restore the
// whole-list snapshot taken before LATER saves, so a late title failure
// reverted a description save that had already succeeded, and the task
// panel's cache subscription pulled that stale text in as the next edit's base.
// Also pins the accepted A-B-A limit of the value compare (S2).
// Runs in real Chromium (vitest.config.ts browser mode).
// Run: npx vitest run --config vitest.config.ts src/__tests__/task-mutation-field-rollback.test.tsx

import { describe, it, expect, afterEach, vi } from 'vitest'
import { useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import TaskDetailPanel from '../components/tasks/TaskDetailPanel'
import { UndoToastProvider } from '../components/UndoToast'
import type { TaskRow } from '../lib/api'
import { optimisticRowUpdate, rollbackRowChanges } from '../hooks/mutations/utils'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function setVal(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const mk = (id: string, description: string | null, title = 'orig') => ({
  id, title, status: 'todo', priority: 'medium', assignee: 'nick-ingraham', completed: 0,
  project_id: null, due_date: null, description, description_json: null, seq: 1,
} as unknown as TaskRow)

interface Post { body: Record<string, unknown>; resolve: (ok: boolean) => void }
/** A fake Hub: POSTs to task_A held by `hold(i)`; GET /api/tasks reads the row at request time. */
function fakeServer(row: Record<string, unknown>, hold: (i: number) => boolean) {
  const server = { row: { ...row }, posts: [] as Post[], sent: [] as Record<string, unknown>[], failGets: false, holdGets: false, heldGets: [] as Array<() => void> }
  vi.stubGlobal('fetch', vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u)
    if (init?.method === 'POST' && typeof init.body === 'string' && /\/api\/tasks\/task_A(\/status)?$/.test(url)) {
      const body = JSON.parse(init.body) as Record<string, unknown>
      const i = server.sent.length
      server.sent.push(body)
      const answer = (ok: boolean): Response => {
        if (!ok) return { ok: false, status: 500, statusText: 'x', json: async () => ({ error: 'boom' }) } as Response
        if ('expected_description' in body && (server.row.description ?? '') !== (body.expected_description ?? '')) {
          return { ok: false, status: 409, statusText: 'Conflict', json: async () => ({ error: 'changed', code: 'description_changed', description: server.row.description }) } as Response
        }
        const patch = { ...body }; delete patch.expected_description
        server.row = { ...server.row, ...patch }
        const echo = { ...server.row }
        return { ok: true, status: 200, json: async () => ({ data: echo }) } as Response
      }
      if (!hold(i)) return answer(true)
      return await new Promise<Response>((res) => server.posts.push({ body, resolve: (ok) => res(answer(ok)) }))
    }
    if ((!init?.method || init.method === 'GET') && /\/api\/tasks(\?|$)/.test(url)) {
      const snap = { ...server.row }
      const reply = (): Response => (server.failGets
        ? { ok: false, status: 503, statusText: 'x', json: async () => ({ error: 'down' }) } as Response
        : { ok: true, status: 200, json: async () => ({ data: [snap] }) } as Response)
      if (server.holdGets) return await new Promise<Response>((res) => server.heldGets.push(() => res(reply())))
      return reply()
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response
  }))
  return server
}
const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } })
const readDesc = () => document.querySelector('[data-testid="task-description"]')?.textContent ?? null
const readTitle = () => document.querySelector('[aria-label="Edit title"]')?.textContent ?? null
const editorEl = () => document.querySelector<HTMLTextAreaElement>('[data-testid="task-description-editor"]')
async function openDesc() {
  document.querySelector<HTMLElement>('[data-testid="task-description"], [data-testid="task-description-empty"]')!.click()
  return waitFor(() => editorEl(), 'editor')
}
async function editTitle(v: string) {
  document.querySelector<HTMLElement>('[aria-label="Edit title"]')!.click()
  const inp = await waitFor(() => document.querySelector<HTMLInputElement>('input.border-b-2'), 'title input')
  setVal(inp, v)
  inp.blur()
  await sleep(30)
}
async function editDesc(v: string) {
  const ta = await openDesc()
  setVal(ta, v)
  ta.blur()
  await sleep(30)
}
function Wrap({ qc, children }: { qc: QueryClient; children: React.ReactNode }) {
  return <QueryClientProvider client={qc}><MemoryRouter><UndoToastProvider>{children}</UndoToastProvider></MemoryRouter></QueryClientProvider>
}
// A cache-backed parent: an active ['tasks'] list query and the selected task held as a snapshot.
function ListHost() {
  const q = useQuery({ queryKey: ['tasks', {}], queryFn: () => fetch('/api/tasks').then((r) => { if (!r.ok) throw new Error('down'); return r.json() }).then((j) => j.data as TaskRow[]) })
  const [sel, setSel] = useState<TaskRow | null>(null)
  if (q.data && !sel && q.data[0]) setSel(q.data[0])
  return sel ? <TaskDetailPanel task={sel} onClose={() => {}} /> : null
}

describe('a failed task write reverts only its own fields', () => {
  it('S1: a title save failing AFTER a later description save landed leaves the description; the next edit starts from it', async () => {
    const server = fakeServer(mk('task_A', 'A body') as unknown as Record<string, unknown>, (i) => i <= 1)
    const qc = newQc()
    await mount(<Wrap qc={qc}><ListHost /></Wrap>, { ready: () => readDesc(), label: 'panel' })
    await editTitle('T2') // held
    await editDesc('A v2') // held
    server.posts[1].resolve(true)
    await expect.poll(() => server.row.description).toBe('A v2')
    server.failGets = true // refetches fail from here on
    server.posts[0].resolve(false)
    await sleep(300)
    expect(qc.getQueryData<TaskRow[]>(['tasks', {}])?.[0]?.description).toBe('A v2')
    expect(readDesc()).toBe('A v2')
    expect(readTitle()).toBe('orig')
    const ta = await openDesc()
    expect(ta.value).toBe('A v2')
    setVal(ta, 'A v2 more')
    ta.blur()
    await expect.poll(() => server.row.description).toBe('A v2 more')
    expect(server.sent.at(-1)).toEqual({ description: 'A v2 more', expected_description: 'A v2' })
    expect(document.querySelector('[data-testid="task-description-conflict"]')).toBeNull()
  })

  it('S1t: while the refetch after the failure is still out, the landed description stays on screen', async () => {
    const server = fakeServer(mk('task_A', 'A body') as unknown as Record<string, unknown>, (i) => i <= 1)
    const qc = newQc()
    await mount(<Wrap qc={qc}><ListHost /></Wrap>, { ready: () => readDesc(), label: 'panel' })
    await editTitle('T2')
    await editDesc('A v2')
    server.posts[1].resolve(true)
    await sleep(150)
    server.holdGets = true
    server.posts[0].resolve(false)
    await sleep(150)
    expect(readDesc()).toBe('A v2')
    server.holdGets = false
    server.heldGets.forEach((f) => f())
    await sleep(200)
    expect(readDesc()).toBe('A v2')
  })
})

describe('rollbackRowChanges', () => {
  const row = (title: string, description = 'd') => ({ id: 't', title, description })
  it('puts back only fields still holding this update\'s value; a reshaped list restores whole', () => {
    const qc = newQc()
    qc.setQueryData(['tasks', {}], [row('orig')])
    const ctx = optimisticRowUpdate<{ id: string; title: string; description: string }>(qc, ['tasks'], (rows) => rows.map((r) => ({ ...r, title: 'X' })))
    // A later write moved description; the failed one only wrote title.
    qc.setQueryData(['tasks', {}], [row('X', 'later')])
    rollbackRowChanges(qc, ctx)
    expect(qc.getQueryData(['tasks', {}])).toEqual([row('orig', 'later')])
    // A later value of the same field is left alone.
    qc.setQueryData(['tasks', {}], [row('Y', 'later')])
    rollbackRowChanges(qc, ctx)
    expect(qc.getQueryData(['tasks', {}])).toEqual([row('Y', 'later')])

    const shaped = optimisticRowUpdate<{ id: string; title: string; description: string }>(qc, ['tasks'], () => [])
    rollbackRowChanges(qc, shaped)
    expect(qc.getQueryData(['tasks', {}])).toEqual([row('Y', 'later')])
  })

  it('S2, accepted: an A-B-A on one field is told apart by value only, so a late failure shows the original', () => {
    const qc = newQc()
    qc.setQueryData(['tasks', {}], [row('orig')])
    const first = optimisticRowUpdate<{ id: string; title: string; description: string }>(qc, ['tasks'], (rows) => rows.map((r) => ({ ...r, title: 'X' })))
    qc.setQueryData(['tasks', {}], [row('Y')]) // Y ok
    qc.setQueryData(['tasks', {}], [row('X')]) // X again, ok
    rollbackRowChanges(qc, first) // the first X fails late
    expect(qc.getQueryData<{ title: string }[]>(['tasks', {}])?.[0]?.title).toBe('orig') // server holds X; the settle refetch corrects it
  })
})
