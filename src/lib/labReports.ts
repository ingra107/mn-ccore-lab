// The Lab overview's text outputs, as pure functions so they are unit-tested:
// the Leadership insights sentences, the lab report, the PI report and the
// tasks CSV. They were inline in AnalyticsPage.tsx and PIAnalytics.tsx; the
// words and numbers are unchanged, except that the report's days-to-done line
// now reads the last-90-days median the Velocity tile shows (it used to read the
// 365-day median, a second number under the same name). The Report menu copies them to the clipboard.

import type { PIDashboardData } from '../hooks/usePIDashboard'

export function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  return `$${amount.toLocaleString()}`
}

export function commitmentRate(c: PIDashboardData['commitments']): number {
  return c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0
}

export interface LeadershipInsight { text: string; type: 'good' | 'warning' | 'info' }

export function buildLeadershipInsights(data: PIDashboardData): LeadershipInsight[] {
  const items: LeadershipInsight[] = []

  const rate = commitmentRate(data.commitments)
  if (rate >= 80) {
    items.push({ text: `Commitment completion rate is ${rate}% -- strong follow-through.`, type: 'good' })
  } else if (rate >= 50) {
    items.push({ text: `Commitment completion rate is ${rate}% -- room to improve.`, type: 'warning' })
  } else if (data.commitments.total > 0) {
    items.push({ text: `Commitment completion rate is ${rate}% -- needs attention.`, type: 'warning' })
  }

  if (data.commitments.overdue > 0) {
    items.push({
      text: `${data.commitments.overdue} commitment${data.commitments.overdue > 1 ? 's are' : ' is'} overdue.`,
      type: 'warning',
    })
  }

  if (data.responseMetrics.trend === 'improving') {
    items.push({
      text: `Team task completion speed improving: ${data.responseMetrics.median_days_recent}d median vs. ${data.responseMetrics.median_days_prior}d prior quarter.`,
      type: 'good',
    })
  } else if (data.responseMetrics.trend === 'slowing') {
    items.push({
      text: `Team task completion slowing: ${data.responseMetrics.median_days_recent}d median vs. ${data.responseMetrics.median_days_prior}d prior quarter.`,
      type: 'warning',
    })
  }

  const inactiveCount = data.teamEngagement.filter((m) => m.actions < 3).length
  if (inactiveCount > 0) {
    items.push({
      text: `${inactiveCount} team member${inactiveCount > 1 ? 's had' : ' had'} fewer than 3 activities in 30 days -- consider check-ins.`,
      type: 'info',
    })
  }

  if (data.grantPipeline.active_funding > 0) {
    items.push({
      text: `Active grant funding: ${formatCurrency(data.grantPipeline.active_funding)} across ${data.grantPipeline.active} grant${data.grantPipeline.active !== 1 ? 's' : ''}.`,
      type: 'info',
    })
  }

  return items
}

export function buildPiReport(data: PIDashboardData, insights: LeadershipInsight[], today: string): string {
  const rate = commitmentRate(data.commitments)
  return [
    'PI Dashboard Report',
    `Generated: ${today}`,
    '',
    `Commitment Rate: ${rate}% (${data.commitments.completed}/${data.commitments.total})`,
    `Overdue: ${data.commitments.overdue}`,
    `Days to done, team tasks: ${data.responseMetrics.median_days_recent}d median, last 90 days (${data.responseMetrics.trend})`,
    `Active Funding: ${data.grantPipeline.active_funding ? formatCurrency(data.grantPipeline.active_funding) : '$0'} (${data.grantPipeline.active} grants)`,
    `Trainee Pubs: ${data.menteeVelocity.reduce((s, m) => s + m.pub_count, 0)}`,
    '',
    'Insights:',
    ...insights.map((i) => `  ${i.type === 'good' ? '+' : i.type === 'warning' ? '!' : '-'} ${i.text}`),
  ].join('\n')
}

export interface LabReportInput {
  today: string
  weekRange: string
  weekStats: { completed: number; created: number; overdue: number; activityCount: number }
  activeProjects: number
  pendingTasks: number
  ideas: number
  health?: { healthy: number; needs_attention?: number; at_risk?: number; critical?: number } | null
}

export function buildLabReport(r: LabReportInput): string {
  const h = r.health
  return [
    `# MN-CCORE Lab Report — ${r.today}`,
    '',
    `## Week of ${r.weekRange}`,
    `- Completed: ${r.weekStats.completed}`,
    `- Created: ${r.weekStats.created}`,
    `- Overdue: ${r.weekStats.overdue}`,
    `- Activity: ${r.weekStats.activityCount}`,
    '',
    '## Summary',
    `- ${r.activeProjects} active projects`,
    `- ${r.pendingTasks} pending tasks`,
    `- ${r.ideas} research ideas`,
    h ? `- Health: ${h.healthy} healthy, ${h.needs_attention || 0} need attention, ${(h.at_risk || 0) + (h.critical || 0)} at risk` : '',
  ].filter(Boolean).join('\n')
}

export interface CsvTask {
  title?: string | null
  description?: string | null
  assignee?: string | null
  completed?: number | boolean | null
  status?: string | null
  priority?: string | null
  due_date?: string | null
  project_id?: string | null
  created_at?: string | null
  completed_at?: string | null
}

export function buildTasksCsv(tasks: CsvTask[]): string {
  const rows = [
    ['Task', 'Assignee', 'Status', 'Priority', 'Due Date', 'Project', 'Created', 'Completed'],
    ...tasks.map((t) => [
      (t.title || t.description || '').replace(/,/g, ';'),
      t.assignee || '',
      t.completed ? 'Done' : t.status || 'todo',
      t.priority || 'medium',
      t.due_date || '',
      t.project_id || '',
      t.created_at?.split('T')[0] || '',
      t.completed_at?.split('T')[0] || '',
    ]),
  ]
  return rows.map((r) => r.join(',')).join('\n')
}
