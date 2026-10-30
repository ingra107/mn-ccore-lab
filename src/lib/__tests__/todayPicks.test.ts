// The rules behind the 2026-10-30 Today picks (lib/todayPicks.ts). The one
// rule they all share: no invented number. A task with no size never "fits",
// a deadline with no size gets no latest start, a series with no pace is not
// judged against one.

import { describe, it, expect } from 'vitest'
import {
  buildGapStack, buildShadow, dayLoad, firstLine, nextTimedEvent, nextWeekdays, previousInSeries,
  quietSeries, quietWaits, shadowCandidates, taskSize,
} from '../todayPicks'
import type { TaskRow } from '../api'

const task = (over: Partial<TaskRow>): TaskRow => ({
  id: 't', title: 'T', short_title: null, description: null, assignee: 'nick-ingraham', due_date: null,
  completed: 0, status: 'todo', kind: 'task', created_at: '2026-10-01 00:00:00', ...over,
} as unknown as TaskRow)

describe('nextTimedEvent', () => {
  it('skips started, all-day, untimed and dismissed rows', () => {
    const ev = [
      { id: 'a', title: 'past', startMin: 500 },
      { id: 'b', title: 'all day', startMin: 0, isAllDay: true },
      { id: 'c', title: 'untimed' },
      { id: 'd', title: 'dismissed', startMin: 700 },
      { id: 'e', title: 'next', startMin: 720 },
    ]
    expect(nextTimedEvent(ev, 600, { d: true })).toEqual({ event: ev[4], minutesUntil: 120 })
  })
})

describe('Gap Stack', () => {
  it('reads size from estimated_minutes, else the quick tag, else none', () => {
    expect(taskSize(task({ estimated_minutes: 12 }))).toEqual({ kind: 'minutes', minutes: 12 })
    expect(taskSize(task({ effort: 'quick' }))).toEqual({ kind: 'quick' })
    expect(taskSize(task({ effort: 'deep' }))).toEqual({ kind: 'none' })
  })

  it('puts tasks that fit first and never marks an unsized task as fitting', () => {
    const today = '2026-10-30'
    const s = buildGapStack([
      task({ id: 'long', estimated_minutes: 45, due_date: today }),
      task({ id: 'nosize', due_date: '2026-10-28' }),
      task({ id: 'fits', estimated_minutes: 5, due_date: '2026-11-03' }),
      task({ id: 'undated' }),
    ], 14, today, () => false)
    expect(s.rows.map((r) => r.task.id)).toEqual(['fits', 'nosize', 'long'])
    expect(s.rows.map((r) => r.fits)).toEqual([true, false, false])
    expect(s.fitCount).toBe(1)
    expect(s.moreCount).toBe(0) // the undated one is not "due"
  })
})

describe('Silence Map', () => {
  const m = (date: string, title = 'Weekly Meeting with Daniel/Nick') => ({ id: date, date, title })

  it('flags a regular series well past its pace with nothing booked', () => {
    const q = quietSeries([m('2026-09-01'), m('2026-09-08'), m('2026-09-15'), m('2026-09-22')], '2026-10-30')
    expect(q).toHaveLength(1)
    expect(q[0].usualGapDays).toBe(7)
    expect(q[0].daysSince).toBe(38)
  })

  it('leaves a series alone when one is booked, it has too few meetings, or it is on pace', () => {
    expect(quietSeries([m('2026-09-01'), m('2026-09-08'), m('2026-09-15'), m('2026-11-02')], '2026-10-30')).toEqual([])
    expect(quietSeries([m('2026-09-01'), m('2026-09-08')], '2026-10-30')).toEqual([])
    expect(quietSeries([m('2026-10-09'), m('2026-10-16'), m('2026-10-23')], '2026-10-30')).toEqual([])
  })

  it('counts a waiting task from waiting_since, else its last update', () => {
    const now = new Date('2026-10-30T12:00:00Z')
    const w = quietWaits([
      task({ id: 'a', waiting_on: 'Grandon', waiting_since: '2026-10-10 12:00:00' }),
      task({ id: 'b', waiting_on: 'Casey', updated_at: '2026-10-28 12:00:00' }),
      task({ id: 'c', waiting_on: null }),
    ], now)
    expect(w.map((x) => [x.task.id, x.days])).toEqual([['a', 20]])
  })
})

describe('Backward Shadows', () => {
  it('counts free working minutes, merging overlaps and ignoring all-day rows', () => {
    // Local times: a Thursday.
    const d = '2026-10-29'
    const at = (h: number, mi = 0) => new Date(2026, 9, 29, h, mi).toISOString()
    const load = dayLoad(d, [
      { startAt: at(9), endAt: at(10), isAllDay: false },
      { startAt: at(9, 30), endAt: at(11), isAllDay: false },
      { startAt: at(7), endAt: at(8, 30), isAllDay: false },
      { startAt: at(0), endAt: at(23, 59), isAllDay: true },
    ])
    expect(load.bookedMin).toBe(150)
    expect(load.freeMin).toBe(540 - 150)
    expect(dayLoad('2026-10-31', []).freeMin).toBe(0) // Saturday
  })

  it('casts shadows only for milestones, hard deadlines and deep work, soonest first', () => {
    const today = '2026-10-30'
    const c = shadowCandidates([
      task({ id: 'plain', due_date: '2026-11-02' }),
      task({ id: 'ms', kind: 'milestone', due_date: '2026-11-10' }),
      task({ id: 'hard', deadline: '2026-11-05', due_date: '2026-11-01' }),
      task({ id: 'deep', effort: 'deep', due_date: '2026-11-03' }),
      task({ id: 'far', kind: 'milestone', due_date: '2026-12-20' }),
    ], today)
    expect(c.map((x) => [x.task.id, x.due, x.hard])).toEqual([
      ['deep', '2026-11-03', false], ['hard', '2026-11-05', true], ['ms', '2026-11-10', false],
    ])
  })

  it('gives a latest start only to a sized task, red when the free time cannot hold it', () => {
    const today = '2026-10-30'
    const free = new Map([['2026-10-30', 120], ['2026-11-02', 120], ['2026-11-03', 60]])
    const due = '2026-11-04'
    const unsized = buildShadow({ task: task({}), due, hard: false, hardDate: null }, today, free)
    expect(unsized).toMatchObject({ tone: 'unsized', latestStart: null, freeBeforeMin: 300 })
    const fits = buildShadow({ task: task({ estimated_minutes: 150 }), due, hard: false, hardDate: null }, today, free)
    expect(fits).toMatchObject({ latestStart: '2026-11-02', tone: 'risk' })
    const late = buildShadow({ task: task({ estimated_minutes: 600 }), due, hard: false, hardDate: null }, today, free)
    expect(late).toMatchObject({ latestStart: null, tone: 'late' })
  })

  it('lists weekdays only', () => {
    expect(nextWeekdays('2026-10-30', 3)).toEqual(['2026-10-30', '2026-11-02', '2026-11-03'])
  })
})

describe('Walk-in card', () => {
  it('takes the first real line of decisions, then notes, without markdown', () => {
    expect(firstLine('## Decisions\n- **Rerun** the model without transfers', null)).toBe('Rerun the model without transfers')
    expect(firstLine(null, 'Summary:\nShe uploaded outline v4.')).toBe('She uploaded outline v4.')
    expect(firstLine('', '  ')).toBeNull()
  })

  it('finds the previous meeting of the same series, never a neighbour', () => {
    const ms = [
      { id: '1', date: '2026-10-16', title: 'Weekly Meeting with Daniel/Nick' },
      { id: '2', date: '2026-10-28', title: 'CLIF call' },
      { id: '3', date: '2026-10-02', title: 'Weekly Meeting with Daniel/Nick' },
    ]
    expect(previousInSeries(ms, 'Weekly Meeting with Daniel/Nick', '2026-10-30')?.id).toBe('1')
    expect(previousInSeries(ms, 'Board retreat', '2026-10-30')).toBeNull()
  })
})

// ── Cold-review fixes, 2026-10-30 ───────────────────────────────────────────

describe('milestone shadows use the internal date (task-management.md, two dates)', () => {
  const today = '2026-10-30'
  it('keeps a milestone due internally in 5 days with a hard date in 20', () => {
    const c = shadowCandidates([task({ id: 'ms', kind: 'milestone', due_date: '2026-11-04', deadline: '2026-11-19' })], today)
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ due: '2026-11-04', hard: false, hardDate: '2026-11-19' })
  })

  it('shadows to the internal date, not the hard one', () => {
    const c = shadowCandidates([task({ id: 'ms', kind: 'milestone', due_date: '2026-11-02', deadline: '2026-11-09' })], today)
    expect(c[0]).toMatchObject({ due: '2026-11-02', hardDate: '2026-11-09' })
  })

  it('moves to the hard date once the internal one has slipped', () => {
    const c = shadowCandidates([task({ id: 'ms', kind: 'milestone', due_date: '2026-10-27', deadline: '2026-11-09' })], today)
    expect(c[0]).toMatchObject({ due: '2026-11-09', hard: true, hardDate: null })
  })
})

describe('today counts only the working time left', () => {
  it('holds 30 free minutes at 4:30 pm on a weekday', () => {
    expect(dayLoad('2026-10-29', [], 16 * 60 + 30).freeMin).toBe(30)
    expect(dayLoad('2026-10-29', [], 18 * 60).freeMin).toBe(0)
    expect(dayLoad('2026-10-29', [], 6 * 60).freeMin).toBe(540)
  })

  it('reads an 8-hour task due tomorrow as a late start at 4:30 pm', () => {
    const today = '2026-10-29' // Thursday
    const free = new Map([[today, dayLoad(today, [], 16 * 60 + 30).freeMin]])
    const s = buildShadow({ task: task({ estimated_minutes: 480 }), due: '2026-10-30', hard: false, hardDate: null }, today, free)
    expect(s.tone).toBe('late')
  })
})

describe('Gap Stack "N more due" means today', () => {
  it('counts only unshown tasks due today or overdue', () => {
    const today = '2026-10-30'
    const s = buildGapStack([
      task({ id: 'a', due_date: '2026-10-28' }),
      task({ id: 'b', due_date: today }),
      task({ id: 'c', due_date: today }),
      task({ id: 'd', due_date: '2026-10-29' }),
      task({ id: 'later', due_date: '2026-11-05' }),
      task({ id: 'later2', due_date: '2026-11-06' }),
    ], 14, today, () => false)
    expect(s.rows.map((r) => r.task.id)).toEqual(['a', 'd', 'b'])
    expect(s.moreCount).toBe(1) // 'c' only; next week's two are not "due"
  })
})
