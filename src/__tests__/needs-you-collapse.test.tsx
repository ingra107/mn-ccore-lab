// Needs you collapse (Nick, 2026-10-26): the whole card folds into the stat
// line as "N needs you", a real button; a click puts the card back where it
// was; the fold survives a reload. Real Chromium, the real QuestionsCard,
// StatLine and useNeedsYouCollapsed (the same hook TodayPage calls), signed
// out so the pref lives in its localStorage cache ('mnccore.pref.<key>').
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { UndoToastProvider } from '../components/UndoToast'
import { QuestionsCard } from '../components/tasks/QuestionsCard'
import { StatLine } from '../components/today/StatLine'
import { useNeedsYouCollapsed } from '../hooks/useNeedsYouCollapsed'
import type { TaskRow } from '../lib/api'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()

const PREF = 'mnccore.pref.today.needsYouCollapsed'
const zero = { overdue: 0, stalled: 0, planned: 0, meetings: 0, doneToday: 0 }

beforeEach(() => { localStorage.removeItem(PREF) })

function question(id: string): TaskRow {
  return {
    id,
    title: 'q',
    assignee: 'nick-ingraham',
    status: 'todo',
    source: 'meeting_match',
    completed: 0,
    kind: 'question',
    question_spec_json: JSON.stringify({
      v: 1, kind: 'meeting_match', prompt: `Prompt ${id}`, rec: 'c1', allow_text: false,
      choices: [{ key: 'c1', label: 'One' }, { key: 'c2', label: 'Two' }],
    }),
    question_answer_json: null,
    question_telegram_json: null,
    created_at: '2026-09-17T17:04:06Z',
  } as unknown as TaskRow
}

/** The Today wiring: the hook, the card above the stat line, the stat line. */
function TodayBits({ tasks }: { tasks: TaskRow[] }) {
  const { folded, count, collapse, restore } = useNeedsYouCollapsed(tasks)
  return (
    <QueryClientProvider client={new QueryClient()}>
      <UndoToastProvider>
        <MemoryRouter>
          {!folded && <QuestionsCard tasks={tasks} band={false} onCollapse={collapse} />}
          <StatLine counts={zero} needsYou={folded ? { count, onShow: restore } : undefined} />
        </MemoryRouter>
      </UndoToastProvider>
    </QueryClientProvider>
  )
}

const ready = (h: HTMLElement) => h.querySelector('.tk-stats')
const card = (h: HTMLElement) => h.querySelector('section[aria-label="Needs you"]')
const stat = (h: HTMLElement) => h.querySelector('[data-stat="needs-you"]') as HTMLButtonElement | null

describe('Needs you collapse', () => {
  it('collapse hides the card, the stat shows the count as a button, a click restores the card', async () => {
    const host = await mount(<TodayBits tasks={[question('a'), question('b'), question('c')]} />, { ready, label: 'Today bits' })
    await waitFor(() => card(host), 'card')
    expect(stat(host)).toBeNull()

    ;(host.querySelector('[data-testid="q-collapse"]') as HTMLButtonElement).click()
    await waitFor(() => stat(host), 'needs-you stat')
    expect(card(host)).toBeNull()
    const s = stat(host)!
    expect(s.tagName).toBe('BUTTON')
    expect(s.getAttribute('aria-label')).toBe('3 needs you: show the card')
    expect(s.querySelector('.tk-v')!.textContent).toBe('3')

    s.click()
    await waitFor(() => card(host), 'card restored')
    expect(stat(host)).toBeNull()
    expect(localStorage.getItem(PREF)).toBe('false')
  })

  it('the fold is saved and is still folded after a reload', async () => {
    const tasks = [question('a')]
    const first = await mount(<TodayBits tasks={tasks} />, { ready, label: 'first mount' })
    ;(first.querySelector('[data-testid="q-collapse"]') as HTMLButtonElement).click()
    await waitFor(() => stat(first), 'folded')
    expect(localStorage.getItem(PREF)).toBe('true')

    // A reload is a fresh mount reading the saved flag.
    const second = await mount(<TodayBits tasks={tasks} />, { ready, label: 'second mount' })
    expect(stat(second)).not.toBeNull()
    expect(card(second)).toBeNull()
  })

  it('with zero questions nothing shows, folded or not', async () => {
    localStorage.setItem(PREF, 'true')
    const folded = await mount(<TodayBits tasks={[]} />, { ready, label: 'folded, none' })
    expect(stat(folded)).toBeNull()
    expect(card(folded)).toBeNull()

    localStorage.removeItem(PREF)
    const open = await mount(<TodayBits tasks={[]} />, { ready, label: 'open, none' })
    expect(stat(open)).toBeNull()
    expect(card(open)).toBeNull()
  })

  it('the collapse control is absent unless the caller passes onCollapse (My Tasks)', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <UndoToastProvider><QuestionsCard tasks={[question('a')]} band={false} /></UndoToastProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => card(host), 'card')
    expect(host.querySelector('[data-testid="q-collapse"]')).toBeNull()
    root.unmount()
    host.remove()
  })
})

describe('StatLine needsYou', () => {
  it('renders no stat for a zero count', async () => {
    const host = await mount(
      <MemoryRouter><StatLine counts={zero} needsYou={{ count: 0, onShow: () => {} }} /></MemoryRouter>,
      { ready, label: 'StatLine' },
    )
    expect(stat(host)).toBeNull()
  })
})
