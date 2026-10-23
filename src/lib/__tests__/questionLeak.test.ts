// A kind='question' row is waiting on Nick, not on work. It belongs on the Today
// "Needs you" card only; its due_date is the snooze date (defaults to its mint
// day), so any task list, count or overdue view that received one would read it
// as overdue from day two. The chokepoint is fetchTasks (src/lib/api.ts): it
// drops questions unless the caller opts in with includeQuestions. This pins
// the chokepoint and the allowlist of opt-in callers.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fetchTasks } from '../api'

const rows = [
  { id: 'q', kind: 'question', due_date: '2020-01-01', completed: 0 },
  { id: 't', kind: 'task', due_date: '2020-01-01', completed: 0 },
  { id: 'm', kind: 'milestone', due_date: '2020-01-01', completed: 0 },
]

afterEach(() => vi.unstubAllGlobals())

function stubFetch() {
  const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: rows }) }))
  vi.stubGlobal('fetch', f)
  return f
}

describe('fetchTasks drops questions by default', () => {
  it('no option: question gone, task and milestone kept', async () => {
    stubFetch()
    const res = await fetchTasks({ assignee: 'nick-ingraham' })
    expect(res.data.map((t) => t.id)).toEqual(['t', 'm'])
  })

  it('includeQuestions: keeps the question and tells the server', async () => {
    const f = stubFetch()
    const res = await fetchTasks({ includeQuestions: true })
    expect(res.data.map((t) => t.id)).toEqual(['q', 't', 'm'])
    expect(String((f.mock.calls as unknown as unknown[][])[0][0])).toContain('include_questions=1')
  })

  it('the default request does not ask for questions', async () => {
    const f = stubFetch()
    await fetchTasks()
    expect(String((f.mock.calls as unknown as unknown[][])[0][0])).not.toContain('include_questions')
  })
})

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p)
  }
  return out
}

describe('the opt-in is rare and the list fetch is not bypassed', () => {
  const root = join(__dirname, '..', '..')
  const files = walk(root).map((f) => ({ rel: relative(root, f).split(sep).join('/'), src: readFileSync(f, 'utf8') }))

  it('only Today and My Tasks pass includeQuestions', () => {
    const users = files.filter((f) => f.src.includes('includeQuestions: true')).map((f) => f.rel).sort()
    expect(users).toEqual(['pages/MyTasks/index.tsx', 'pages/portal/TodayPage.tsx'])
  })

  it('no file reads the /api/tasks list around fetchTasks', () => {
    const bypass = files
      .filter((f) => f.rel !== 'lib/api.ts' && /fetch(Api)?\(\s*[`'"]\/api\/tasks[`'"?]/.test(f.src) && !/method:\s*'POST'/.test(f.src))
      .map((f) => f.rel)
    expect(bypass).toEqual([])
  })
})
