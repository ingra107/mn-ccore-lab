// scripts/check-raw-fetch-writes.mjs -- no raw fetch for a write (fable-audit-2
// G15). Every write shape must count, a read must not, and the baseline may only
// shrink. Lives under api/ so the api vitest suite runs it, like the page-rail
// gate test beside it.

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
// @ts-expect-error -- plain .mjs, no type declarations; tests are not typechecked
import { findRawWrites, compare, scan, BASELINE_PATH } from '../scripts/check-raw-fetch-writes.mjs'

const count = (file: string, text: string): number => findRawWrites(file, text).length

describe('a raw write counts', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('fetch with method %s', (m) => {
    expect(count('src/X.tsx', `await fetch('/api/x', { method: '${m}', body: '{}' })`)).toBe(1)
  })

  it('across lines, through a template url and window.fetch', () => {
    expect(count('src/X.tsx', "const r = await fetch(`/api/tasks/${id}/comments`, {\n  headers: {},\n  method: 'POST',\n})")).toBe(1)
    expect(count('src/X.tsx', "window.fetch('/api/x', { method: 'POST' })")).toBe(1)
  })

  it('a method it cannot read as GET', () => {
    expect(count('src/X.tsx', "fetch('/api/x', { method: verb })")).toBe(1)
    expect(count('src/X.tsx', "fetch('/api/x', { method })")).toBe(1)
  })

  it('reports the line it found', () => {
    expect(findRawWrites('src/X.tsx', "\n\nfetch('/a', { method: 'POST' })")[0].line).toBe(3)
  })
})

describe('these do not count', () => {
  it('a read, with or without a method', () => {
    expect(count('src/X.tsx', "fetch('/api/x')")).toBe(0)
    expect(count('src/X.tsx', "fetch('/api/x', { method: 'GET' })")).toBe(0)
    expect(count('src/X.tsx', "fetch('/api/x', { credentials: 'include' })")).toBe(0)
  })

  it('fetchApi, a comment, and a method on a neighbouring call', () => {
    expect(count('src/X.tsx', "fetchApi('/api/x', { method: 'POST' })")).toBe(0)
    expect(count('src/X.tsx', "// fetch('/api/x', { method: 'POST' })")).toBe(0)
    expect(count('src/X.tsx', "await fetch('/a'); other({ method: 'POST' })")).toBe(0)
  })

  it('the two places writes belong', () => {
    const write = "fetch('/a', { method: 'POST' })"
    expect(count('src/lib/api.ts', write)).toBe(0)
    expect(count('src/hooks/mutations/useThing.ts', write)).toBe(0)
  })

  it('a marked site, on its line or the line above', () => {
    expect(count('src/X.tsx', "// raw-write-ok: a presigned upload\nfetch('/a', { method: 'PUT' })")).toBe(0)
    expect(count('src/X.tsx', "fetch('/a', { method: 'PUT' }) // raw-write-ok: a presigned upload")).toBe(0)
  })
})

describe('the ratchet', () => {
  const hit = { line: 1, src: '' }
  it('a rise fails, a fall passes, a new file fails', () => {
    const found = { 'src/a.tsx': [hit, hit] }
    expect(compare(found, { 'src/a.tsx': 1 }).rises).toHaveLength(1)
    expect(compare(found, { 'src/a.tsx': 2 }).rises).toHaveLength(0)
    expect(compare(found, { 'src/a.tsx': 3 }).falls).toHaveLength(1)
    expect(compare(found, {}).rises).toHaveLength(1)
    expect(compare({}, { 'src/a.tsx': 1 }).falls).toHaveLength(1)
  })

  it('the files this batch fixed stay at their fixed count', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    expect(baseline['src/components/tasks/TaskGridView.tsx']).toBeUndefined()
    expect(baseline['src/components/tasks/TaskDetailPanel.tsx'] ?? 0).toBeLessThanOrEqual(1)
    expect(baseline['src/pages/ProjectDetail.tsx'] ?? 0).toBeLessThanOrEqual(2)
  })

  it('the repo sits at or under its baseline, and the CLI agrees', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    expect(compare(scan(), baseline).rises).toEqual([])
    const r = spawnSync(process.execPath, ['scripts/check-raw-fetch-writes.mjs'], { encoding: 'utf8' })
    expect(r.status).toBe(0)
  }, 30_000) // scans src/ and spawns the CLI; the 5 s default fails under load
})
