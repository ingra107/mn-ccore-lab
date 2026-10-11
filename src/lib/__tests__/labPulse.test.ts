import { describe, it, expect } from 'vitest'
import { pulseParts, formatDays, type PubsPulse, type SpeedPulse, type EngagementPulse } from '../labPulse'

const pubs = (trend: PubsPulse['pace']['trend'], per_year = 2.4): PubsPulse => ({
  mentees: [], perYear: [], pace: { per_year, last_year: 3, earlier_per_year: 2, trend },
})
const speed = (trend: SpeedPulse['summary']['trend'], median_days = 6): SpeedPulse => ({
  summary: { median_days, prior_median_days: 7, completed: 40, prior_completed: 35, trend }, monthly: [], byPriority: [],
})
const eng = (active: number, prior_active: number, trend: EngagementPulse['trend']): EngagementPulse => ({
  members: [], active, of: 14, prior_active, trend,
})

describe('Lab pulse line', () => {
  it('reads the way Nick wrote it', () => {
    const parts = pulseParts(pubs('up'), speed('faster'), eng(9, 11, 'down'))
    expect(parts.map((p) => `${p.text} ${p.mark}`.trim())).toEqual([
      'trainees 2.4 pubs/yr ▲',
      'tasks done in 6 days ▲',
      '9 of 14 active ▼2',
    ])
  })

  it('the arrow follows better or worse, not the raw direction: faster tasks are up, slower are down', () => {
    expect(pulseParts(undefined, speed('faster'))[0].better).toBe('better')
    expect(pulseParts(undefined, speed('slower'))[0].better).toBe('worse')
    expect(pulseParts(undefined, speed('slower'))[0].mark).toBe('▼')
  })

  it('leaves out a number it cannot back and draws no arrow when flat', () => {
    expect(pulseParts(pubs('insufficient_data'))).toEqual([])
    expect(pulseParts(undefined, { ...speed('flat'), summary: { ...speed('flat').summary, completed: 0 } })).toEqual([])
    expect(pulseParts(undefined, undefined, eng(9, 9, 'flat'))[0].mark).toBe('')
  })

  it('formats days', () => {
    expect([0.4, 1, 1.5, 6, 12.4].map(formatDays)).toEqual(['under a day', '1 day', '1.5 days', '6 days', '12 days'])
  })
})
