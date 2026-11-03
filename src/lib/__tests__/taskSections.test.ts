// The ONE section resolver (lib/taskSections.ts), shared by Today and My Tasks:
// each rule, the order they run in, hand placement beating everything, the
// order inside a section, the fold rule, and the With others summary.
// Nick, 2026-11-03: "Hand placement beats everything (Recommended)".
//
// Run: npx vitest run --config vitest.config.lib.ts src/lib/__tests__/taskSections.test.ts
import { describe, it, expect } from 'vitest'
import {
  SECTION_ORDER, SECTION_LABEL, WORK_KINDS, bucketBySection, isAlwaysVisible, isHandSorted, isNewToViewer,
  isPbTask, isSectionKey, isWorkKind, orderSection, othersSummary, sectionForTask, sortTarget,
  type SectionCtx,
} from '../taskSections'
import type { TaskRow } from '../api'

const ME = 'nick-ingraham'
const ctx: SectionCtx = {
  viewerSlug: ME,
  projectsBySlug: new Map([
    ['cqode-backbone', { slug: 'cqode-backbone', category: 'clif' }],
    ['clif-quality', { slug: 'clif-quality', category: 'clif' }],
    ['peripheral-brain', { slug: 'peripheral-brain', category: 'pb' }],
    ['grant-x', { slug: 'grant-x', category: 'mnccore' }],
  ]),
}

const task = (extra: Record<string, unknown> = {}): TaskRow => ({
  id: 't', title: 'A task', kind: 'task', status: 'todo', priority: 'medium', assignee: ME,
  due_date: null, deadline: null, project_id: null, source: null,
  work_kind: null, work_kind_set: 'auto', acknowledged_at: '2026-01-01', ...extra,
}) as unknown as TaskRow

const sec = (extra: Record<string, unknown> = {}, c: SectionCtx = ctx) => sectionForTask(task(extra), c)

describe('section vocabulary', () => {
  it('lists the sections in Nick\'s order', () => {
    expect(SECTION_ORDER).toEqual(['sort', 'review', 'writing', 'analysis', 'admin', 'etl', 'others'])
    expect(SECTION_ORDER.map((k) => SECTION_LABEL[k])).toEqual([
      'Sort', 'Review', 'Writing', 'Analysis & Build', 'Replies & admin', 'CLIF ETL', 'With others',
    ])
  })
  it('mirrors the work_kinds table', () => {
    expect(WORK_KINDS.map((k) => [k.code, k.label])).toEqual([
      ['review', 'Review'], ['writing', 'Writing'], ['analysis', 'Analysis & Build'], ['admin', 'Replies & admin'],
    ])
    expect(isWorkKind('review')).toBe(true)
    expect(isWorkKind('deep')).toBe(false)
    expect(isWorkKind(null)).toBe(false)
  })
  it('a retired group is not a section (stale ?group= links)', () => {
    expect(isSectionKey('review')).toBe(true)
    expect(isSectionKey('deep')).toBe(false)
    expect(isSectionKey(null)).toBe(false)
  })
})

describe('sectionForTask: each rule', () => {
  it('work_kind places a task', () => {
    expect(sec({ work_kind: 'review' })).toBe('review')
    expect(sec({ work_kind: 'writing' })).toBe('writing')
    expect(sec({ work_kind: 'analysis' })).toBe('analysis')
    expect(sec({ work_kind: 'admin' })).toBe('admin')
  })
  it('no kind lands in Sort', () => {
    expect(sec({ work_kind: null })).toBe('sort')
  })
  it('an unknown kind code lands in Sort, never lost', () => {
    expect(sec({ work_kind: 'teaching' })).toBe('sort')
  })
  it('a check-in is Replies & admin, whatever its kind of work', () => {
    expect(sec({ kind: 'checkin' })).toBe('admin')
    expect(sec({ kind: 'checkin', work_kind: 'review' })).toBe('admin')
  })
  it('CLIF ETL by project slug, title, or clif project with an ETL title', () => {
    expect(sec({ project_id: 'cqode-backbone', work_kind: 'writing' })).toBe('etl')
    expect(sec({ title: 'Fix the CQODE load', work_kind: 'writing' })).toBe('etl')
    expect(sec({ title: 'Run ETL on site 3' })).toBe('etl')
    expect(sec({ project_id: 'clif-quality', title: 'Ingest the new tables', work_kind: 'analysis' })).toBe('etl')
    expect(sec({ project_id: 'clif-quality', title: 'Draft the abstract', work_kind: 'writing' })).toBe('writing')
  })
  it('With others: another assignee, or waiting_external', () => {
    expect(sec({ assignee: 'casey-eddington', work_kind: 'review' })).toBe('others')
    expect(sec({ status: 'waiting_external', work_kind: 'review' })).toBe('others')
  })
  it('an unassigned task is not With others', () => {
    expect(sec({ assignee: null, work_kind: 'review' })).toBe('review')
  })
  it('With others waits for the viewer slug', () => {
    expect(sec({ assignee: 'casey-eddington', work_kind: 'review' }, { ...ctx, viewerSlug: '' })).toBe('review')
  })
  it('a milestone follows its kind like any task', () => {
    expect(sec({ kind: 'milestone', work_kind: 'writing' })).toBe('writing')
    expect(sec({ kind: 'milestone' })).toBe('sort')
  })
  it('the old group_override no longer places anything', () => {
    expect(sec({ group_override: 'etl', work_kind: 'review' })).toBe('review')
    expect(sec({ group_override: 'pb', priority: 'urgent' })).toBe('sort')
  })
  it('priority no longer picks the section', () => {
    expect(sec({ priority: 'urgent', work_kind: 'writing' })).toBe('writing')
    expect(sec({ priority: 'low', work_kind: 'writing' })).toBe('writing')
  })
})

describe('sectionForTask: the order, first match wins', () => {
  it('With others beats CLIF ETL', () => {
    expect(sec({ assignee: 'casey-eddington', project_id: 'cqode-backbone' })).toBe('others')
  })
  it('CLIF ETL beats check-in ("CLIF ETL wins")', () => {
    expect(sec({ kind: 'checkin', project_id: 'cqode-backbone' })).toBe('etl')
  })
  it('check-in beats work_kind', () => {
    expect(sec({ kind: 'checkin', work_kind: 'writing' })).toBe('admin')
  })
  it('waiting_external beats ETL', () => {
    expect(sec({ status: 'waiting_external', title: 'ETL run' })).toBe('others')
  })
})

describe('sectionForTask: hand placement beats everything', () => {
  const hand = (extra: Record<string, unknown>) => sec({ work_kind_set: 'hand', ...extra })
  it('its kind', () => {
    expect(hand({ work_kind: 'writing' })).toBe('writing')
  })
  it('NULL kind by hand is Sort (Leave unsorted)', () => {
    expect(hand({ work_kind: null })).toBe('sort')
    expect(hand({ work_kind: null, kind: 'checkin' })).toBe('sort')
  })
  it('beats CLIF ETL', () => {
    expect(hand({ work_kind: 'review', project_id: 'cqode-backbone', title: 'ETL review' })).toBe('review')
    expect(hand({ work_kind: null, project_id: 'cqode-backbone' })).toBe('sort')
  })
  it('beats With others (another assignee and waiting_external)', () => {
    expect(hand({ work_kind: 'admin', assignee: 'casey-eddington' })).toBe('admin')
    expect(hand({ work_kind: 'admin', status: 'waiting_external' })).toBe('admin')
  })
  it('beats the check-in rule', () => {
    expect(hand({ work_kind: 'writing', kind: 'checkin' })).toBe('writing')
  })
  it('a hand kind that is not a section falls to Sort', () => {
    expect(hand({ work_kind: 'teaching' })).toBe('sort')
  })
  it('auto does not pin', () => {
    expect(sec({ work_kind_set: 'auto', work_kind: 'review', project_id: 'cqode-backbone' })).toBe('etl')
    expect(isHandSorted(task({ work_kind_set: 'hand' }))).toBe(true)
    expect(isHandSorted(task({ work_kind_set: 'auto' }))).toBe(false)
  })
})

describe('bucketBySection', () => {
  it('puts every task in exactly one bucket', () => {
    const rows = [
      task({ id: 'a', work_kind: 'review' }), task({ id: 'b' }), task({ id: 'c', assignee: 'casey-eddington' }),
      task({ id: 'd', work_kind: 'admin', work_kind_set: 'hand', status: 'waiting_external' }),
    ]
    const b = bucketBySection(rows, ctx)
    expect(Object.fromEntries(SECTION_ORDER.map((k) => [k, b[k].map((t) => t.id)]))).toEqual({
      sort: ['b'], review: ['a'], writing: [], analysis: [], admin: ['d'], etl: [], others: ['c'],
    })
  })
})

describe('Peripheral Brain is a badge, not a section', () => {
  it('detects by source, title prefix, project category and slug', () => {
    expect(isPbTask({ source: 'pb', title: 'x', project_id: null }, ctx.projectsBySlug)).toBe(true)
    expect(isPbTask({ source: null, title: 'PB: tidy', project_id: null }, ctx.projectsBySlug)).toBe(true)
    expect(isPbTask({ source: null, title: 'Peripheral Brain - tidy', project_id: null }, ctx.projectsBySlug)).toBe(true)
    expect(isPbTask({ source: null, title: 'x', project_id: 'peripheral-brain' }, ctx.projectsBySlug)).toBe(true)
    expect(isPbTask({ source: null, title: 'x', project_id: 'grant-x' }, ctx.projectsBySlug)).toBe(false)
  })
  it('does not move a task out of its kind section', () => {
    expect(sec({ source: 'pb', work_kind: 'analysis' })).toBe('analysis')
    expect(sec({ source: 'pb' })).toBe('sort')
  })
})

describe('orderSection: planned, urgent, high, due date, done last', () => {
  const o = (planned: string[] = [], done: string[] = [], milestoneRules?: boolean) =>
    ({ isPlanned: (t: TaskRow) => planned.includes(t.id), isDone: (t: TaskRow) => done.includes(t.id), milestoneRules })
  const ids = (rows: TaskRow[]) => rows.map((t) => t.id)

  it('puts planned first, then urgent, then high, then by due date, then done', () => {
    const rows = [
      task({ id: 'late', due_date: '2026-12-01' }),
      task({ id: 'soon', due_date: '2026-11-05' }),
      task({ id: 'none' }),
      task({ id: 'high', priority: 'high', due_date: '2026-12-30' }),
      task({ id: 'urgent', priority: 'urgent', due_date: '2026-12-31' }),
      task({ id: 'plan', due_date: '2027-01-01' }),
      task({ id: 'fin', due_date: '2026-01-01' }),
    ]
    expect(ids(orderSection(rows, o(['plan'], ['fin'])))).toEqual(['plan', 'urgent', 'high', 'soon', 'late', 'none', 'fin'])
  })
  it('an overdue row leads its date group', () => {
    const rows = [task({ id: 'b', due_date: '2026-11-04' }), task({ id: 'a', due_date: '2026-10-01' })]
    expect(ids(orderSection(rows, o()))).toEqual(['a', 'b'])
  })
  it('a milestone is a gold rule placed by its date among the unflagged rows, never planned', () => {
    const rows = [
      task({ id: 'u', priority: 'urgent', due_date: '2026-12-20' }),
      task({ id: 'a', due_date: '2026-11-10' }),
      task({ id: 'b', due_date: '2026-12-10' }),
      task({ id: 'm', kind: 'milestone', due_date: '2026-11-20' }),
    ]
    expect(ids(orderSection(rows, o(['m'])))).toEqual(['u', 'a', 'm', 'b'])
  })
  it('without milestone rules (My Tasks) a milestone is an ordinary row, listed once', () => {
    const rows = [
      task({ id: 'a', due_date: '2026-11-10' }),
      task({ id: 'm', kind: 'milestone', due_date: '2026-10-01', deadline: '2026-12-01' }),
    ]
    expect(ids(orderSection(rows, o([], [], false)))).toEqual(['m', 'a'])
  })
  it('keeps arrival order among equals', () => {
    const rows = [task({ id: 'x' }), task({ id: 'y' }), task({ id: 'z' })]
    expect(ids(orderSection(rows, o()))).toEqual(['x', 'y', 'z'])
  })
})

describe('isAlwaysVisible: the fold rule (today = 2026-11-03, window 7 days)', () => {
  const base = { viewerSlug: ME, isPlanned: () => false, today: '2026-11-03' }
  const vis = (extra: Record<string, unknown>, c: Partial<typeof base & { stepsOf: (t: TaskRow) => TaskRow[]; keepDone: boolean }> = {}) =>
    isAlwaysVisible(task(extra), { ...base, ...c })

  it('a plain row due later folds', () => {
    expect(vis({ due_date: '2026-12-25' })).toBe(false)
    expect(vis({})).toBe(false)
  })
  it('planned stays', () => {
    expect(vis({ due_date: '2026-12-25' }, { isPlanned: () => true })).toBe(true)
  })
  it('overdue stays', () => {
    expect(vis({ due_date: '2026-10-01' })).toBe(true)
  })
  it('due within 7 days stays, 8 days folds', () => {
    expect(vis({ due_date: '2026-11-03' })).toBe(true)
    expect(vis({ due_date: '2026-11-10' })).toBe(true)
    expect(vis({ due_date: '2026-11-11' })).toBe(false)
  })
  it('a hard deadline within 7 days stays, even with a far due date', () => {
    expect(vis({ due_date: '2026-12-25', deadline: '2026-11-08' })).toBe(true)
    expect(vis({ due_date: '2026-12-25', deadline: '2026-11-30' })).toBe(false)
  })
  it('urgent and high stay', () => {
    expect(vis({ priority: 'urgent' })).toBe(true)
    expect(vis({ priority: 'high' })).toBe(true)
    expect(vis({ priority: 'medium' })).toBe(false)
  })
  it('New (yours, never opened) stays; someone else\'s New does not', () => {
    expect(vis({ acknowledged_at: null })).toBe(true)
    expect(vis({ acknowledged_at: null, assignee: 'casey-eddington' })).toBe(false)
    expect(isNewToViewer(task({ acknowledged_at: null }), ME)).toBe(true)
    expect(isNewToViewer(task({ acknowledged_at: null }), '')).toBe(false)
  })
  it('a parent with a pressing step stays', () => {
    const step = task({ id: 's', due_date: '2026-11-04' })
    expect(vis({ id: 'p', due_date: '2026-12-25' }, { stepsOf: (t) => (t.id === 'p' ? [step] : []) })).toBe(true)
    const calm = task({ id: 's2', due_date: '2026-12-25' })
    expect(vis({ id: 'p', due_date: '2026-12-25' }, { stepsOf: () => [calm] })).toBe(false)
  })
  it('a milestone (the horizon) stays', () => {
    expect(vis({ kind: 'milestone', due_date: '2027-03-01' })).toBe(true)
  })
  it('a finished row folds like any other on Today, and stays in My Tasks lists (keepDone)', () => {
    expect(vis({ status: 'done', due_date: '2027-03-01' })).toBe(false)
    expect(vis({ status: 'done', due_date: '2027-03-01' }, { keepDone: true })).toBe(true)
  })
})

describe('othersSummary: "N · x urgent · y overdue"', () => {
  it('counts urgent and overdue open rows', () => {
    const rows = [
      task({ priority: 'urgent', due_date: '2026-11-10' }),
      task({ due_date: '2026-10-30' }),
      task({ priority: 'urgent', due_date: '2026-10-01' }),
      task({}),
      task({ status: 'done', priority: 'urgent', due_date: '2026-10-01' }),
    ]
    expect(othersSummary(rows, '2026-11-03')).toEqual({ total: 5, urgent: 2, overdue: 2 })
  })
})

describe('sortTarget mirrors the Worker', () => {
  it('sort / unsort / reset', () => {
    expect(sortTarget({ op: 'sort', work_kind: 'review' })).toEqual({ work_kind: 'review', work_kind_set: 'hand' })
    expect(sortTarget({ op: 'unsort' })).toEqual({ work_kind: null, work_kind_set: 'hand' })
    expect(sortTarget({ op: 'reset' })).toEqual({ work_kind: null, work_kind_set: 'auto' })
  })
})
