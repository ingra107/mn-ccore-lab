/**
 * /og/:type/:slug share cards draw only public data, the same for everyone.
 *
 * Before 2026-10-08 the Pages function read D1 and rendered the title of any
 * project, meeting or artifact to anyone who knew its slug or id (confirmed
 * against prod with curl, no credentials: /og/project/<slug> returned the
 * project title, stage and PI). Those cards are retired: no unfurler could
 * reach them (see og-card.ts). What is left is the team card, name only, and
 * the generic lab card.
 */

import { describe, it, expect } from 'vitest'
import { handleOgCard } from './og-card'
import type { Env } from '../types'

let queries: string[] = []

function makeEnv(): Env {
  const db = {
    prepare(sql: string) {
      queries.push(sql)
      const stmt = (args: unknown[]) => ({
        async first() {
          if (sql.includes('FROM team_members')) return args[0] === 'pat' ? { name: 'Pat Example' } : null
          return null
        },
      })
      return { ...stmt([]), bind: (...args: unknown[]) => stmt(args) }
    },
  }
  return { DB: db } as unknown as Env
}

async function card(type: string, slug: string) {
  queries = []
  const res = await handleOgCard(type, slug, makeEnv())
  return { res, text: await res.text() }
}

describe('og cards', () => {
  it('a team card shows the member name only, as GET /api/team does', async () => {
    const { res, text } = await card('team', 'pat')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('image/svg+xml')
    expect(text).toContain('Pat Example')
    expect(queries).toEqual(['SELECT name FROM team_members WHERE slug = ?'])
  })

  it('a missing member gets the generic card, never the slug', async () => {
    const { text } = await card('team', 'nope')
    expect(text).toContain('Research operations')
    expect(text).not.toContain('nope')
  })

  it.each(['project', 'meeting', 'artifact', 'anything'])('/og/%s/* is the generic card and reads nothing', async (type) => {
    const { text } = await card(type, 'some-id')
    expect(text).toContain('Research operations')
    expect(text).not.toContain('some-id')
    expect(queries).toEqual([])
  })

  it('is publicly cacheable', async () => {
    expect((await card('team', 'pat')).res.headers.get('Cache-Control')).toContain('public')
  })
})
