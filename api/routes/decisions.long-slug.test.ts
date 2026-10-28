// The decisions panel filtered with `linked_projects LIKE ?` bound to
// `%${slug}%`. D1 refuses a LIKE pattern over 50 bytes, so a long project slug
// errored or came back empty on prod while every local test passed. The
// adapter in test-support/prod-schema-db.ts now enforces the cap, so this runs
// the route against it with a slug well past 48 bytes.

import { describe, it, expect } from 'vitest'
import type { Env } from '../helpers'
import { handleGetDecisions } from './decisions'
import { prodSchemaDb, insertRow, d1Adapter } from '../test-support/prod-schema-db'

const LONG = 'cqode-backbone-umn-clif-federated-meta-analysis-of-the-sites'

function setup() {
  const db = prodSchemaDb()
  insertRow(db, 'hub_decisions', { id: 'dec-home', title: 'Home', project_slug: LONG, tags: 'stats,irb' })
  insertRow(db, 'hub_decisions', { id: 'dec-linked', title: 'Linked', project_slug: 'other', linked_projects: `["${LONG}"]`, tags: 'long-tag-that-pushes-the-comma-wrapped-pattern-past-fifty-bytes' })
  insertRow(db, 'hub_decisions', { id: 'dec-none', title: 'None', project_slug: 'other', linked_projects: '["something-else"]', tags: 'irb' })
  const sql: string[] = []
  const env = { DB: d1Adapter(db, { onExec: (s) => sql.push(s) }) } as unknown as Env
  const get = async (qs: string) => {
    const res = await handleGetDecisions(new URL(`https://x/api/decisions?${qs}`), env)
    return { status: res.status, ids: ((await res.json() as { data: { id: string }[] }).data).map((r) => r.id).sort() }
  }
  return { get, sql }
}

describe('GET /api/decisions with a long project slug', () => {
  it('returns the home and linked decisions instead of erroring', async () => {
    const { get } = setup()
    expect(LONG.length).toBeGreaterThan(48)
    expect(await get(`project_slug=${LONG}`)).toEqual({ status: 200, ids: ['dec-home', 'dec-linked'] })
  })

  it('matches the slug case-insensitively, as LIKE did', async () => {
    const { get } = setup()
    expect((await get(`project_slug=${LONG.toUpperCase()}`)).ids).toEqual(['dec-linked'])
  })

  it('filters a long tag without LIKE', async () => {
    const { get } = setup()
    expect((await get('tag=long-tag-that-pushes-the-comma-wrapped-pattern-past-fifty-bytes')).ids).toEqual(['dec-linked'])
    expect((await get('tag=irb')).ids).toEqual(['dec-none', 'dec-home'].sort())
  })

  it('runs no LIKE or GLOB at all', async () => {
    const { get, sql } = setup()
    await get(`project_slug=${LONG}&tag=irb`)
    expect(sql.length).toBeGreaterThan(0)
    for (const s of sql) expect(s).not.toMatch(/\b(?:LIKE|GLOB)\b/i)
  })
})
