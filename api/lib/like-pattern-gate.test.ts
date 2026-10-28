// D1 refuses a LIKE or GLOB pattern over 50 bytes (SQLITE_ERROR "LIKE or GLOB
// pattern too complex"; https://developers.cloudflare.com/d1/platform/limits/).
// better-sqlite3 allows 50,000, so no local run sees it. 16e0dd08 (2026-10-14)
// banned a pattern CONCATENATED in SQL; a pattern BOUND from a slug, tag or
// search string is the same bug, and the decisions panel shipped it
// (`linked_projects LIKE ?` bound to `%${slug}%`, 2026-10-28).
//
// Rule for non-test api/ source: a LIKE/GLOB pattern is a string literal of at
// most 50 bytes. Never a `?`, an expression, or a `${}` interpolation. Use
// instr()/substr() (api/lib/sql-contains.ts) for anything built from data.
// A constant that interpolates into a literal is allowed only through
// ALLOWED_INTERPOLATED, with the reason it is provably short.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { contains } from './sql-contains'
import { prodSchemaDb, insertRow, d1Adapter } from '../test-support/prod-schema-db'

const MAX = 50

/** file (relative to api/) -> exact pattern token -> why its length is bounded. */
const ALLOWED_INTERPOLATED: Record<string, Record<string, string>> = {
  'lib/activity-entry.ts': {
    "'${HERMES_PENDING_PREFIX}%'":
      "HERMES_PENDING_PREFIX is the const 'Thinking about this' (19 bytes) declared in the same file; the pattern is 20 bytes",
  },
}

/** Source with // and block comments blanked, so prose that says "LIKE" is not a pattern. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[\s;,(])\/\/[^\n]*/g, (_m, pre: string) => pre)
}

export type Violation = { token: string; why: string }

/** Every LIKE/GLOB pattern in `src` (SQL or TS source) that breaks the rule. */
export function likePatternViolations(src: string, allowed: Record<string, string> = {}): Violation[] {
  const out: Violation[] = []
  for (const m of src.matchAll(/\b(?:LIKE|GLOB)\s+/g)) {
    const rest = src.slice((m.index ?? 0) + m[0].length)
    const lit = rest.match(/^'(?:[^'\n]|'')*'/)
    if (!lit) {
      out.push({ token: rest.slice(0, 40), why: 'pattern is not a string literal (bound ?, expression or identifier)' })
      continue
    }
    const token = lit[0]
    if (/^\s*\|\|/.test(rest.slice(token.length))) {
      out.push({ token, why: 'literal is concatenated with an expression' })
    } else if (token.includes('${')) {
      if (!(token in allowed)) out.push({ token, why: 'interpolated literal is not in ALLOWED_INTERPOLATED' })
    } else if (new TextEncoder().encode(token.slice(1, -1)).length > MAX) {
      out.push({ token, why: `literal is over ${MAX} bytes` })
    }
  }
  return out
}

describe('LIKE/GLOB patterns stay under D1\'s 50-byte cap', () => {
  it('the scan catches every shape that broke or could break on D1', () => {
    expect(likePatternViolations('a LIKE ?')).toHaveLength(1)
    expect(likePatternViolations('a NOT LIKE ? ESCAPE')).toHaveLength(1)
    expect(likePatternViolations("a LIKE '%' || b || '%'")).toHaveLength(1)
    expect(likePatternViolations('a LIKE b.col')).toHaveLength(1)
    expect(likePatternViolations('a GLOB ${pat}')).toHaveLength(1)
    expect(likePatternViolations("a LIKE '${P}%'")).toHaveLength(1)
    expect(likePatternViolations(`a LIKE '${'x'.repeat(51)}'`)).toHaveLength(1)
    expect(likePatternViolations("(LOWER(a) LIKE LOWER(?))")).toHaveLength(1)
  })

  it('the scan passes a short literal and an allowlisted interpolation', () => {
    expect(likePatternViolations("a LIKE 'Bulk sync%' AND b NOT LIKE '[%'")).toEqual([])
    expect(likePatternViolations(`a LIKE '${'x'.repeat(50)}'`)).toEqual([])
    expect(likePatternViolations("a LIKE '${P}%'", { "'${P}%'": 'bounded' })).toEqual([])
  })

  it('no non-test source under api/ builds, binds or lengthens a LIKE pattern', () => {
    const files = (readdirSync('api', { recursive: true }) as string[])
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.startsWith('test-support/'))
    const hits: string[] = []
    const used = new Set<string>()
    for (const f of files) {
      const allowed = ALLOWED_INTERPOLATED[f] ?? {}
      const src = stripComments(readFileSync(join('api', f), 'utf8'))
      for (const v of likePatternViolations(src, allowed)) hits.push(`${f}: ${v.token} (${v.why})`)
      for (const token of Object.keys(allowed)) if (src.includes(token)) used.add(`${f} ${token}`)
    }
    expect(hits).toEqual([])
    // an allowlist entry whose code is gone is stale
    const wanted = Object.entries(ALLOWED_INTERPOLATED).flatMap(([f, t]) => Object.keys(t).map((k) => `${f} ${k}`))
    expect([...used].sort()).toEqual(wanted.sort())
    for (const reasons of Object.values(ALLOWED_INTERPOLATED)) {
      for (const reason of Object.values(reasons)) expect(reason.length).toBeGreaterThan(20)
    }
  })
})

describe('the local D1 adapter enforces the 50-byte cap', () => {
  const db = prodSchemaDb()
  const long = 'cqode-backbone-umn-clif-federated-meta-analysis-of-the-sites'
  insertRow(db, 'hub_decisions', { id: 'dec-a', title: 'T', project_slug: 'x', linked_projects: `["${long}"]` })
  const d1 = d1Adapter(db)

  it('refuses a bound LIKE pattern over 50 bytes, as D1 does', async () => {
    await expect(d1.prepare('SELECT id FROM hub_decisions WHERE linked_projects LIKE ?').bind(`%${long}%`).all())
      .rejects.toThrow(/LIKE or GLOB pattern too complex/)
  })

  it('refuses a literal LIKE pattern over 50 bytes', async () => {
    await expect(d1.prepare(`SELECT id FROM hub_decisions WHERE title LIKE '${'x'.repeat(51)}'`).all())
      .rejects.toThrow(/LIKE or GLOB pattern too complex/)
  })

  it('counts the bound slot past an earlier ? and past a quoted ?', async () => {
    await expect(d1.prepare("SELECT id FROM hub_decisions WHERE title != '?' AND id = ? AND title LIKE ?").bind('a', 'x'.repeat(60)).all())
      .rejects.toThrow(/too complex/)
    const ok = await d1.prepare("SELECT id FROM hub_decisions WHERE title != '?' AND id = ? AND title LIKE ?").bind('a', 'T%').all()
    expect(ok.results).toEqual([])
  })

  it('instr() finds the same row with no length limit and ignores ASCII case', async () => {
    const hit = await d1.prepare(`SELECT id FROM hub_decisions WHERE ${contains('linked_projects')}`).bind(long.toUpperCase()).all()
    expect((hit.results as { id: string }[]).map((r) => r.id)).toEqual(['dec-a'])
  })

  it('instr() treats % and _ as plain characters', async () => {
    const hit = await d1.prepare(`SELECT id FROM hub_decisions WHERE ${contains('linked_projects')}`).bind('%').all()
    expect(hit.results).toEqual([])
  })
})
