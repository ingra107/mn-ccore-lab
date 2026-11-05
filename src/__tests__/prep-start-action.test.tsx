// Prep & start (2026-11-02, PB Context/Decisions/2026-11-02-prep-and-start.md).
// Nick: "I guess i would assume that if i click start i am getting an interactive
// session". The button renders only for the PI with the launcher, only on an open
// task, fires mnccore://prep/<task id> with nothing else in the URI, and reads
// "Open session" on a task whose first step is already prepared. The Plan section
// shows it per pick beside the background Prep.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DndContext } from '@dnd-kit/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PrepStartAction from '../components/PrepStartAction'
import { PlanSection } from '../components/today/PlanSection'
import { planSectionModel } from '../lib/planSection'
import { PacketBlock } from '../components/today/PacketBlock'
import { UndoToastProvider } from '../components/UndoToast'
import { AuthContext, type AuthUser } from '../hooks/useAuth'
import { LAUNCHER_STORAGE_KEY } from '../hooks/useLauncherInstalled'
import { currentWeekPlan } from '../lib/weekPlan'
import type { TaskRow } from '../lib/api'
import type { TodayStateApi } from '../hooks/useTodayState'

// The launch chokepoint, recorded (the real one sets window.location.href).
const launches = vi.hoisted(() => [] as string[])
vi.mock('../hooks/useProtocolLaunch', () => ({
  useProtocolLaunch: () => ({ launch: async (uri: string) => { launches.push(uri) } }),
}))

const A = 'task_01M6CZS7KZGSA0663NBB3H4HMG'
const B = 'task_01M6CZS7KZGSA0663NBB3H4HMH'
const PI: AuthUser = {
  email: 'ingra107@umn.edu', slug: 'nick-ingraham', isAuthenticated: true, isPi: true,
  isMember: true, canShowAllProjects: true, piResolved: true,
}
const MEMBER: AuthUser = { ...PI, email: 'eddin022@umn.edu', slug: 'casey-eddington', isPi: false, canShowAllProjects: false }

const PACKET = {
  packet: { id: 'pkt_1', used_at: null, closed_at: null },
  version: { version: 1, manifest_hash: 'h', instruction: 'Review the draft to Jane, then send it.', minutes: 5,
    body: 'Hi Jane', calls: [], deliverable: { kind: 'gmail_draft', url: null } },
  freshness: { state: 'ready', reasons: [] },
}

let mounted: { host: HTMLElement; root: Root }[] = []
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-03T18:00:00Z'))
  launches.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/packets/daily-count')) return new Response(JSON.stringify({ date: '2026-11-03', used: 0, cap: 10 }))
    if (String(url) === `/api/tasks/${A}/packet`) return new Response(JSON.stringify(PACKET))
    return new Response(JSON.stringify({ packet: null }))
  }))
})
afterEach(() => {
  vi.useRealTimers()
  for (const { host, root } of mounted) { root.unmount(); host.remove() }
  mounted = []
  localStorage.removeItem(LAUNCHER_STORAGE_KEY)
  vi.unstubAllGlobals()
})

const tick = () => new Promise((r) => setTimeout(r, 30))

async function mount(node: React.ReactNode, user: AuthUser = PI, launcher = true) {
  localStorage.setItem(LAUNCHER_STORAGE_KEY, launcher ? 'yes' : 'no')
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const host = document.createElement('div')
  host.className = 'tk'
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
    <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false }}>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <UndoToastProvider>
            <DndContext>{node}</DndContext>
          </UndoToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>,
  )
  mounted.push({ host, root })
  await tick()
  return host
}

const prep = (h: ParentNode) => [...h.querySelectorAll<HTMLButtonElement>('[data-testid="prep-start"]')]

describe('PrepStartAction', () => {
  it('labels Prep & start, or Open session on a prepared task', async () => {
    const h = await mount(<><PrepStartAction taskId={A} /><PrepStartAction taskId={B} ready /></>)
    expect(prep(h).map((b) => b.textContent?.trim())).toEqual(['Prep & start', 'Open session'])
    expect(prep(h)[0].getAttribute('aria-label')).toContain('prepares this with you')
  })

  it('fires mnccore://prep/<task id> and nothing else', async () => {
    const h = await mount(<PrepStartAction taskId={A} />)
    prep(h)[0].click()
    await tick()
    expect(launches).toEqual([`mnccore://prep/${A}`])
  })

  it('renders nothing for a member, without the launcher, on a done task, or for a non-ULID id', async () => {
    expect(prep(await mount(<PrepStartAction taskId={A} />, MEMBER))).toHaveLength(0)
    expect(prep(await mount(<PrepStartAction taskId={A} />, PI, false))).toHaveLength(0)
    expect(prep(await mount(<PrepStartAction taskId={A} done />))).toHaveLength(0)
    expect(prep(await mount(<PrepStartAction taskId="task_a" />))).toHaveLength(0)
  })

  it('the primary variant is the teal accent button', async () => {
    const h = await mount(<PrepStartAction taskId={A} variant="primary" />)
    expect(prep(h)[0].className).toContain('tk-pri')
  })
})

// ── placements ──────────────────────────────────────────────────────────────

const opt = (key: string, recommended = false) => ({
  key, label: `Option ${key}`, direction: `Direction ${key}`, deliverable_kind: 'gmail_draft', recommended,
})
const SPEC = {
  v: 1, kind: 'week_plan', week_start: '2026-11-02', tz: 'America/Chicago',
  prompt: 'What do you want to take the next step on this week?', expires_at: '2026-11-09T06:00:00Z',
  candidates: [
    { task_id: A, title: 'Answer Jane', why: 'sat 6 days', evidence: [], options: [opt('a1', true), opt('a2')] },
    { task_id: B, title: 'Review abstract', why: 'due Friday', evidence: [], options: [opt('b1', true), opt('b2')] },
  ],
}
const plan = (picks: unknown[] | null) => ({
  id: 'task_plan', title: 'Plan your week', description: '', assignee: 'nick-ingraham', priority: 'medium',
  status: 'todo', source: 'week_plan', completed: 0, completed_at: null, project_id: null, due_date: null,
  created_at: '2026-11-01T21:00:00Z', kind: 'question', question_spec_json: JSON.stringify(SPEC),
  question_answer_json: picks ? JSON.stringify({ v: 1, choice: 'save', via: 'hub', at: '2026-11-02T14:00:00Z', picks }) : null,
  question_consumed_json: null,
} as unknown as TaskRow)
const task = (id: string, extra: Partial<TaskRow> = {}): TaskRow =>
  ({ id, title: `Task ${id}`, status: 'todo', completed: 0, kind: 'task', project_id: null, ...extra } as TaskRow)
const state = {
  planned: {}, done: {}, plannedIds: () => [], markDone: () => {}, uncheck: () => {}, planAt: () => {}, unplan: () => {},
} as unknown as TodayStateApi

describe('The Plan section', () => {
  it('a saved pick offers Prep (background) and Prep & start; a Ready pick offers Open session', async () => {
    const p = currentWeekPlan([plan([
      { task_id: A, option_key: 'a1', text: null, start: false },
      { task_id: B, option_key: 'b1', text: null, start: true },
    ])], '2026-11-03')!
    const h = await mount(
      <PlanSection plan={p} model={planSectionModel(p, [task(A), task(B, { packet_state: 'ready' })], {}, '2026-11-03')} state={state} projectsByPid={new Map()} viewerSlug="" />,
    )
    const [rowA, rowB] = [...h.querySelectorAll('[data-testid="plan-card"]')]
    expect(rowA.querySelector('[data-testid="pick-start"]')!.textContent).toBe('Prep')
    expect(prep(rowA).map((b) => b.textContent?.trim())).toEqual(['Prep & start'])
    expect(rowB.querySelector('[data-testid="pick-start"]')).toBeNull()
    expect(prep(rowB).map((b) => b.textContent?.trim())).toEqual(['Open session'])
  })

  it('a member sees no session button and no empty action wrapper', async () => {
    const p = currentWeekPlan([plan([{ task_id: B, option_key: 'b1', text: null, start: true }])], '2026-11-03')!
    const h = await mount(
      <PlanSection plan={p} model={planSectionModel(p, [task(B)], {}, '2026-11-03')} state={state} projectsByPid={new Map()} viewerSlug="" />, MEMBER,
    )
    expect(h.querySelector('.tk-first-acts')).toBeNull()
  })
})

describe('Prepared step', () => {
  it('a Ready packet carries Open session beside Use and Dismiss', async () => {
    const h = await mount(<PacketBlock taskId={A} />)
    for (let i = 0; i < 50 && !h.querySelector('[data-testid="packet-block"]'); i++) await tick()
    const acts = h.querySelector('.tk-pk-acts')!
    expect(prep(acts).map((b) => b.textContent?.trim())).toEqual(['Open session'])
    prep(acts)[0].click()
    await tick()
    expect(launches).toEqual([`mnccore://prep/${A}`])
  })
})
