// search.action-items-retirement.test.ts — backlog #552
//
// The `action_items` table stopped taking writes ~2026-03-30 (T19/#547);
// every other reader converted to the tasks model, but search.ts:201 kept
// querying the raw table directly (issue: only pre-2026-03-30 rows, and
// duplicate results against the unconditional `tasks` leg for anything
// backfilled since). Fixed 2026-07-16 by dropping the leg — schema-v96
// backfilled every action_items row into `tasks` under the SAME id, so the
// `tasks` leg (no meeting_id filter) already covers this content losslessly
// (verified live: 0 action_items rows without a matching non-deleted tasks
// row). This locks two properties: (1) handleGetSearch never issues SQL
// against action_items again, (2) a meeting-linked task surfaces exactly
// once (as type='task'), never duplicated as type='action_item'.

import { describe, it, expect } from 'vitest'
import { handleGetSearch } from './search'
import type { Env } from '../helpers'

// Simulates the schema-v96 backfill invariant: an action_items row and its
// backfilled tasks row share the SAME id + same text ("Follow up with
// reviewer"). If search.ts ever re-adds the action_items leg, this stub
// would make it emit a SECOND result for the same underlying id under
// type='action_item' — exactly the duplicate this row's fix avoids.
function makeEnv(preparedSql: string[]): Env {
  return {
    DB: {
      prepare: (sql: string) => {
        preparedSql.push(sql)
        return {
          bind: (..._args: unknown[]) => ({
            all: async () => {
              if (/FROM tasks\b/i.test(sql)) {
                return {
                  results: [{
                    id: 'task-mtg-1',
                    title: 'Follow up with reviewer',
                    description: 'Follow up with reviewer',
                    assignee: 'nick-ingraham',
                    status: 'todo',
                    priority: 'medium',
                    due_date: null,
                    project_id: null,
                    created_at: '2026-07-01',
                  }],
                }
              }
              if (/FROM action_items\b/i.test(sql)) {
                return {
                  results: [{
                    id: 'task-mtg-1',
                    description: 'Follow up with reviewer',
                    assignee: 'nick-ingraham',
                    completed: 0,
                    due_date: null,
                    meeting_id: 'mtg-1',
                    created_at: '2026-07-01',
                    meeting_title: 'Lab meeting',
                  }],
                }
              }
              return { results: [] }
            },
          }),
        }
      },
    },
  } as unknown as Env
}

describe('#552 handleGetSearch — action_items leg retired', () => {
  it('never issues a query against the action_items table', async () => {
    const preparedSql: string[] = []
    const url = new URL('https://x/api/search?q=follow')
    await handleGetSearch(url, makeEnv(preparedSql), true)
    const hitsActionItems = preparedSql.some((sql) => /\baction_items\b/i.test(sql))
    expect(hitsActionItems).toBe(false)
  })

  it('a meeting-linked task surfaces exactly once, never duplicated as type="action_item"', async () => {
    const preparedSql: string[] = []
    const url = new URL('https://x/api/search?q=follow')
    const res = await handleGetSearch(url, makeEnv(preparedSql), true)
    const body = await res.json() as { data: { type: string; id: string }[] }
    const hits = body.data.filter((r) => r.id === 'task-mtg-1')
    expect(hits).toHaveLength(1)
    expect(hits[0].type).toBe('task')
    expect(body.data.some((r) => r.type === 'action_item')).toBe(false)
  })
})
