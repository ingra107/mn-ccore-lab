// Check-ins (kind='checkin', schema-v152) group as Quick on both task lists:
// a check-in is a short "is this project moving?" prompt, not deep work.
// Both getGroupForTask copies are pinned so they cannot drift apart.
//
// Run: npx vitest run --config vitest.config.lib.ts src/lib/__tests__/checkinGrouping.test.ts
import { describe, it, expect } from 'vitest'
import { getGroupForTask as todayGroup } from '../../components/today/constants'
import { getGroupForTask as myTasksGroup } from '../../pages/MyTasks/constants'
import { CHECKIN_TITLE_PREFIX, TASK_KINDS, TASK_KIND_LABELS, TASK_KIND_OPTIONS, isCheckin, kindChangeFields, taskKindLabel } from '../../../shared/taskKinds'
import type { TaskRow } from '../api'

const row = (extra: Record<string, unknown>) =>
  ({ id: 't', title: 'Check in: CQODE', kind: 'checkin', due_date: null, deadline: null, group_override: null, ...extra }) as unknown as TaskRow

describe('check-in grouping', () => {
  for (const [name, fn] of [['Today', todayGroup], ['MyTasks', myTasksGroup]] as const) {
    it(`${name}: a check-in is Quick`, () => {
      expect(fn(row({}), new Map())).toBe('quick')
    })
    it(`${name}: an explicit group_override still wins`, () => {
      expect(fn(row({ group_override: 'deep' }), new Map())).toBe('deep')
    })
  }

  it('the vocabulary carries checkin and its title prefix', () => {
    expect(TASK_KINDS).toContain('checkin')
    expect(CHECKIN_TITLE_PREFIX).toBe('Check in: ')
    expect(isCheckin({ kind: 'checkin' })).toBe(true)
    expect(isCheckin({ kind: 'task' })).toBe(false)
  })

  it('every kind has a human label and the picker offers check-in but not question', () => {
    for (const k of TASK_KINDS) expect(TASK_KIND_LABELS[k]).toMatch(/^[A-Z]/)
    expect(taskKindLabel('checkin')).toBe('Check-in')
    expect(TASK_KIND_OPTIONS.map((o) => o.value)).toEqual(['task', 'milestone', 'checkin'])
    expect(TASK_KIND_OPTIONS.find((o) => o.value === 'checkin')?.label).toBe('Check-in')
  })

  it('switching to check-in prefixes the title once; other kinds leave it alone', () => {
    expect(kindChangeFields('checkin', 'Ask Casey')).toEqual({ kind: 'checkin', title: 'Check in: Ask Casey' })
    expect(kindChangeFields('checkin', 'Check in: Ask Casey')).toEqual({ kind: 'checkin' })
    expect(kindChangeFields('milestone', 'Ask Casey')).toEqual({ kind: 'milestone' })
  })
})
