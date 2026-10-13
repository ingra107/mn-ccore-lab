import { describe, it, expect } from 'vitest'
import { buildLeadershipInsights, buildPiReport, buildLabReport, buildTasksCsv, formatCurrency, commitmentRate } from '../labReports'
import type { PIDashboardData } from '../../hooks/usePIDashboard'

const base: PIDashboardData = {
  commitments: { total: 52, completed: 41, overdue: 2 },
  responseMetrics: { median_days: 9, median_days_recent: 8, median_days_prior: 12, trend: 'improving', total_tasks: 40 },
  menteeVelocity: [{ slug: 'a', name: 'A', pub_count: 3, rate: 1, first_year: 2023 }, { slug: 'b', name: 'B', pub_count: 2, rate: 1, first_year: 2024 }],
  grantPipeline: { total: 5, pending: 2, active: 3, active_funding: 1_400_000 },
  teamEngagement: [{ slug: 'a', actions: 1, comments: 0, updates: 0, completions: 1, score: 1 }, { slug: 'b', actions: 9, comments: 3, updates: 3, completions: 3, score: 20 }],
  pubsByQuarter: [],
  grantsFunnel: { submitted: 2, active: 3 },
  productsByStage: [],
}

describe('formatCurrency', () => {
  it('abbreviates by magnitude', () => {
    expect(formatCurrency(1_400_000)).toBe('$1.4M')
    expect(formatCurrency(250_000)).toBe('$250K')
    expect(formatCurrency(900)).toBe('$900')
  })
})

describe('buildLeadershipInsights', () => {
  it('keeps the sentences the PI analytics tab wrote', () => {
    const texts = buildLeadershipInsights(base).map((i) => i.text)
    expect(commitmentRate(base.commitments)).toBe(79)
    expect(texts).toContain('Commitment completion rate is 79% -- room to improve.')
    expect(texts).toContain('2 commitments are overdue.')
    expect(texts).toContain('Team task completion speed improving: 8d median vs. 12d prior quarter.')
    expect(texts).toContain('1 team member had fewer than 3 activities in 30 days -- consider check-ins.')
    expect(texts).toContain('Active grant funding: $1.4M across 3 grants.')
  })
  it('says nothing when there is nothing to say', () => {
    const empty = { ...base, commitments: { total: 0, completed: 0, overdue: 0 }, responseMetrics: { ...base.responseMetrics, trend: 'stable' as const }, teamEngagement: [], grantPipeline: { total: 0, pending: 0, active: 0, active_funding: 0 } }
    expect(buildLeadershipInsights(empty)).toEqual([])
  })
})

describe('reports', () => {
  it('PI report carries the same lines as before', () => {
    const out = buildPiReport(base, buildLeadershipInsights(base), '10/13/2026')
    expect(out).toContain('Commitment Rate: 79% (41/52)')
    expect(out).toContain('Days to done, team tasks: 8d median, last 90 days (improving)')
    expect(out).toContain('Trainee Pubs: 5')
    expect(out).toContain('  ! 2 commitments are overdue.')
  })
  it('lab report lists the week and the summary', () => {
    const out = buildLabReport({ today: '10/13/2026', weekRange: 'Oct 12 - Oct 18, 2026', weekStats: { completed: 23, created: 31, overdue: 9, activityCount: 142 }, activeProjects: 24, pendingTasks: 52, ideas: 12, health: { healthy: 11, needs_attention: 3, at_risk: 1, critical: 1 } })
    expect(out).toContain('## Week of Oct 12 - Oct 18, 2026')
    expect(out).toContain('- Health: 11 healthy, 3 need attention, 2 at risk')
  })
  it('CSV drops commas out of titles and marks done rows', () => {
    const csv = buildTasksCsv([{ title: 'a, b', assignee: 'nick', completed: 1, priority: 'high', created_at: '2026-10-01T10:00:00Z' }])
    expect(csv.split('\n')[1]).toBe('a; b,nick,Done,high,,,2026-10-01,')
  })
})
