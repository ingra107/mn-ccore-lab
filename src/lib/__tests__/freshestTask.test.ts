// S05: the drawer reads a task out of many cached lists. It must take the newest
// copy, not the first list that happens to hold one.
import { describe, it, expect } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { freshestCachedTask } from '../freshestTask'
import type { TaskRow } from '../api'

const row = (id: string, updated_at: string | undefined, title: string) => ({ id, updated_at, title }) as unknown as TaskRow

describe('freshestCachedTask', () => {
  it('takes the newest copy whichever query was created first', () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', { assignee: 'a' }], [row('t', '2026-11-01 08:00:00', 'old title')])
    qc.setQueryData(['tasks', { assignee: 'b' }], [row('t', '2026-11-02 08:00:00', 'new title')])
    expect(freshestCachedTask(qc, 't')?.title).toBe('new title')

    const other = new QueryClient()
    other.setQueryData(['tasks', { assignee: 'b' }], [row('t', '2026-11-02 08:00:00', 'new title')])
    other.setQueryData(['tasks', { assignee: 'a' }], [row('t', '2026-11-01 08:00:00', 'old title')])
    expect(freshestCachedTask(other, 't')?.title).toBe('new title')
  })

  it('compares instants, not spellings: the database format against an ISO stamp', () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', 1], [row('t', '2026-11-02T09:00:00.000Z', 'later')])
    qc.setQueryData(['tasks', 2], [row('t', '2026-11-02 08:00:00', 'earlier')])
    expect(freshestCachedTask(qc, 't')?.title).toBe('later')
  })

  it('a copy with no stamp loses to one with a stamp', () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', 1], [row('t', undefined, 'no stamp')])
    qc.setQueryData(['tasks', 2], [row('t', '2026-11-02 08:00:00', 'stamped')])
    expect(freshestCachedTask(qc, 't')?.title).toBe('stamped')
  })

  it('a tie keeps the first copy, so a re-read does not flicker between equals', () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', 1], [row('t', '2026-11-02 08:00:00', 'first')])
    qc.setQueryData(['tasks', 2], [row('t', '2026-11-02 08:00:00', 'second')])
    expect(freshestCachedTask(qc, 't')?.title).toBe('first')
  })

  it('no copy is null, and a non-list entry under the key is skipped', () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', 'summary'], { count: 3 })
    qc.setQueryData(['tasks', 1], [row('other', '2026-11-02 08:00:00', 'x')])
    expect(freshestCachedTask(qc, 't')).toBeNull()
  })
})
