// question-leak.test.ts — a kind='question' row never reaches an ordinary task
// list, count or overdue view (2026-10-22). A question's due_date is its snooze
// date and defaults to its mint day, so a leaked one reads as "overdue" from
// day two. Real queries on the migration-chain database (prodSchemaDb), one
// overdue question and one overdue ordinary task in the same table.

import { describe, it, expect } from 'vitest'
import { handleGetTasks, handleOverdueCount } from './tasks'
import { NOT_QUESTION_SQL, NOT_QUESTION_SQL_T } from '../../shared/taskKinds'
import type { Env } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'

const SPEC = JSON.stringify({ v: 1, kind: 'meeting_match', prompt: 'Which meeting?', choices: [{ key: 'c1', label: 'A' }], allow_text: false, rec: 'c1' })

function seeded() {
  const db = prodSchemaDb()
  const base = { status: 'todo', priority: 'medium', assignee: 'nick-ingraham', deleted_at: null, project_id: null, completed: 0, completed_at: null, due_date: '2020-01-01' }
  insertRow(db, 'tasks', { ...base, id: 'task_01leak_question', title: 'Which meeting?', kind: 'question', source: 'meeting_match', question_spec_json: SPEC })
  insertRow(db, 'tasks', { ...base, id: 'task_01leak_ordinary', title: 'Write the aims', kind: 'task', source: 'manual' })
  return { db, env: { DB: d1Adapter(db) } as unknown as Env }
}

describe('a question never reaches an ordinary task read', () => {
  it('GET /api/tasks lists only the ordinary task; include_questions brings the question back', async () => {
    const { env } = seeded()
    const ids = async (qs: string) => ((await (await handleGetTasks(new URL(`https://x/api/tasks${qs}`), env, true)).json()) as { data: { id: string }[] }).data.map((t) => t.id).sort()
    expect(await ids('?completed_since=2019-01-01')).toEqual(['task_01leak_ordinary'])
    expect(await ids('?assignee=nick-ingraham&completed=false')).toEqual(['task_01leak_ordinary'])
    expect(await ids('?include_questions=1')).toEqual(['task_01leak_ordinary', 'task_01leak_question'])
  })

  it('the overdue badge counts the ordinary task only', async () => {
    const { env } = seeded()
    const res = await handleOverdueCount(new URL('https://x/api/tasks/overdue-count'), env)
    const body = await res.json() as { data: { count: number } }
    expect(body.data.count).toBe(1)
  })

  it('the shared fragment keeps a NULL kind as an ordinary task', () => {
    const { db } = seeded()
    const n = (frag: string) => (db.prepare(`SELECT COUNT(*) AS n FROM tasks t WHERE ${frag}`).get() as { n: number }).n
    expect(n(NOT_QUESTION_SQL_T)).toBe(1)
    expect(NOT_QUESTION_SQL).toBe("COALESCE(kind, 'task') <> 'question'")
  })
})
