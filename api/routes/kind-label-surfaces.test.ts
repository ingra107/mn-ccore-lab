// schema-v156 (Nick 2026-11-03): a check-in's title is the bare subject, and
// every TEXT surface names the row from its kind: "Check-in: X", and the same
// for a milestone ("Milestone: X"). A plain task reads bare.
//
// The three server text surfaces, each run against the real migrated schema
// (prodSchemaDb) through its real handler:
//   - the daily digest email (api/routes/digest-email.ts): the server renders
//     the label into the HTML;
//   - search (api/routes/search.ts): the server renders it into the hit title;
//   - the calendar feed (api/routes/calendar.ts): the server returns `kind`,
//     and the page labels through displayNames.taskShortLabel
//     (src/__tests__/calendar-agenda-sleek.test.tsx checks that half).

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { handleDigestPreview } from './digest-email'
import { handleGetSearch } from './search'
import { handleCalendarEvents } from './calendar'
import { ctToday } from '../lib/ct-date'
import type { Env } from '../helpers'

let db: InstanceType<typeof Database>
let env: Env
beforeEach(() => {
  db = prodSchemaDb()
  env = { DB: d1Adapter(db) } as unknown as Env
  const today = ctToday()
  const row = (id: string, title: string, kind: string) =>
    insertRow(db, 'tasks', { id, title, kind, assignee: 'nick-ingraham', due_date: today, status: 'todo' })
  row('task_c', 'Ask Casey about zebra', 'checkin')
  row('task_m', 'LOI zebra due', 'milestone')
  row('task_t', 'Draft zebra methods', 'task')
})

describe('digest email names check-ins and milestones', () => {
  it('renders the kind label from kind, a plain task bare', async () => {
    const res = await handleDigestPreview(new URL('https://x/api/digest-preview?member=nick-ingraham'), env)
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('>Check-in: Ask Casey about zebra</a>')
    expect(html).toContain('>Milestone: LOI zebra due</a>')
    expect(html).toContain('>Draft zebra methods</a>')
  })
})

describe('search names check-ins and milestones', () => {
  it('a task hit carries the kind label in its title', async () => {
    const res = await handleGetSearch(new URL('https://x/api/search?q=zebra'), env, new Request('https://internal/api/search'))
    const body = await res.json() as { data: Array<{ id: string; type: string; title: string }> }
    const byId = Object.fromEntries(body.data.filter((r) => r.type === 'task').map((r) => [r.id, r.title]))
    expect(byId).toEqual({
      task_c: 'Check-in: Ask Casey about zebra',
      task_m: 'Milestone: LOI zebra due',
      task_t: 'Draft zebra methods',
    })
  })
})

describe('calendar feed carries kind so the page can name the row', () => {
  it('each task event has its kind; title stays the full, unlabelled title (the dedup key)', async () => {
    const res = await handleCalendarEvents(new URL('https://x/api/calendar/events'), env, 'nick-ingraham')
    const body = await res.json() as { data: Array<{ id: string; title: string; kind: string | null; type: string }> }
    const tasks = Object.fromEntries(body.data.filter((e) => e.type === 'task').map((e) => [e.id, [e.kind, e.title]]))
    expect(tasks).toEqual({
      task_c: ['checkin', 'Ask Casey about zebra'],
      task_m: ['milestone', 'LOI zebra due'],
      task_t: ['task', 'Draft zebra methods'],
    })
  })
})
