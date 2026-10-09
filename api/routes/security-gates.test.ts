// security-gates.test.ts — guard tests for the Hub pre-adoption security batch
//
// Covers:
//   AM-3 (SEC-T0-1): unauth /api/team omits `email`; unauth /api/meetings
//                    omits `notes`/`agenda`/`decisions`.
//   AM-4 (SEC-T0-2): /api/search returns a project hit only to its members.
//   AM-6 / B11:      /api/files on a project the caller is not on → 403.
//
// AM-3 and UX-5 use lightweight SQL-shape stubs. AM-4 and B11 run on the
// migration-chain database through each caller's viewer-bound handle, since
// 2026-10-09 the visibility rule lives there (membership; category is a label).

import { describe, it, expect } from 'vitest'
import { handleGetTeam } from './team'
import { handleGetMeetings } from './meetings'
import { handleGetSearch } from './search'
import { handleListFiles } from './uploads'
import type { Env } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { viewerDb, personViewer } from '../lib/viewer-db'

// ── AM-3: /api/team and /api/meetings ───────────────────────────────────────
// The anonymous projection moved out of these handlers to the route layer:
// /api/team is a public GET whose anonShape keeps slug + name, /api/meetings
// is auth: 'authed'. The anonymous half is proved through the real worker in
// api/index.anon-reads.test.ts. What stays here: the handlers hand signed-in
// callers the full row.
describe('handleGetTeam — signed-in callers get the full row', () => {
  it('includes email (anonymous callers are cut down by the route anonShape)', async () => {
    const env = {
      DB: {
        prepare: (sql: string) => ({
          all: async () => {
            expect(sql).toMatch(/SELECT \* FROM team_members/i)
            return { results: [{ id: 'm1', name: 'Nick', slug: 'nick-ingraham', email: 'ingra107@umn.edu', auto_created: 0 }] }
          },
        }),
      },
    } as unknown as Env
    const res = await handleGetTeam(env)
    const body = await res.json() as { data: Record<string, unknown>[] }
    expect(body.data[0]).toHaveProperty('email', 'ingra107@umn.edu')
  })
})

describe('handleGetMeetings — signed-in callers get the full row', () => {
  it('includes notes (the route refuses anonymous callers before the handler)', async () => {
    const env = {
      DB: {
        prepare: (sql: string) => ({
          all: async () => {
            expect(sql).toMatch(/SELECT \* FROM meetings/i)
            return { results: [{ id: 'mtg1', date: '2026-05-22', title: 'Lab meeting', notes: 'PRIVATE NOTES' }] }
          },
        }),
      },
    } as unknown as Env
    const res = await handleGetMeetings(env)
    const body = await res.json() as { data: Record<string, unknown>[] }
    expect(body.data[0]).toHaveProperty('notes', 'PRIVATE NOTES')
  })
})

// ── AM-4 + B11: membership through the handle ─────────────────────────────────
// A 'Peripheral Brain'-category project with one member (the collaborator) and
// a file on it. Casey is not a member. Category plays no part.
function membershipEnvs() {
  const db = prodSchemaDb()
  insertRow(db, 'team_members', { id: 'tm-collab', name: 'Collab', slug: 'collaborator', email: 'collab@umn.edu' })
  insertRow(db, 'team_members', { id: 'tm-casey', name: 'Casey', slug: 'casey-eddington', email: 'eddin022@umn.edu' })
  insertRow(db, 'projects', { id: 'proj_secret', slug: 'pb-secret', title: 'PB Secret Project', category: 'Peripheral Brain', status: 'active', stage: 'idea' })
  db.prepare("INSERT INTO project_members (project_id, member_slug, added_by) VALUES ('proj_secret', 'collaborator', 'test')").run()
  insertRow(db, 'file_attachments', { id: 'f1', entity_type: 'project', entity_id: 'pb-secret', filename: 'secret.pdf', r2_key: 'project/pb-secret/secret.pdf', uploaded_by: 'collaborator' })
  const raw = d1Adapter(db)
  const as = (slug: string, email: string) => ({ DB: viewerDb(raw, personViewer({ slug, email, pi: false })) }) as unknown as Env
  return { member: as('collaborator', 'collab@umn.edu'), nonMember: as('casey-eddington', 'eddin022@umn.edu'), pbKey: { DB: raw } as unknown as Env }
}

describe('handleGetSearch — AM-4 project hits follow membership', () => {
  const projectHits = async (env: Env) => {
    const res = await handleGetSearch(new URL('https://x/api/search?q=secret'), env, new Request('https://internal/search'))
    const body = await res.json() as { data: { type: string; title: string }[] }
    return body.data.filter((r) => r.type === 'project').map((r) => r.title)
  }

  it('a non-member gets no hit for a project they are not on', async () => {
    expect(await projectHits(membershipEnvs().nonMember)).toEqual([])
  })

  it('a member gets the hit, Peripheral Brain category or not', async () => {
    expect(await projectHits(membershipEnvs().member)).toEqual(['PB Secret Project'])
  })
})

describe('handleListFiles — B11 attachments follow membership', () => {
  const url = new URL('https://x/api/files?entity_type=project&entity_id=pb-secret')

  it('returns 403 to a non-member', async () => {
    expect((await handleListFiles(url, membershipEnvs().nonMember)).status).toBe(403)
  })

  it('lists the files for a member', async () => {
    const res = await handleListFiles(url, membershipEnvs().member)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('secret.pdf')
  })

  it('lists the files for the PB key', async () => {
    expect((await handleListFiles(url, membershipEnvs().pbKey, true)).status).toBe(200)
  })
})

// ── Search source isolation (UX-5) ───────────────────────────────────────────
// When one source query rejects, Promise.allSettled keeps the rest. Verify:
//  - response is still 200
//  - successful sources' results are present
//  - failed source is absent from data
//  - `partial: true` and `failedSources` are present in the body
describe('handleGetSearch — UX-5 source isolation on partial failure', () => {
  // Stub: projects query throws; every other query returns one matching row.
  function partialEnv(): Env {
    return {
      DB: {
        prepare: (sql: string) => ({
          bind: (..._args: unknown[]) => ({
            all: async () => {
              // The projects query is the one that carries "FROM projects WHERE
              // (title LIKE" — make it throw to simulate a D1 timeout on that
              // table while every other source succeeds.
              if (/FROM projects/i.test(sql) && /WHERE \(title LIKE/i.test(sql)) {
                throw new Error('simulated D1 timeout on projects')
              }
              // tasks query — return one hit so we can verify it comes through
              if (/FROM tasks/i.test(sql)) {
                return {
                  results: [{
                    id: 'task-1', title: 'isolated task', description: null,
                    assignee: 'nick', status: 'todo', priority: 'medium',
                    due_date: null, project_id: null, created_at: '2026-05-22',
                  }],
                }
              }
              return { results: [] }
            },
          }),
        }),
      },
    } as unknown as Env
  }

  it('returns 200 when one source throws', async () => {
    const url = new URL('https://x/api/search?q=isolated')
    const res = await handleGetSearch(url, partialEnv(), new Request('https://internal/search'))
    expect(res.status).toBe(200)
  })

  it('includes results from successful sources', async () => {
    const url = new URL('https://x/api/search?q=isolated')
    const res = await handleGetSearch(url, partialEnv(), new Request('https://internal/search'))
    const body = await res.json() as { data: { type: string }[]; count: number; partial?: boolean; failedSources?: string[] }
    const taskHits = body.data.filter((r) => r.type === 'task')
    expect(taskHits).toHaveLength(1)
  })

  it('excludes results from the failed source', async () => {
    const url = new URL('https://x/api/search?q=isolated')
    const res = await handleGetSearch(url, partialEnv(), new Request('https://internal/search'))
    const body = await res.json() as { data: { type: string }[] }
    expect(body.data.filter((r) => r.type === 'project')).toHaveLength(0)
  })

  it('sets partial:true and names the failed source', async () => {
    const url = new URL('https://x/api/search?q=isolated')
    const res = await handleGetSearch(url, partialEnv(), new Request('https://internal/search'))
    const body = await res.json() as { partial?: boolean; failedSources?: string[] }
    expect(body.partial).toBe(true)
    expect(body.failedSources).toContain('projects')
  })

  it('omits partial/failedSources when all sources succeed', async () => {
    // Use the existing searchEnv() shape (all tables respond, no throws).
    const allOkEnv: Env = {
      DB: {
        prepare: (_sql: string) => ({
          bind: (..._args: unknown[]) => ({
            all: async () => ({ results: [] }),
          }),
        }),
      },
    } as unknown as Env
    const url = new URL('https://x/api/search?q=anything')
    const res = await handleGetSearch(url, allOkEnv, new Request('https://internal/search'))
    const body = await res.json() as { partial?: boolean; failedSources?: string[] }
    expect(body.partial).toBeUndefined()
    expect(body.failedSources).toBeUndefined()
  })
})
