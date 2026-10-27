// #156: the Lab pulse numbers. Lab-wide by Nick's call (2026-10-26), counts
// and slugs only. Runs the real SQL on the migration-chain database.
import { describe, it, expect } from 'vitest'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { labPulseCounts } from './pulse-aggregates'

const NOW = '2026-10-28T15:00:00.000Z'          // a Wednesday
const WEEK_START = '2026-10-26T05:00:00.000Z'   // Monday 00:00 America/Chicago

function db() {
  const d = prodSchemaDb()
  for (const [slug, name] of [['nick-ingraham', 'Nick'], ['casey-eddington', 'Casey'], ['tom-byrd', 'Tom'], ['claude-ai', 'Hermes']]) {
    insertRow(d, 'team_members', { slug, name })
  }
  return d
}
const run = (d: ReturnType<typeof prodSchemaDb>) =>
  labPulseCounts(d1Adapter(d) as unknown as D1Database, { nowIso: NOW, weekStartIso: WEEK_START })

describe('labPulseCounts (#156)', () => {
  it('an empty lab reads zero everywhere', async () => {
    expect(await run(db())).toEqual({ activeSlugs: [], tasksDone: 0, milestonesHit: 0, newPapers: 0 })
  })

  it('active = a member seen or posting in the last 24h, newest first, never Hermes', async () => {
    const d = db()
    insertRow(d, 'entity_seen', { entity_type: 'task', entity_id: 't1', viewer_slug: 'casey-eddington', last_seen_at: '2026-10-28 13:00:00' })
    insertRow(d, 'entity_seen', { entity_type: 'task', entity_id: 't1', viewer_slug: 'nick-ingraham', last_seen_at: '2026-10-27 09:00:00' })
    insertRow(d, 'activity_entries', { id: 'a1', entity_type: 'task', entity_id: 't1', kind: 'comment', actor_slug: 'tom-byrd', body: 'hi', created_at: '2026-10-28 14:30:00' })
    insertRow(d, 'activity_entries', { id: 'a2', entity_type: 'task', entity_id: 't1', kind: 'comment', actor_slug: 'claude-ai', body: 'hi', created_at: '2026-10-28 14:40:00' })
    expect((await run(d)).activeSlugs).toEqual(['tom-byrd', 'casey-eddington'])
  })

  it('counts tasks and milestones done since the week start, not deleted ones', async () => {
    const d = db()
    const t = (id: string, completed_at: string, extra: Record<string, unknown> = {}) =>
      insertRow(d, 'tasks', { id, title: id, assignee: 'nick-ingraham', status: 'done', completed: 1, completed_at, ...extra })
    t('t-in', '2026-10-27T10:00:00.000Z')
    t('t-before', '2026-10-25T10:00:00.000Z')
    t('t-deleted', '2026-10-27T10:00:00.000Z', { deleted_at: '2026-10-27T11:00:00.000Z' })
    t('m-in', '2026-10-28T09:00:00.000Z', { kind: 'milestone' })
    const r = await run(d)
    // A milestone has its own tile: "tasks done" does not count it twice.
    expect(r.tasksDone).toBe(1)
    expect(r.milestonesHit).toBe(1)
  })

  it('new papers: added in the last 30 days, ignoring a bulk sync of more than 5 rows at one instant', async () => {
    const d = db()
    for (let i = 0; i < 6; i++) insertRow(d, 'publications', { id: `bulk${i}`, title: 't', authors: 'a', created_at: '2026-10-20 12:00:00' })
    insertRow(d, 'publications', { id: 'one', title: 't', authors: 'a', created_at: '2026-10-21 12:00:00' })
    insertRow(d, 'publications', { id: 'old', title: 't', authors: 'a', created_at: '2026-08-01 12:00:00' })
    expect((await run(d)).newPapers).toBe(1)
  })
})
