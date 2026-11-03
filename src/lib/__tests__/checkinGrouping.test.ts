// Check-ins (kind='checkin', schema-v152): the kind vocabulary and its labels.
// Where a check-in SITS (Replies & admin, on both task lists) is pinned in
// taskSections.test.ts, against the one shared resolver.
//
// Run: npx vitest run --config vitest.config.lib.ts src/lib/__tests__/checkinGrouping.test.ts
import { describe, it, expect } from 'vitest'
import { TASK_KINDS, TASK_KIND_LABELS, TASK_KIND_OPTIONS, isCheckin, taskKindLabel, withKindLabel } from '../../../shared/taskKinds'
import { taskFullTitleHint, taskShortLabel, taskSubjectLabel } from '../displayNames'

describe('check-in kind', () => {
  it('the vocabulary carries checkin', () => {
    expect(TASK_KINDS).toContain('checkin')
    expect(isCheckin({ kind: 'checkin' })).toBe(true)
    expect(isCheckin({ kind: 'task' })).toBe(false)
  })

  it('every kind has a human label and the picker offers check-in but not question', () => {
    for (const k of TASK_KINDS) expect(TASK_KIND_LABELS[k]).toMatch(/^[A-Z]/)
    expect(taskKindLabel('checkin')).toBe('Check-in')
    expect(TASK_KIND_OPTIONS.map((o) => o.value)).toEqual(['task', 'milestone', 'checkin'])
    expect(TASK_KIND_OPTIONS.find((o) => o.value === 'checkin')?.label).toBe('Check-in')
  })

  // schema-v156 (Nick 2026-11-03): the label comes from kind, never the title.
  // Text surfaces name check-ins and milestones; tasks and questions read bare.
  it('withKindLabel names a check-in and a milestone, and nothing else', () => {
    expect(withKindLabel('checkin', 'Ask Casey')).toBe('Check-in: Ask Casey')
    expect(withKindLabel('milestone', 'LOI due')).toBe('Milestone: LOI due')
    expect(withKindLabel('task', 'Ask Casey')).toBe('Ask Casey')
    expect(withKindLabel('question', 'Pick one')).toBe('Pick one')
    expect(withKindLabel(null, 'Ask Casey')).toBe('Ask Casey')
    expect(withKindLabel(undefined, 'Ask Casey')).toBe('Ask Casey')
    expect(withKindLabel('nonsense', 'Ask Casey')).toBe('Ask Casey')
    // An empty subject stays empty, so a caller's own fallback still fires.
    expect(withKindLabel('checkin', '')).toBe('')
  })

  it('taskShortLabel labels by kind; taskSubjectLabel stays bare; the hover hint compares the subject', () => {
    expect(taskShortLabel({ kind: 'checkin', short_title: 'Casey abstract', title: 'Casey on the abstract' })).toBe('Check-in: Casey abstract')
    expect(taskShortLabel({ kind: 'milestone', title: 'LOI due' })).toBe('Milestone: LOI due')
    expect(taskShortLabel({ kind: 'task', title: 'Draft methods' })).toBe('Draft methods')
    expect(taskSubjectLabel({ short_title: 'Casey abstract', title: 'Casey on the abstract' })).toBe('Casey abstract')
    expect(taskFullTitleHint({ short_title: null, title: 'Casey on the abstract' })).toBeUndefined()
    expect(taskFullTitleHint({ short_title: 'Casey abstract', title: 'Casey on the abstract' })).toBe('Casey on the abstract')
  })
})
