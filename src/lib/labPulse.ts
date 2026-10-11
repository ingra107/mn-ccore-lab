// Lab pulse -- the numbers behind the PI Analytics section and the one line on
// Today (Nick, 2026-10-11). Three PI-only routes feed it:
//   GET /api/analytics/mentee-velocity   trainee pubs a year
//   GET /api/analytics/response-time     days from a task made to it done
//   GET /api/analytics/team-engagement   who was active, and per person
// api/routes/pi-dashboard.ts decides each number; this file only names the
// shapes and turns them into the words on the line.

export type Better = 'better' | 'worse' | 'flat'

export interface PubsPulse {
  mentees: Array<{ slug: string; name: string; total: number }>
  perYear: Array<{ year: number; count: number; partial: boolean }>
  pace: { per_year: number; last_year: number; earlier_per_year: number; trend: 'up' | 'down' | 'flat' | 'insufficient_data' }
}

export interface SpeedPulse {
  summary: {
    median_days: number
    prior_median_days: number
    completed: number
    prior_completed: number
    trend: 'faster' | 'slower' | 'flat' | 'insufficient_data'
  }
  monthly: Array<{ month: string; completed: number; median_days: number }>
  byPriority: Array<{ priority: string; count: number; median_days: number }>
}

export interface EngagementPulse {
  members: Array<{
    slug: string
    name: string
    total: number
    comments: number
    updates: number
    completions: number
    score: number
    prior_total: number
    trend: 'up' | 'down' | 'flat'
    last_active: string | null
  }>
  active: number
  of: number
  prior_active: number
  trend: 'up' | 'down' | 'flat'
}

/** Is the change good news? Pace up, tasks faster, more people active: better. */
export function pubsBetter(p: PubsPulse): Better {
  return p.pace.trend === 'up' ? 'better' : p.pace.trend === 'down' ? 'worse' : 'flat'
}
export function speedBetter(s: SpeedPulse): Better {
  return s.summary.trend === 'faster' ? 'better' : s.summary.trend === 'slower' ? 'worse' : 'flat'
}
export function activeBetter(e: EngagementPulse): Better {
  return e.trend === 'up' ? 'better' : e.trend === 'down' ? 'worse' : 'flat'
}

/** Days as words: "under a day", "6 days", "1.5 days". Whole days from ten up. */
export function formatDays(n: number): string {
  if (n < 1) return 'under a day'
  const v = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10
  return `${v} ${v === 1 ? 'day' : 'days'}`
}

export const ARROW: Record<Better, string> = { better: '▲', worse: '▼', flat: '' }

export interface PulsePart {
  key: 'pubs' | 'speed' | 'active'
  text: string
  /** The arrow and any count that follows it ("▼2"); empty when flat. */
  mark: string
  better: Better
}

/**
 * The parts of the Today line. A part whose data has not arrived is left out,
 * so the line grows as the three requests land and says nothing it cannot back.
 * "tasks done in 6 days" reads faster-is-better, so its arrow follows speed,
 * not the number of days.
 */
export function pulseParts(pubs?: PubsPulse, speed?: SpeedPulse, eng?: EngagementPulse): PulsePart[] {
  const parts: PulsePart[] = []
  if (pubs && pubs.pace.trend !== 'insufficient_data') {
    const better = pubsBetter(pubs)
    parts.push({ key: 'pubs', text: `trainees ${pubs.pace.per_year} pubs/yr`, mark: ARROW[better], better })
  }
  if (speed && speed.summary.completed > 0) {
    const better = speedBetter(speed)
    parts.push({ key: 'speed', text: `tasks done in ${formatDays(speed.summary.median_days)}`, mark: ARROW[better], better })
  }
  if (eng && eng.of > 0) {
    const better = activeBetter(eng)
    const delta = Math.abs(eng.active - eng.prior_active)
    parts.push({ key: 'active', text: `${eng.active} of ${eng.of} active`, mark: better === 'flat' ? '' : `${ARROW[better]}${delta}`, better })
  }
  return parts
}
