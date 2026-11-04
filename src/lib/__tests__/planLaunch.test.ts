// planButtonState: what the Today Plan button says, read from the newest
// launch_log row that carries the plan seed. The daemon never writes
// 'expired', so a pending row past expires_at is judged here.
//
// Run: npx vitest run --config vitest.config.lib.ts src/lib/__tests__/planLaunch.test.ts

import { describe, it, expect } from 'vitest'
import { PLAN_SEED, newestPlanRow, planButtonState, type LaunchRow } from '../planLaunch'

// launch_log stores datetime('now'): 'YYYY-MM-DD HH:MM:SS' in UTC.
const NOW = '2026-11-04T18:00:00.000Z'
const row = (o: Partial<LaunchRow> = {}): LaunchRow => ({
  id: 'lnch_1', tag: 'quickchat', seed: PLAN_SEED, origin: 'mobile', status: 'pending',
  created_at: '2026-11-04 17:30:00', expires_at: '2026-11-04 19:30:00', ...o,
})

describe('planButtonState', () => {
  it('no row reads ready, with no note', () => {
    expect(planButtonState(null, NOW)).toEqual({ kind: 'ready', label: 'Plan', note: null })
  })

  it('queued_mobile_row_reads_queued, and says where', () => {
    const s = planButtonState(row(), NOW)
    expect(s.kind).toBe('queued')
    expect(s.note).toBe('Queued on your home laptop. It starts when that laptop is on.')
  })

  it('a pending computer row inside its window reads queued', () => {
    const s = planButtonState(row({ origin: 'computer', created_at: '2026-11-04 17:58:00', expires_at: '2026-11-04 18:08:00' }), NOW)
    expect(s.kind).toBe('queued')
  })

  it('past_expires_at_reads_expired_with_press_again', () => {
    const s = planButtonState(row({ expires_at: '2026-11-04 17:59:59' }), NOW)
    expect(s.kind).toBe('expired')
    expect(s.label).toBe('Plan again')
    expect(s.note).toMatch(/expired/)
  })

  it('failed_reads_failed with press again', () => {
    const s = planButtonState(row({ status: 'failed' }), NOW)
    expect(s.kind).toBe('failed')
    expect(s.label).toBe('Plan again')
    expect(s.note).toMatch(/failed/)
  })

  it('launched and completed rows read ready, on either origin', () => {
    for (const status of ['launched', 'completed']) {
      for (const origin of ['computer', 'mobile']) {
        expect(planButtonState(row({ status, origin }), NOW)).toEqual({ kind: 'ready', label: 'Plan', note: null })
      }
    }
  })

  it('a stored expired status reads expired', () => {
    expect(planButtonState(row({ status: 'expired' }), NOW).kind).toBe('expired')
  })

  it('a failed row older than a day reads ready', () => {
    const s = planButtonState(row({ status: 'failed', created_at: '2026-11-03 17:59:59' }), NOW)
    expect(s.kind).toBe('ready')
    expect(s.note).toBeNull()
  })

  it('an unreadable expires_at on a pending row reads expired, never stuck queued', () => {
    expect(planButtonState(row({ expires_at: null }), NOW).kind).toBe('expired')
  })
})

describe('newestPlanRow', () => {
  it('only_rows_with_the_plan_seed_count', () => {
    const rows = [
      row({ id: 'a', seed: 'summarize this', created_at: '2026-11-04 17:59:00' }),
      row({ id: 'b', tag: 'workon', created_at: '2026-11-04 17:58:00' }),
      row({ id: 'c', created_at: '2026-11-04 17:00:00' }),
      row({ id: 'd', created_at: '2026-11-04 16:00:00' }),
    ]
    expect(newestPlanRow(rows)?.id).toBe('c')
    expect(newestPlanRow([rows[0], rows[1]])).toBeNull()
    expect(newestPlanRow([])).toBeNull()
  })

  it('takes the newest by created_at whatever order the rows arrive in', () => {
    const rows = [row({ id: 'old', created_at: '2026-11-04 10:00:00' }), row({ id: 'new', created_at: '2026-11-04 12:00:00' })]
    expect(newestPlanRow(rows)?.id).toBe('new')
  })
})

describe('PLAN_SEED', () => {
  it('plan_seed_does_not_start_with_slash', () => {
    expect(PLAN_SEED.startsWith('/')).toBe(false)
  })
  it('is stored as typed: the POST trims the seed, so it must already be trimmed', () => {
    expect(PLAN_SEED).toBe(PLAN_SEED.trim())
    expect(PLAN_SEED).toContain('week-plan-session')
  })
})
