// The task body is ONE plain-markdown `description` (Nick 2026-11-01: "Yes,
// one plain-markdown store (Recommended)"). Pins the four mechanisms:
//   - the panel shows a description that changes underneath it (a PB write
//     arriving while the panel is open), and an open draft is not clobbered;
//   - an edit writes `description`, never `description_json` (real panel,
//     real useUpdateTask, fetch captured);
//   - the fold fallback shows description_json text description lacks.
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

function typeInto(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

let setExternal: (d: string | null) => void = () => {}
function Host({ initial, json = null, onSave = () => {} }: { initial: string | null; json?: string | null; onSave?: (v: string | null) => void }) {
  const [description, setDescription] = useState<string | null>(initial)
  useEffect(() => { setExternal = setDescription }, [])
  return <DescriptionField description={description} descriptionJson={json} onSave={onSave} />
}

const read = (h: HTMLElement) => h.querySelector('[data-testid="task-description"]')?.textContent ?? null

describe('DescriptionField', () => {
  it('re-renders a description written underneath it while the panel is open', async () => {
    const host = await mount(<Host initial="First version" />, { ready: (h) => read(h), label: 'description' })
    expect(read(host)).toBe('First version')
    setExternal('PB rewrote this')
    await expect.poll(() => read(host)).toBe('PB rewrote this')
  })

  it('keeps an open draft when the description changes underneath it, and saves the draft', async () => {
    const onSave = vi.fn()
    const host = await mount(<Host initial="Start" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    host.querySelector<HTMLElement>('[data-testid="task-description"]')!.click()
    const ta = await waitFor(() => host.querySelector<HTMLTextAreaElement>('[data-testid="task-description-editor"]'), 'editor')
    expect(ta.value).toBe('Start')
    typeInto(ta, 'Start\n- a bullet\n**bold**')
    setExternal('PB write mid-edit')
    await new Promise((r) => setTimeout(r, 50))
    expect(host.querySelector<HTMLTextAreaElement>('[data-testid="task-description-editor"]')!.value).toBe('Start\n- a bullet\n**bold**')
    ta.blur()
    await expect.poll(() => onSave.mock.calls.length).toBe(1)
    expect(onSave).toHaveBeenCalledWith('Start\n- a bullet\n**bold**')
  })

  it('a blur with no change saves nothing; Escape cancels', async () => {
    const onSave = vi.fn()
    const host = await mount(<Host initial="Same" onSave={onSave} />, { ready: (h) => read(h), label: 'description' })
    host.querySelector<HTMLElement>('[data-testid="task-description"]')!.click()
    const ta = await waitFor(() => host.querySelector<HTMLTextAreaElement>('[data-testid="task-description-editor"]'), 'editor')
    ta.blur()
    await waitFor(() => read(host), 'read view again')
    expect(onSave).not.toHaveBeenCalled()
    host.querySelector<HTMLElement>('[data-testid="task-description"]')!.click()
    const ta2 = await waitFor(() => host.querySelector<HTMLTextAreaElement>('[data-testid="task-description-editor"]'), 'editor again')
    typeInto(ta2, 'Changed then cancelled')
    ta2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await waitFor(() => read(host), 'read view after Escape')
    await new Promise((r) => setTimeout(r, 50))
    expect(onSave).not.toHaveBeenCalled()
    expect(read(host)).toBe('Same')
  })

  it('shows description_json text when description is empty, and edits start from it', async () => {
    const host = await mount(<Host initial={null} json={docJson('Typed in the old editor')} />, { ready: (h) => read(h), label: 'fallback' })
    expect(read(host)).toBe('Typed in the old editor')
    host.querySelector<HTMLElement>('[data-testid="task-description"]')!.click()
    const ta = await waitFor(() => host.querySelector<HTMLTextAreaElement>('[data-testid="task-description-editor"]'), 'editor')
    expect(ta.value).toBe('Typed in the old editor')
  })

  it('shows description_json text below a description that lacks it, and nothing when it is already there', async () => {
    const host = await mount(<Host initial="A later PB write" json={docJson('Panel edit')} />, { ready: (h) => read(h), label: 'description' })
    expect(read(host)).toBe('A later PB write')
    expect(host.querySelector('[data-testid="task-description-unfolded"]')?.textContent).toContain('Panel edit')
    setExternal('A later PB write\n\n---\n\nPanel edit')
    await expect.poll(() => host.querySelector('[data-testid="task-description-unfolded"]')).toBeNull()
  })
})

describe('TaskDetailPanel description edit', () => {
  it('writes `description`, never `description_json`', async () => {
    const bodies: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body === 'string') bodies.push(init.body)
      return { ok: false, status: 500, json: async () => ({}) } as Response
    }))
    const task = {
      id: 'task_desc_1', title: 'Desc test', status: 'todo', priority: 'medium', assignee: 'nick-ingraham',
      completed: 0, project_id: null, due_date: null,
      description: 'Old body [meeting:cal-1:abc]', description_json: docJson('Old body'),
    } as unknown as TaskRow
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    await mount(
      <QueryClientProvider client={qc}><MemoryRouter><UndoToastProvider>
        <TaskDetailPanel task={task} onClose={() => {}} />
      </UndoToastProvider></MemoryRouter></QueryClientProvider>,
      { ready: () => document.querySelector('[data-testid="task-description"]'), label: 'panel description' },
    )
    // The machine token stays hidden in the read view.
    expect(document.querySelector('[data-testid="task-description"]')!.textContent).toBe('Old body')
    document.querySelector<HTMLElement>('[data-testid="task-description"]')!.click()
    const ta = await waitFor(() => document.querySelector<HTMLTextAreaElement>('[data-testid="task-description-editor"]'), 'editor')
    typeInto(ta, 'New body with [a link](https://example.org)')
    ta.blur()
    await expect.poll(() => bodies.some((b) => b.includes('"description"'))).toBe(true)
    const write = bodies.find((b) => b.includes('"description"'))!
    expect(write).toContain('New body with [a link](https://example.org) [meeting:cal-1:abc]')
    expect(bodies.some((b) => b.includes('description_json'))).toBe(false)
  })
})
