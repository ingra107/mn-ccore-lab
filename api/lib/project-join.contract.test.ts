// project-join.contract.test.ts -- the schema-v139 contracts that live in two
// places, checked against each other.
//
//   1. The approvers: JOIN_APPROVER_SLUGS (TS) and the CHECK on
//      project_join_requests.decided_by (the migration) name the same two people.
//   2. The directory view is named only by the module that reads it (and the
//      scope classification), so no other route can read past the viewer's
//      filtered tables through it.
//   3. Nick's Telegram question is a spec PB's Ask parser accepts
//      (scripts/questions/spec.py): keys 1..8 ascii chars, rec names an
//      authored choice, the free-text `other` last.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { JOIN_APPROVER_SLUGS } from '../../shared/joinApprovers'
import { joinQuestionSpec } from './project-join'

const API = join(__dirname, '..')
const MIGRATION = readFileSync(join(API, 'schema-v139-project-join-requests.sql'), 'utf8')

describe('the approvers are one list, in TS and in the database', () => {
  it('the decided_by CHECK names exactly JOIN_APPROVER_SLUGS', () => {
    const m = MIGRATION.match(/CHECK \(decided_by IS NULL OR decided_by IN \(([^)]*)\)\)/)
    expect(m, 'the decided_by approver CHECK must exist').not.toBeNull()
    const inSql = m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).sort()
    expect(inSql).toEqual([...JOIN_APPROVER_SLUGS].sort())
  })
})

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...tsFiles(p))
    else if (p.endsWith('.ts') && !p.includes('.test.')) out.push(p)
  }
  return out
}

describe('only the directory module reads the directory view', () => {
  it('no other API source names project_directory', () => {
    const allowed = new Set([join(API, 'lib', 'project-join.ts'), join(API, 'lib', 'table-scope.ts')])
    const offenders = tsFiles(API)
      .filter((f) => !allowed.has(f))
      // Code only: a comment that names the view (viewer-db.ts explains it) reads nothing.
      .filter((f) => readFileSync(f, 'utf8').split('\n')
        .map((l) => l.replace(/\/\/.*$/, ''))
        .filter((l) => !/^\s*\*/.test(l))
        .some((l) => /\bproject_directory\b/.test(l)))
      .map((f) => f.slice(API.length + 1))
    expect(offenders).toEqual([])
  })
})

describe("Nick's Telegram question is a spec PB can parse", () => {
  const spec = joinQuestionSpec({ requestId: 'r1', requesterName: 'Casey', projectName: 'Open', note: 'hi' })
  it('keys fit Telegram callback data and PB\'s key rule; rec is authored; other is last', () => {
    const keys = spec.choices.map((c) => c.key)
    for (const k of keys) expect(k).toMatch(/^[A-Za-z0-9_-]{1,8}$/)
    expect(keys[keys.length - 1]).toBe('other')
    expect(keys.slice(0, -1)).toContain(spec.rec)
    expect(new Set(keys).size).toBe(keys.length)
    expect(spec.kind).toMatch(/^[a-z][a-z0-9_]{0,63}$/)
    expect(spec.prompt).toBe('Casey asks to join Open: "hi"')
  })
  it('the choices the database maps: approve approves; decline and other decline', () => {
    expect(MIGRATION).toContain("CASE json_extract(NEW.question_answer_json, '$.choice') WHEN 'approve' THEN 'approved' ELSE 'declined' END")
    expect(spec.choices.map((c) => c.key)).toEqual(['approve', 'decline', 'other'])
  })
})
