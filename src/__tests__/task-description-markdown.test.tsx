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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
async function openEditor(h: ParentNode) {
  h.querySelector<HTMLElement>('[data-testid="task-description"], [data-testid="task-description-empty"]')!.click()
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

  it('a failed save of my own does not count as an outside change in the edit I began on top of it', async () => {
    // Refuter 2, R2: the first save fails and rolls back while the user re-edits.
    let fail: (r: DescriptionSave) => void = () => {}
    const onSave = vi.fn<OnSave>()
      .mockImplementationOnce(() => new Promise<DescriptionSave>((r) => { fail = r }))
      .mockImplementation(async () => ({ ok: true }))
    const host = await mount(<Host initial="A body" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    let ta = await openEditor(host)
    typeInto(ta, 'A body v2')
    ta.blur()
    setExternal('A body v2') // the panel shows its own save at once
    await expect.poll(() => read(host)).toBe('A body v2')
    ta = await openEditor(host)
    typeInto(ta, 'A body v3')
    fail({ ok: false, changed: false })
    setExternal('A body') // the failed write is rolled back
    await sleep(50)
    ta.blur()
    await expect.poll(() => onSave.mock.calls.length).toBe(2)
    expect(conflictEl(host)).toBeNull()
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

  it('a failed save that rolls back while I re-edit raises no false conflict (cache path)', async () => {
    // Refuter 2, R2 through the real panel and useUpdateTask.
    let calls = 0
    let release: (status: number) => void = () => {}
    const bodies: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body !== 'string') return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response
      bodies.push(`${String(url)} ${init.body}`)
      const body = JSON.parse(init.body) as Record<string, unknown>
      if (++calls === 1) {
        const status = await new Promise<number>((r) => { release = r })
        return { ok: false, status, json: async () => ({ error: 'boom' }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({ data: { ...mk('task_A', null), ...body } }) } as Response
    }))
    const qc = newQc()
    const A = mk('task_A', 'A body')
    qc.setQueryData(['tasks', {}], [A])
    await mountPanel(<TaskDetailPanel task={A} onClose={() => {}} />, qc)
    let ta = await openEditor(document)
    typeInto(ta, 'A body v2')
    ta.blur()
    await expect.poll(() => read(document)).toBe('A body v2')
    ta = await openEditor(document)
    typeInto(ta, 'A body v3')
    release(500)
    await sleep(100)
    ta.blur()
    await expect.poll(() => descWrites(bodies).length).toBe(2)
    expect(conflictEl(document)).toBeNull()
    expect(descWrites(bodies)[1]).toEqual({ description: 'A body v3', expected_description: 'A body' })
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
