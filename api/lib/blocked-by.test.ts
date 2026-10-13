// shared/blockedBy.ts -- the one reader of tasks.blocked_by (comma list or JSON array).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseBlockedBy, serializeBlockedBy, hasBlockers, blockedByContainsSql } from '../../shared/blockedBy'
import { prodSchemaDb, insertRow } from '../test-support/prod-schema-db'

describe('parseBlockedBy', () => {
  it('reads a comma list, trimming blanks and repeats', () => {
    expect(parseBlockedBy('a, b ,,a,c')).toEqual(['a', 'b', 'c'])
  })
  it('reads a JSON array', () => {
    expect(parseBlockedBy('["task_01KP9FM3078ZK4X36FQ314A3TX"]')).toEqual(['task_01KP9FM3078ZK4X36FQ314A3TX'])
    expect(parseBlockedBy(' ["a", "b"] ')).toEqual(['a', 'b'])
  })
  it('reads a single id and treats empty or bad input as no blockers', () => {
    expect(parseBlockedBy('only')).toEqual(['only'])
    expect(parseBlockedBy(null)).toEqual([])
    expect(parseBlockedBy('')).toEqual([])
    expect(parseBlockedBy('[]')).toEqual([])
    expect(parseBlockedBy('["a",')).toEqual(['a'])
  })
  it('round-trips through serializeBlockedBy and hasBlockers', () => {
    expect(serializeBlockedBy([])).toBeNull()
    expect(serializeBlockedBy(['a', 'b'])).toBe('a,b')
    expect(hasBlockers('["a"]')).toBe(true)
    expect(hasBlockers('[]')).toBe(false)
  })
})

describe('blockedByContainsSql agrees with parseBlockedBy', () => {
  const stored = [
    'x_1', 'x_1, y', 'y ,x_1', '["x_1"]', '["y", "x_1"]', 'x_10', '["x_10"]', 'xA1', 'y', null, '', '[]',
  ]
  it('matches exactly the rows whose parsed list holds the id', () => {
    const db = prodSchemaDb()
    stored.forEach((v, i) => insertRow(db, 'tasks', { id: `row${i}`, title: `row${i}`, assignee: 'a', blocked_by: v }))
    for (const id of ['x_1', 'xA1', 'y']) {
      const sqlHits = (db.prepare(`SELECT id FROM tasks WHERE ${blockedByContainsSql('blocked_by')}`).all(id) as { id: string }[])
        .map((r) => r.id).sort()
      const jsHits = stored.flatMap((v, i) => (parseBlockedBy(v).includes(id) ? [`row${i}`] : [])).sort()
      expect(sqlHits).toEqual(jsHits)
    }
  })
})

describe('no second reader of blocked_by', () => {
  it('the Worker never matches blocked_by with LIKE', () => {
    const src = readFileSync('api/routes/tasks.ts', 'utf8')
    expect(src).not.toMatch(/blocked_by\s+LIKE/i)
  })
})
