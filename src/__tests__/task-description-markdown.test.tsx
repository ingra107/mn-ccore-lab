// The task body is ONE plain-markdown `description` (Nick 2026-11-01: "Yes,
// one plain-markdown store (Recommended)"). Pins the mechanisms:
//   - the panel shows a description that changes underneath it (a PB write
//     arriving while the panel is open), and an open draft is not overwritten;
//   - an edit writes `description`, never `description_json` (real panel,
//     real useUpdateTask, fetch captured);
//   - an edit can only ever write the task it was started on (cold-refuter
//     repro 2026-11-01: typing in A then Alt+ArrowDown PATCHed task_B with A's
//     text), and leaving mid-edit saves the draft to that task;
//   - a save over a description that changed mid-edit asks instead of
//     overwriting (the lost-update repro), including a change the screen never
//     saw: the route's 409 (expected_description) reopens the same notice;
//   - a panel opened from a snapshot parent with no ['tasks'] cache row shows
//     its own save, so the next edit starts from it (refuter 2, R1);
//   - a failed save of the user's own is not an outside change (refuter 2, R2);
//   - the description_json fallback never hides the stored description.
// Runs in real Chromium (vitest.config.ts browser mode).
// Run: npx vitest run --config vitest.config.ts src/__tests__/task-description-markdown.test.tsx

import { describe, it, expect, afterEach, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import TaskDetailPanel, { DescriptionField, type DescriptionSave } from '../components/tasks/TaskDetailPanel'
import { UndoToastProvider } from '../components/UndoToast'
import type { TaskRow } from '../lib/api'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const docJson = (text: string) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function typeInto(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

type OnSave = (id: string, v: string | null, expected: string | null) => Promise<DescriptionSave> | void
let setExternal: (d: string | null) => void = () => {}
let setShown: (b: boolean) => void = () => {}
function Host({ initial, json = null, onSave = () => {} }: { initial: string | null; json?: string | null; onSave?: OnSave }) {
  const [description, setDescription] = useState<string | null>(initial)
  const [show, setShow] = useState(true)
  useEffect(() => { setExternal = setDescription; setShown = setShow }, [])
  return show ? <DescriptionField taskId="task_H" description={description} descriptionJson={json} onSave={onSave} /> : null
}

const read = (h: ParentNode) => h.querySelector('[data-testid="task-description"]')?.textContent ?? null
const editorEl = (h: ParentNode) => h.querySelector<HTMLTextAreaElement>('[data-testid="task-description-editor"]')
const editor = (h: ParentNode) => waitFor(() => editorEl(h), 'editor')
const conflictEl = (h: ParentNode) => h.querySelector('[data-testid="task-description-conflict"]')
const savingEl = (h: ParentNode) => h.querySelector('[data-testid="task-description-saving"]')
const clickField = (h: ParentNode) => h.querySelector<HTMLElement>('[data-testid="task-description"], [data-testid="task-description-empty"]')!.click()
/** Open the editor once no save is in flight (the field does not open while one is). */
async function openEditor(h: ParentNode) {
  await expect.poll(() => savingEl(h)).toBeNull()
  clickField(h)
  return editor(h)
}

describe('DescriptionField', () => {
  it('re-renders a description written underneath it while the panel is open', async () => {
    const host = await mount(<Host initial="First version" />, { ready: (h) => read(h), label: 'description' })
    setExternal('PB rewrote this')
    await expect.poll(() => read(host)).toBe('PB rewrote this')
  })

  it('a save over a description that changed mid-edit asks; "Keep mine" then writes the draft', async () => {
    const onSave = vi.fn()
    const host = await mount(<Host initial="Start" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    const ta = await openEditor(host)
    typeInto(ta, 'Start plus my words')
    setExternal('Start\n\nPB appended an important note')
    await sleep(50)
    ta.blur()
    const notice = await waitFor(() => conflictEl(host), 'conflict notice')
    expect(notice.textContent).toContain('This description changed while you were editing.')
    expect(notice.textContent).toContain('PB appended an important note')
    expect(onSave).not.toHaveBeenCalled()
    // The draft is still open and intact.
    expect(editorEl(host)!.value).toBe('Start plus my words')
    host.querySelector<HTMLElement>('[data-testid="description-keep-mine"]')!.click()
    await expect.poll(() => onSave.mock.calls.length).toBe(1)
    // Written over the newer text, which is the expected base the route checks.
    expect(onSave).toHaveBeenCalledWith('task_H', 'Start plus my words', 'Start\n\nPB appended an important note')
  })

  it('"Use the new one" drops the draft and writes nothing', async () => {
    const onSave = vi.fn()
    const host = await mount(<Host initial="Start" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    const ta = await openEditor(host)
    typeInto(ta, 'Start plus my words')
    setExternal('Newer text')
    await sleep(50)
    ta.blur()
    await waitFor(() => host.querySelector('[data-testid="description-use-new"]'), 'use-new')
    host.querySelector<HTMLElement>('[data-testid="description-use-new"]')!.click()
    await expect.poll(() => read(host)).toBe('Newer text')
    await sleep(50)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('a blur with no change saves nothing; Escape cancels', async () => {
    const onSave = vi.fn()
    const host = await mount(<Host initial="Same" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    let ta = await openEditor(host)
    ta.blur()
    await waitFor(() => read(host), 'read view again')
    ta = await openEditor(host)
    typeInto(ta, 'Changed then cancelled')
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await waitFor(() => read(host), 'read view after Escape')
    await sleep(50)
    expect(onSave).not.toHaveBeenCalled()
    expect(read(host)).toBe('Same')
  })

  it('Ctrl+Enter saves exactly once, sending the text it started from', async () => {
    const onSave = vi.fn()
    const host = await mount(<Host initial="x" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    const ta = await openEditor(host)
    typeInto(ta, 'y')
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }))
    await sleep(200)
    expect(onSave.mock.calls).toEqual([['task_H', 'y', 'x']])
  })

  it('clearing a body that carries a meeting marker keeps only the marker', async () => {
    const onSave = vi.fn()
    const host = await mount(<Host initial="body [meeting:cal-1:abc]" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    const ta = await openEditor(host)
    typeInto(ta, '')
    ta.blur()
    await expect.poll(() => onSave.mock.calls.length).toBe(1)
    expect(onSave).toHaveBeenCalledWith('task_H', '[meeting:cal-1:abc]', 'body [meeting:cal-1:abc]')
  })

  it('unmounting mid-edit saves the draft to the task it was typed on', async () => {
    const onSave = vi.fn()
    const host = await mount(<Host initial="x" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    const ta = await openEditor(host)
    typeInto(ta, 'typed then closed')
    setShown(false)
    await sleep(100)
    expect(onSave.mock.calls).toEqual([['task_H', 'typed then closed', 'x']])
  })

  it('a refusal for a change the screen never saw reopens the draft with the stored text; "Keep mine" writes over it', async () => {
    const answers: DescriptionSave[] = [{ ok: false, changed: true, description: 'PB wrote this meanwhile' }, { ok: true }]
    const onSave = vi.fn(async () => answers.shift()!)
    const host = await mount(<Host initial="Start" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    const ta = await openEditor(host)
    typeInto(ta, 'My edit')
    ta.blur()
    const notice = await waitFor(() => conflictEl(host), 'conflict notice after the refusal')
    expect(notice.textContent).toContain('PB wrote this meanwhile')
    expect(editorEl(host)!.value).toBe('My edit')
    host.querySelector<HTMLElement>('[data-testid="description-keep-mine"]')!.click()
    await expect.poll(() => onSave.mock.calls.length).toBe(2)
    expect(onSave.mock.calls[1]).toEqual(['task_H', 'My edit', 'PB wrote this meanwhile'])
  })

  it('while its save is in flight the field shows the text with "Saving..." and does not open; then the echo is the base', async () => {
    let answer: (r: DescriptionSave) => void = () => {}
    const onSave = vi.fn<OnSave>()
      .mockImplementationOnce(() => new Promise<DescriptionSave>((r) => { answer = r }))
      .mockImplementation(async () => ({ ok: true }))
    // The prop never moves (a snapshot parent): only the save's answer can say what is stored.
    const host = await mount(<Host initial="A body" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    const ta = await openEditor(host)
    typeInto(ta, 'A body v2')
    ta.blur()
    await expect.poll(() => read(host)).toBe('A body v2')
    expect(savingEl(host)?.textContent).toBe('Saving…')
    clickField(host)
    await sleep(100)
    expect(editorEl(host)).toBeNull() // no edit on text the server does not hold yet
    answer({ ok: true, description: 'A body v2' })
    const ta2 = await openEditor(host)
    expect(ta2.value).toBe('A body v2')
    typeInto(ta2, 'A body v3')
    ta2.blur()
    await expect.poll(() => onSave.mock.calls.length).toBe(2)
    expect(conflictEl(host)).toBeNull()
    expect(onSave.mock.calls[1]).toEqual(['task_H', 'A body v3', 'A body v2'])
  })

  it('after a failed save the field opens on the text still stored', async () => {
    let answer: (r: DescriptionSave) => void = () => {}
    const onSave = vi.fn<OnSave>()
      .mockImplementationOnce(() => new Promise<DescriptionSave>((r) => { answer = r }))
      .mockImplementation(async () => ({ ok: true }))
    const host = await mount(<Host initial="A body" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    const ta = await openEditor(host)
    typeInto(ta, 'A body v2')
    ta.blur()
    await expect.poll(() => savingEl(host)).not.toBeNull()
    answer({ ok: false, changed: false })
    const ta2 = await openEditor(host)
    expect(ta2.value).toBe('A body')
    typeInto(ta2, 'A body v3')
    ta2.blur()
    await expect.poll(() => onSave.mock.calls.length).toBe(2)
    expect(onSave.mock.calls[1]).toEqual(['task_H', 'A body v3', 'A body'])
  })

  it('never hides the stored description behind description_json; the extra words show below', async () => {
    // Refuter repro: a user trims the description; the stale JSON must not stand in for it.
    const host = await mount(
      <Host initial="Alpha beta gamma." json={docJson('Alpha beta gamma. Remove this wrong sentence.')} />,
      { ready: (h) => read(h), label: 'description' },
    )
    expect(read(host)).toBe('Alpha beta gamma.')
    expect(host.querySelector('[data-testid="task-description-earlier"]')?.textContent).toContain('Remove this wrong sentence.')
    // Every JSON word already present: no block.
    setExternal('Alpha beta gamma. Remove this wrong sentence.')
    await expect.poll(() => host.querySelector('[data-testid="task-description-earlier"]')).toBeNull()
  })

  it('an empty description keeps its ghost line; the JSON text shows as earlier text', async () => {
    const host = await mount(<Host initial={null} json={docJson('Typed in the old editor')} />, { ready: (h) => h.querySelector('[data-testid="task-description-empty"]'), label: 'ghost' })
    expect(host.querySelector('[data-testid="task-description-earlier"]')?.textContent).toContain('Typed in the old editor')
  })
})

// ── The real panel ──────────────────────────────────────────

const mk = (id: string, description: string | null, description_json: string | null = null) => ({
  id, title: id, status: 'todo', priority: 'medium', assignee: 'nick-ingraham', completed: 0,
  project_id: null, due_date: null, description, description_json,
} as unknown as TaskRow)

/** Every POST body, as "<url> <body>"; each POST answered by `answer`. */
function captureWrites(answer: (url: string, body: Record<string, unknown>) => { status: number; json: unknown } = () => ({ status: 500, json: {} })): string[] {
  const bodies: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (typeof init?.body === 'string') {
      bodies.push(`${String(url)} ${init.body}`)
      const a = answer(String(url), JSON.parse(init.body) as Record<string, unknown>)
      return { ok: a.status < 400, status: a.status, json: async () => a.json } as Response
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response
  }))
  return bodies
}
const descWrites = (bodies: string[]) => bodies.filter((b) => b.includes('"description"')).map((b) => JSON.parse(b.slice(b.indexOf(' ') + 1)) as Record<string, unknown>)
/** The route's echo of an accepted write. */
const echo = (id: string) => (_u: string, body: Record<string, unknown>) => ({ status: 200, json: { data: { ...mk(id, null), ...body, expected_description: undefined } } })

/** A fake Hub for task_A: POST i is held when `hold(i)` until `release(i, ok)`;
 *  a stale expected_description answers 409 with the stored text; GET
 *  /api/tasks reads the row at request time. */
function heldServer(row: Record<string, unknown>, hold: (i: number) => boolean) {
  const waiting = new Map<number, (ok: boolean) => void>()
  const server = {
    row: { ...row },
    sent: [] as Record<string, unknown>[],
    release: (i: number, ok: boolean) => { waiting.get(i)!(ok); waiting.delete(i) },
  }
  vi.stubGlobal('fetch', vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u)
    if (init?.method === 'POST' && typeof init.body === 'string' && /\/api\/tasks\/task_A$/.test(url)) {
      const body = JSON.parse(init.body) as Record<string, unknown>
      const i = server.sent.length
      server.sent.push(body)
      const answer = (ok: boolean): Response => {
        if (!ok) return { ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response
        if ('expected_description' in body && (server.row.description ?? '') !== (body.expected_description ?? '')) {
          return { ok: false, status: 409, json: async () => ({ error: 'changed', code: 'description_changed', description: server.row.description }) } as Response
        }
        const patch = { ...body }; delete patch.expected_description
        server.row = { ...server.row, ...patch }
        const echoed = { ...server.row }
        return { ok: true, status: 200, json: async () => ({ data: echoed }) } as Response
      }
      if (!hold(i)) return answer(true)
      return await new Promise<Response>((res) => waiting.set(i, (ok) => res(answer(ok))))
    }
    if ((!init?.method || init.method === 'GET') && /\/api\/tasks(\?|$)/.test(url)) {
      const snap = { ...server.row }
      return { ok: true, status: 200, json: async () => ({ data: [snap] }) } as Response
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response
  }))
  return server
}
/** A cache-backed parent: an active ['tasks'] list query; the selected task held as a snapshot. */
function ListHost() {
  const q = useQuery({ queryKey: ['tasks', {}], queryFn: () => fetch('/api/tasks').then((r) => r.json()).then((j) => j.data as TaskRow[]) })
  const [sel, setSel] = useState<TaskRow | null>(null)
  if (q.data && !sel && q.data[0]) setSel(q.data[0])
  return sel ? <TaskDetailPanel task={sel} onClose={() => {}} /> : null
}

let swap: (t: TaskRow) => void = () => {}
function NavHost({ a, b }: { a: TaskRow; b: TaskRow }) {
  const [t, setT] = useState(a)
  useEffect(() => { swap = setT }, [])
  return <TaskDetailPanel task={t} onClose={() => {}} onNext={() => setT(b)} onPrev={() => setT(a)} />
}

const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
async function mountPanel(node: React.ReactElement, qc = newQc()) {
  await mount(
    <QueryClientProvider client={qc}><MemoryRouter><UndoToastProvider>{node}</UndoToastProvider></MemoryRouter></QueryClientProvider>,
    { ready: () => document.querySelector('[data-testid="task-description"]'), label: 'panel description' },
  )
}

describe('TaskDetailPanel description edit', () => {
  it('writes `description`, never `description_json`, and keeps the meeting marker', async () => {
    const bodies = captureWrites()
    await mountPanel(<TaskDetailPanel task={mk('task_desc_1', 'Old body [meeting:cal-1:abc]', docJson('Old body'))} onClose={() => {}} />)
    expect(read(document)).toBe('Old body')
    const ta = await openEditor(document)
    typeInto(ta, 'New body with [a link](https://example.org)')
    ta.blur()
    await expect.poll(() => descWrites(bodies).length).toBe(1)
    const write = bodies.find((b) => b.includes('"description"'))!
    expect(write).toContain('task_desc_1')
    expect(descWrites(bodies)[0]).toEqual({
      description: 'New body with [a link](https://example.org) [meeting:cal-1:abc]',
      expected_description: 'Old body [meeting:cal-1:abc]',
    })
    expect(bodies.some((b) => b.includes('description_json'))).toBe(false)
  })

  it('a panel on a snapshot parent with no [tasks] cache row shows its own save; the next edit starts from it', async () => {
    // Refuter 2, R1: the second save used to start from the stale prop and erase the first.
    const bodies = captureWrites(echo('task_A'))
    await mountPanel(<TaskDetailPanel task={mk('task_A', 'A body')} onClose={() => {}} />)
    let ta = await openEditor(document)
    typeInto(ta, 'A body\nline1')
    ta.blur()
    await expect.poll(() => read(document)).toBe('A body\nline1')
    ta = await openEditor(document)
    expect(ta.value).toBe('A body\nline1')
    typeInto(ta, ta.value + '\nline2')
    ta.blur()
    await expect.poll(() => descWrites(bodies).length).toBe(2)
    expect(descWrites(bodies)[1]).toEqual({ description: 'A body\nline1\nline2', expected_description: 'A body\nline1' })
    expect(read(document)).toBe('A body\nline1\nline2')
  })

  it('the route refusing a stale base (409) opens the conflict notice with the stored text; "Keep mine" writes over it', async () => {
    let calls = 0
    const bodies = captureWrites((_u, body) => (++calls === 1
      ? { status: 409, json: { error: 'The description changed since this edit started', code: 'description_changed', description: 'PB wrote this' } }
      : echo('task_A')(_u, body)))
    await mountPanel(<TaskDetailPanel task={mk('task_A', 'A body')} onClose={() => {}} />)
    const ta = await openEditor(document)
    typeInto(ta, 'Mine')
    ta.blur()
    const notice = await waitFor(() => conflictEl(document), 'conflict notice from the 409')
    expect(notice.textContent).toContain('PB wrote this')
    expect(editorEl(document)!.value).toBe('Mine')
    document.querySelector<HTMLElement>('[data-testid="description-keep-mine"]')!.click()
    await expect.poll(() => descWrites(bodies).length).toBe(2)
    expect(descWrites(bodies)[1]).toEqual({ description: 'Mine', expected_description: 'PB wrote this' })
    await expect.poll(() => read(document)).toBe('Mine')
  })

  // Refuter 4 (P1, P1b, P2, P4, P5, P7): there is no save queue. While a
  // description save is in flight the field shows its text with "Saving..."
  // and does not open, so no edit starts from text the server does not hold.
  it('P7/S2d: while a save is in flight a click opens nothing and sends nothing; after it lands the next edit starts from the echo', async () => {
    const server = heldServer({ ...mk('task_A', 'A body') }, (i) => i === 0)
    await mountPanel(<TaskDetailPanel task={mk('task_A', 'A body')} onClose={() => {}} />)
    let ta = await openEditor(document)
    typeInto(ta, 'v2'); ta.blur()
    await expect.poll(() => read(document)).toBe('v2')
    await expect.poll(() => savingEl(document)).not.toBeNull()
    clickField(document)
    await sleep(150)
    expect(editorEl(document)).toBeNull()
    expect(read(document)).toBe('v2') // the in-flight text stays on screen
    expect(server.sent.length).toBe(1)
    server.release(0, true)
    ta = await openEditor(document)
    expect(ta.value).toBe('v2')
    typeInto(ta, 'v2 plus B'); ta.blur()
    await expect.poll(() => server.row.description).toBe('v2 plus B')
    expect(server.sent[1]).toEqual({ description: 'v2 plus B', expected_description: 'v2' })
    expect(conflictEl(document)).toBeNull()
  })

  it('P2: after an in-flight save fails, the field opens on the text still stored (cache parent)', async () => {
    const server = heldServer({ ...mk('task_A', 'A body') }, (i) => i === 0)
    await mountPanel(<ListHost />)
    let ta = await openEditor(document)
    typeInto(ta, 'v2'); ta.blur()
    await expect.poll(() => savingEl(document)).not.toBeNull()
    server.release(0, false)
    ta = await openEditor(document)
    expect(ta.value).toBe('A body')
    typeInto(ta, 'v3'); ta.blur()
    await expect.poll(() => server.row.description).toBe('v3')
    expect(server.sent[1]).toEqual({ description: 'v3', expected_description: 'A body' })
    expect(conflictEl(document)).toBeNull()
  })

  it('P1/P1b: a hung save shows "Saving..." and blocks only its own QueryClient; a fresh one edits at once', async () => {
    const server = heldServer({ ...mk('task_A', 'base') }, (i) => i === 0) // the first POST never answers
    let swapClient: () => void = () => {}
    function ClientSwap() {
      const [n, setN] = useState(0)
      const [qc, setQc] = useState(newQc)
      useEffect(() => { swapClient = () => { setQc(newQc()); setN((x) => x + 1) } }, [])
      return <QueryClientProvider client={qc} key={n}><MemoryRouter><UndoToastProvider><TaskDetailPanel task={mk('task_A', 'base')} onClose={() => {}} /></UndoToastProvider></MemoryRouter></QueryClientProvider>
    }
    await mount(<ClientSwap />, { ready: () => read(document), label: 'panel' })
    const ta = await openEditor(document)
    typeInto(ta, 'v2'); ta.blur()
    await sleep(500)
    expect(savingEl(document)?.textContent).toBe('Saving…') // visible, not silent
    clickField(document)
    await sleep(100)
    expect(editorEl(document)).toBeNull()
    expect(server.sent.length).toBe(1)
    swapClient() // navigation: a fresh QueryClient and a freshly mounted panel
    await expect.poll(() => read(document)).toBe('base')
    const fresh = await openEditor(document)
    typeInto(fresh, 'fresh v2'); fresh.blur()
    await expect.poll(() => server.row.description).toBe('fresh v2')
    expect(server.sent[1]).toEqual({ description: 'fresh v2', expected_description: 'base' })
  })

  it('P4: unmounting mid-save lets the request finish; the next mount reads the server text and opens on it', async () => {
    const server = heldServer({ ...mk('task_A', 'base') }, (i) => i === 0)
    let show: (b: boolean) => void = () => {}
    function Toggle() {
      const [v, setV] = useState(true)
      useEffect(() => { show = setV }, [])
      return v ? <ListHost /> : <div data-testid="gone" />
    }
    await mountPanel(<Toggle />)
    const ta = await openEditor(document)
    typeInto(ta, 'v2'); ta.blur()
    await expect.poll(() => savingEl(document)).not.toBeNull()
    show(false)
    await waitFor(() => document.querySelector('[data-testid="gone"]'), 'gone')
    server.release(0, true)
    await expect.poll(() => server.row.description).toBe('v2')
    show(true)
    await expect.poll(() => read(document)).toBe('v2')
    const again = await openEditor(document)
    expect(again.value).toBe('v2')
    typeInto(again, 'v3'); again.blur()
    await expect.poll(() => server.row.description).toBe('v3')
    expect(server.sent[1]).toEqual({ description: 'v3', expected_description: 'v2' })
  })

  it('P5: the same task in two panels: the second shows "Saving..." and does not open until the first save lands', async () => {
    const server = heldServer({ ...mk('task_A', 'base') }, (i) => i === 0)
    function TwoPanels() {
      const q = useQuery({ queryKey: ['tasks', {}], queryFn: () => fetch('/api/tasks').then((r) => r.json()).then((j) => j.data as TaskRow[]) })
      if (!q.data?.[0]) return null
      return <><div id="p1"><TaskDetailPanel task={q.data[0]} onClose={() => {}} /></div><div id="p2"><TaskDetailPanel task={q.data[0]} onClose={() => {}} /></div></>
    }
    await mount(
      <QueryClientProvider client={newQc()}><MemoryRouter><UndoToastProvider><TwoPanels /></UndoToastProvider></MemoryRouter></QueryClientProvider>,
      { ready: () => document.querySelectorAll('[data-testid="task-description"]').length === 2, label: 'two panels' },
    )
    const p1 = document.getElementById('p1')!
    const p2 = document.getElementById('p2')!
    const ta = await openEditor(p1)
    typeInto(ta, 'p1 v2'); ta.blur()
    await expect.poll(() => savingEl(p2)).not.toBeNull()
    expect(read(p2)).toBe('p1 v2')
    clickField(p2)
    await sleep(100)
    expect(editorEl(p2)).toBeNull()
    server.release(0, true)
    const ta2 = await openEditor(p2)
    expect(ta2.value).toBe('p1 v2')
    typeInto(ta2, 'p2 v3'); ta2.blur()
    await expect.poll(() => server.row.description).toBe('p2 v3')
    expect(server.sent[1]).toEqual({ description: 'p2 v3', expected_description: 'p1 v2' })
    expect(document.querySelectorAll('[data-testid="task-description-conflict"]').length).toBe(0)
  })

  it('Alt+ArrowDown inside the textarea does not swap tasks or write anything to the next task', async () => {
    const bodies = captureWrites()
    await mountPanel(<NavHost a={mk('task_A', 'A body')} b={mk('task_B', 'B body [meeting:cal-1:bbb]')} />)
    const ta = await openEditor(document)
    typeInto(ta, 'A edited by user')
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }))
    await sleep(200)
    expect(editorEl(document)?.value).toBe('A edited by user')
    expect(bodies.filter((b) => b.includes('task_B'))).toEqual([])
  })

  it('a task swap mid-edit saves the draft to the ORIGINAL task only, with its own marker', async () => {
    const bodies = captureWrites()
    await mountPanel(<NavHost a={mk('task_A', 'A body [meeting:cal-1:aaa]')} b={mk('task_B', 'B body [meeting:cal-1:bbb]')} />)
    const ta = await openEditor(document)
    typeInto(ta, 'A edited by user')
    swap(mk('task_B', 'B body [meeting:cal-1:bbb]'))
    await expect.poll(() => read(document)).toBe('B body')
    await expect.poll(() => descWrites(bodies).length).toBe(1)
    const writes = bodies.filter((b) => b.includes('"description"'))
    expect(writes[0]).toContain('task_A')
    expect(descWrites(bodies)[0]).toEqual({ description: 'A edited by user [meeting:cal-1:aaa]', expected_description: 'A body [meeting:cal-1:aaa]' })
    expect(bodies.filter((b) => b.includes('task_B'))).toEqual([])
    // B's field starts closed: nothing carried over.
    expect(editorEl(document)).toBeNull()
  })
})
