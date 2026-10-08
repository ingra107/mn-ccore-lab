/**
 * /og/:type/:slug share cards: a logged-out caller sees only public data.
 *
 * Before 2026-10-08 the Pages function read D1 and rendered the title of any
 * project, meeting or artifact to anyone who knew its slug or id (confirmed
 * against prod with curl, no credentials: /og/project/<slug> returned the
 * project title, stage and PI).
 */

import { describe, it, expect } from 'vitest'
import { handleOgCard } from './og-card'
import type { Env } from '../types'

const KEY = 'test-pb-api-key'
const TEST_MODE_KEY = 'test-mode-key'

const ROWS: Record<string, Record<string, unknown>> = {
  projects: { id: 'proj_1', title: 'Secret Project Title', pi: null, stage: 'analysis', category: 'clif' },
  projects_pb: { id: 'proj_2', title: 'PB Internal Plan', pi: null, stage: 'active', category: 'Peripheral Brain' },
  meetings: { title: 'Private Meeting Title', date: '2026-10-08', type: 'lab' },
  team_members: { name: 'Pat Example', role: 'Fellow', credentials: 'MD', title: 'Clinical Fellow' },
  artifact_team: { title: 'Team Draft Artifact', version: 1, created_by: null, created_at: '2026-10-01', visibility: 'team', content_type: 'html' },
  artifact_public: { title: 'Published Explainer', version: 2, created_by: null, created_at: '2026-10-02', visibility: 'public', content_type: 'html' },
}

function makeEnv(): Env {
  const db = {
    prepare(sql: string) {
      const pick = (args: unknown[]) => {
        if (sql.includes('lab_settings')) return { value: JSON.stringify(['pi@umn.edu']) }
        if (sql.includes('FROM projects')) return args[0] === 'pb-proj' ? ROWS.projects_pb : args[0] === 'proj-slug' ? ROWS.projects : null
        if (sql.includes('FROM meetings')) return args[0] === 'mtg_1' ? ROWS.meetings : null
        if (sql.includes('FROM team_members') && sql.includes('credentials')) return args[0] === 'pat' ? ROWS.team_members : null
        if (sql.includes('FROM team_members')) return null
        if (sql.includes('FROM artifacts')) return args[0] === 'art_team' ? ROWS.artifact_team : args[0] === 'art_pub' ? ROWS.artifact_public : null
        return null
      }
      const stmt = (args: unknown[]) => ({
        async first() { return pick(args) },
        async all() { return { results: [], success: true, meta: {} } },
        async run() { return { success: true, meta: { changes: 0 } } },
      })
      return { ...stmt([]), bind: (...args: unknown[]) => stmt(args) }
    },
  }
  return { DB: db, PB_API_KEY: KEY, TEST_MODE_KEY } as unknown as Env
}

async function card(type: string, slug: string, headers: Record<string, string> = {}) {
  const res = await handleOgCard(type, slug, new Request(`https://hub.test/og/${type}/${slug}`, { headers }), makeEnv())
  return { res, text: await res.text() }
}

const API_KEY = { Authorization: `Bearer ${KEY}` }
// Same identity path a CF Access session takes through getAuthUser, minus JWKS.
const MEMBER = { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': 'member@umn.edu' }

describe('logged-out caller', () => {
  it.each([
    ['project', 'proj-slug', 'Secret Project Title'],
    ['project', 'pb-proj', 'PB Internal Plan'],
    ['meeting', 'mtg_1', 'Private Meeting Title'],
    ['artifact', 'art_team', 'Team Draft Artifact'],
  ])('gets the generic card for %s %s, never its title', async (type, slug, secret) => {
    const { res, text } = await card(type, slug)
    expect(res.status).toBe(200)
    expect(text).not.toContain(secret)
    expect(text).toContain('Research operations')
  })

  it('cannot tell a missing entity from a private one', async () => {
    const missing = await card('project', 'nope')
    const hidden = await card('project', 'proj-slug')
    expect(missing.text).toBe(hidden.text)
    expect(missing.text).not.toContain('nope')
  })

  it('sees a published artifact title (same predicate /a/:id serves on)', async () => {
    const { text } = await card('artifact', 'art_pub')
    expect(text).toContain('Published Explainer')
  })

  it('sees a team member name only, as GET /api/team does', async () => {
    const { text } = await card('team', 'pat')
    expect(text).toContain('Pat Example')
    expect(text).not.toContain('Clinical Fellow')
    expect(text).not.toContain('MD')
  })

  it('is publicly cacheable', async () => {
    const { res } = await card('project', 'proj-slug')
    expect(res.headers.get('Cache-Control')).toContain('public')
  })

  it('a wrong API key reads as logged out, not as signed in', async () => {
    const { text } = await card('project', 'proj-slug', { Authorization: 'Bearer wrong' })
    expect(text).not.toContain('Secret Project Title')
  })
})

describe('signed-in caller', () => {
  it('gets the full project card, never publicly cached', async () => {
    const { res, text } = await card('project', 'proj-slug', MEMBER)
    expect(text).toContain('Secret Project Title')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Vary')).toContain('Cookie')
  })

  it('gets meeting and team-only artifact cards', async () => {
    expect((await card('meeting', 'mtg_1', MEMBER)).text).toContain('Private Meeting Title')
    expect((await card('artifact', 'art_team', MEMBER)).text).toContain('Team Draft Artifact')
    expect((await card('team', 'pat', MEMBER)).text).toContain('Clinical Fellow')
  })

  it('a non-PI member does not see a PB-category project; the API key does', async () => {
    expect((await card('project', 'pb-proj', MEMBER)).text).not.toContain('PB Internal Plan')
    expect((await card('project', 'pb-proj', API_KEY)).text).toContain('PB Internal Plan')
  })
})
