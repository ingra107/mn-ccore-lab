/**
 * Standalone logic check for useMeetingNotesSeen's pure functions.
 *
 * NOTE (2026-07-06): this repo has no wired unit-test harness for `src/`
 * (no vitest/jsdom config touching React hooks — only `vitest.config.api.ts`
 * for `api/` Worker routes, confirmed via `git grep` finding zero
 * *.test.ts / *.test.tsx files anywhere under src/ at HEAD before this
 * one). Wiring a full
 * jsdom/testing-library harness is a standalone infra decision, not a
 * drive-by addition here. `seedBaseline`/`computeIsNew` were extracted as
 * pure functions specifically so the cold-start contract can be verified
 * without one — this script asserts them directly and exits non-zero on
 * failure.
 *
 * Run: npx tsx src/hooks/__tests__/useMeetingNotesSeen.logic.test.ts
 */
import assert from 'node:assert/strict'
import { seedBaseline, computeIsNew, type MeetingFreshnessInput } from '../useMeetingNotesSeen'

let passed = 0
function check(label: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ok — ${label}`)
}

// ── Cold start: seeding must not badge pre-existing history ────────────
{
  const existing: MeetingFreshnessInput[] = [
    { id: 'm1', notes: 'old notes', updated_at: '2026-01-01T00:00:00.000Z' },
    { id: 'm2', notes: '', updated_at: '2026-02-01T00:00:00.000Z' },
    { id: 'm3', notes: 'more old notes', updated_at: '2026-03-01T00:00:00.000Z' },
  ]
  const baseline = seedBaseline(existing, () => '2026-07-06T00:00:00.000Z')

  check('cold start: every existing meeting gets its OWN updated_at as baseline', () => {
    assert.equal(baseline.m1, '2026-01-01T00:00:00.000Z')
    assert.equal(baseline.m3, '2026-03-01T00:00:00.000Z')
  })

  check('cold start: nothing in the seeded set shows as new', () => {
    for (const m of existing) assert.equal(computeIsNew(baseline, m), false)
  })

  check('pre-seed (seenMap null): never badges, even with notes', () => {
    assert.equal(computeIsNew(null, existing[0]), false)
  })
}

// ── Post-seed: freshness detection ──────────────────────────────────────
{
  const baseline = seedBaseline(
    [{ id: 'm1', notes: 'notes', updated_at: '2026-06-01T00:00:00.000Z' }],
    () => '2026-07-06T00:00:00.000Z'
  )

  check('notes updated after baseline -> new', () => {
    const updated: MeetingFreshnessInput = { id: 'm1', notes: 'edited notes', updated_at: '2026-06-02T00:00:00.000Z' }
    assert.equal(computeIsNew(baseline, updated), true)
  })

  check('notes unchanged since baseline -> not new', () => {
    const same: MeetingFreshnessInput = { id: 'm1', notes: 'notes', updated_at: '2026-06-01T00:00:00.000Z' }
    assert.equal(computeIsNew(baseline, same), false)
  })

  check('meeting with no baseline entry (added after seeding) -> new', () => {
    const brandNew: MeetingFreshnessInput = { id: 'm2', notes: 'fresh notes', updated_at: '2026-07-05T00:00:00.000Z' }
    assert.equal(computeIsNew(baseline, brandNew), true)
  })

  check('empty notes never badge, regardless of updated_at', () => {
    const noNotes: MeetingFreshnessInput = { id: 'm3', notes: '', updated_at: '2026-07-05T00:00:00.000Z' }
    assert.equal(computeIsNew(baseline, noNotes), false)
  })

  check('missing updated_at never badges (can\'t prove freshness)', () => {
    const noTimestamp: MeetingFreshnessInput = { id: 'm4', notes: 'notes', updated_at: null }
    assert.equal(computeIsNew(baseline, noTimestamp), false)
  })
}

// ── Auth caveat: unauth payload (no `notes` key) must not badge ─────────
{
  const baseline = seedBaseline([{ id: 'm1', updated_at: '2026-06-01T00:00:00.000Z' }], () => '2026-07-06T00:00:00.000Z')
  check('unauth row (notes absent) cleanly does not badge', () => {
    const publicRow: MeetingFreshnessInput = { id: 'm1', updated_at: '2026-07-05T00:00:00.000Z' }
    assert.equal(computeIsNew(baseline, publicRow), false)
  })
}

console.log(`\n${passed}/${passed} checks passed`)
