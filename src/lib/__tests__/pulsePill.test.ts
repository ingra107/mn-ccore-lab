// #156: what the top-bar pill says, and which tab it opens on. A gold
// "What's new" must drain (Rule 73): it lights only for something this person
// has not opened, and a seen id that no longer exists cannot keep it lit.
import { describe, it, expect } from 'vitest'
import { pulsePillState, seenAfterOpen, weekStartIso } from '../pulsePill'
import type { PulsePayload, PulseRelease } from '../../../shared/pulse'

const rel = (id: string, status: 'draft' | 'approved' = 'approved'): PulseRelease =>
  ({ id, title: 't', blurbs: [{ lead: 'L', text: 'T' }], approvedAt: null, status, commits: [] })
const base: PulsePayload = {
  release: null, pastReleases: [], draft: null, announcement: null,
  active: ['nick-ingraham', 'casey-eddington'], tasksDone: 3, milestonesHit: 0, newPapers: 0, wins: [],
}
const NONE = { releaseId: null, announcementId: null }

describe('pulsePillState', () => {
  it('lights for an unseen release and opens on What\'s new', () => {
    expect(pulsePillState({ ...base, release: rel('rel_1') }, NONE, false)).toEqual({ tone: 'news', label: "What's new", openTab: 'news' })
  })
  it('lights for an unseen announcement', () => {
    const p = { ...base, announcement: { id: 'ann_1', body: 'x', authorSlug: 'nick-ingraham', createdAt: '' } }
    expect(pulsePillState(p, NONE, false).tone).toBe('news')
  })
  it('settles to the pulse once both are seen', () => {
    const p = { ...base, release: rel('rel_1'), announcement: { id: 'ann_1', body: 'x', authorSlug: 'n', createdAt: '' } }
    expect(pulsePillState(p, { releaseId: 'rel_1', announcementId: 'ann_1' }, false))
      .toEqual({ tone: 'pulse', label: 'Lab pulse · 2 active', openTab: 'pulse' })
  })
  it('a seen announcement that was deleted does not keep it lit', () => {
    expect(pulsePillState({ ...base, release: rel('rel_1') }, { releaseId: 'rel_1', announcementId: 'ann_gone' }, false).tone).toBe('pulse')
  })
  it('a pending draft lights it for the PI only', () => {
    const p = { ...base, draft: rel('rel_d', 'draft') }
    expect(pulsePillState(p, NONE, true).tone).toBe('news')
    expect(pulsePillState(p, NONE, false).tone).toBe('pulse')
  })
  it('before the payload arrives it reads 0 active, unlit', () => {
    expect(pulsePillState(undefined, NONE, true)).toEqual({ tone: 'pulse', label: 'Lab pulse · 0 active', openTab: 'pulse' })
  })
})

describe('seenAfterOpen', () => {
  it('records the release and announcement now showing', () => {
    const p = { ...base, release: rel('rel_2'), announcement: { id: 'ann_3', body: 'x', authorSlug: 'n', createdAt: '' } }
    expect(seenAfterOpen(p)).toEqual({ releaseId: 'rel_2', announcementId: 'ann_3' })
    expect(seenAfterOpen(base)).toEqual({ releaseId: null, announcementId: null })
  })
})

describe('weekStartIso', () => {
  it('is the viewer-local Monday 00:00 as a UTC instant', () => {
    // Wednesday 2026-10-28 10:00 local -> Monday 2026-10-26 00:00 local.
    const wed = new Date(2026, 9, 28, 10, 0, 0)
    expect(weekStartIso(wed)).toBe(new Date(2026, 9, 26, 0, 0, 0).toISOString())
    // A Sunday belongs to the week that began the Monday before.
    expect(weekStartIso(new Date(2026, 10, 1, 23, 0, 0))).toBe(new Date(2026, 9, 26, 0, 0, 0).toISOString())
  })
})
