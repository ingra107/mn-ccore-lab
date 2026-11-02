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
//     overwriting (the lost-update repro);
//   - the description_json fallback never hides the stored description.
// Runs in real Chromium (vitest.config.ts browser mode).
// Run: npx vitest run --config vitest.config.ts src/__tests__/task-description-markdown.test.tsx

import { describe, it, expect, afterEach, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import TaskDetailPanel, { DescriptionField } from '../components/tasks/TaskDetailPanel'
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

let setExternal: (d: string | null) => void = () => {}
let setShown: (b: boolean) => void = () => {}
function Host({ initial, json = null, onSave = () => {} }: { initial: string | null; json?: string | null; onSave?: (id: string, v: string | null) => void }) {
  const [description, setDescription] = useState<string | null>(initial)
  const [show, setShow] = useState(true)
  useEffect(() => { setExternal = setDescription; setShown = setShow }, [])
  return show ? <DescriptionField taskId="task_H" description={description} descriptionJson={json} onSave={onSave} /> : null
}

const read = (h: ParentNode) => h.querySelector('[data-testid="task-description"]')?.textContent ?? null
const editor = (h: ParentNode) => waitFor(() => h.querySelector<HTMLTextAreaElement>('[data-testid="task-description-editor"]'), 'editor')
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
    const notice = await waitFor(() => host.querySelector('[data-testid="task-description-conflict"]'), 'conflict notice')
    expect(notice.textContent).toContain('This description changed while you were editing.')
    expect(notice.textContent).toContain('PB appended an important note')
    expect(onSave).not.toHaveBeenCalled()
    // The draft is still open and intact.
    expect(host.querySelector<HTMLTextAreaElement>('[data-testid="task-description-editor"]')!.value).toBe('Start plus my words')
    host.querySelector<HTMLElement>('[data-testid="description-keep-mine"]')!.click()
    await expect.poll(() => onSave.mock.calls.length).toBe(1)
    expect(onSave).toHaveBeenCalledWith('task_H', 'Start plus my words')
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

  it('Ctrl+Enter saves exactly once', async () => {
    const onSave = vi.fn()
    const host = await mount(<Host initial="x" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    const ta = await openEditor(host)
    typeInto(ta, 'y')
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }))
    await sleep(200)
    expect(onSave.mock.calls).toEqual([['task_H', 'y']])
  })

  it('clearing a body that carries a meeting marker keeps only the marker', async () => {
    const onSave = vi.fn()
    const host = await mount(<Host initial="body [meeting:cal-1:abc]" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    const ta = await openEditor(host)
    typeInto(ta, '')
    ta.blur()
    await expect.poll(() => onSave.mock.calls.length).toBe(1)
    expect(onSave).toHaveBeenCalledWith('task_H', '[meeting:cal-1:abc]')
  })

  it('unmounting mid-edit saves the draft to the task it was typed on', async () => {
    const onSave = vi.fn()
    const host = await mount(<Host initial="x" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    const ta = await openEditor(host)
    typeInto(ta, 'typed then closed')
    setShown(false)
    await sleep(100)
    expect(onSave.mock.calls).toEqual([['task_H', 'typed then closed']])
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

function captureWrites(): string[] {
  const bodies: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (typeof init?.body === 'string') bodies.push(`${String(url)} ${init.body}`)
    return { ok: false, status: 500, json: async () => ({}) } as Response
  }))
  return bodies
}

let swap: (t: TaskRow) => void = () => {}
function NavHost({ a, b }: { a: TaskRow; b: TaskRow }) {
  const [t, setT] = useState(a)
  useEffect(() => { swap = setT }, [])
  return <TaskDetailPanel task={t} onClose={() => {}} onNext={() => setT(b)} onPrev={() => setT(a)} />
}

async function mountPanel(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
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
    await expect.poll(() => bodies.some((b) => b.includes('"description"'))).toBe(true)
    const write = bodies.find((b) => b.includes('"description"'))!
    expect(write).toContain('task_desc_1')
    expect(write).toContain('New body with [a link](https://example.org) [meeting:cal-1:abc]')
    expect(bodies.some((b) => b.includes('description_json'))).toBe(false)
  })

  it('Alt+ArrowDown inside the textarea does not swap tasks or write anything to the next task', async () => {
    const bodies = captureWrites()
    await mountPanel(<NavHost a={mk('task_A', 'A body')} b={mk('task_B', 'B body [meeting:cal-1:bbb]')} />)
    const ta = await openEditor(document)
    typeInto(ta, 'A edited by user')
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }))
    await sleep(200)
    expect(document.querySelector<HTMLTextAreaElement>('[data-testid="task-description-editor"]')?.value).toBe('A edited by user')
    expect(bodies.filter((b) => b.includes('task_B'))).toEqual([])
  })

  it('a task swap mid-edit saves the draft to the ORIGINAL task only, with its own marker', async () => {
    const bodies = captureWrites()
    await mountPanel(<NavHost a={mk('task_A', 'A body [meeting:cal-1:aaa]')} b={mk('task_B', 'B body [meeting:cal-1:bbb]')} />)
    const ta = await openEditor(document)
    typeInto(ta, 'A edited by user')
    swap(mk('task_B', 'B body [meeting:cal-1:bbb]'))
    await expect.poll(() => read(document)).toBe('B body')
    await expect.poll(() => bodies.filter((b) => b.includes('"description"')).length).toBe(1)
    const writes = bodies.filter((b) => b.includes('"description"'))
    expect(writes[0]).toContain('task_A')
    expect(writes[0]).toContain('A edited by user [meeting:cal-1:aaa]')
    expect(bodies.filter((b) => b.includes('task_B'))).toEqual([])
    // B's field starts closed: nothing carried over.
    expect(document.querySelector('[data-testid="task-description-editor"]')).toBeNull()
  })
})
