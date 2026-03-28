import { useMemo } from 'react'
import { CheckCircle2, Plus, AlertTriangle, TrendingUp, Users, FolderKanban, Lightbulb, FileText } from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import MetricCard from '../../components/MetricCard'
import ActivityHeatmap from '../../components/ActivityHeatmap'
import { useTasks, useProjects, useIdeas, useActivity, useProjectHealth } from '../../hooks/useApiData'
import { getPersonInfo } from '../../data/team'
import Avatar from '../../components/Avatar'

export default function AnalyticsPage() {
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: ideas = [] } = useIdeas()
  const { data: activity = [] } = useActivity(100)
  const { data: healthData } = useProjectHealth()

  // This week's stats
  const thisWeek = useMemo(() => {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const weekStr = weekAgo.toISOString()

    const completedThisWeek = tasks.filter((t) => t.completed_at && t.completed_at >= weekStr).length
    const createdThisWeek = tasks.filter((t) => t.created_at >= weekStr).length
    const overdue = tasks.filter((t) => !t.completed && t.due_date && new Date(t.due_date + 'T23:59:59') < now).length
    const activityThisWeek = activity.filter((a) => a.timestamp >= weekStr).length

    return { completedThisWeek, createdThisWeek, overdue, activityThisWeek }
  }, [tasks, activity])

  // Task completion by person
  const completionByPerson = useMemo(() => {
    const now = new Date()
    const map = new Map<string, { total: number; done: number; overdue: number }>()
    for (const t of tasks) {
      const entry = map.get(t.assignee) || { total: 0, done: 0, overdue: 0 }
      entry.total++
      if (t.completed) entry.done++
      if (!t.completed && t.due_date && new Date(t.due_date + 'T23:59:59') < now) entry.overdue++
      map.set(t.assignee, entry)
    }
    return [...map.entries()]
      .map(([slug, stats]) => ({ slug, ...stats, rate: stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [tasks])

  // Projects by stage
  const projectsByStage = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of projects) {
      const stage = p.stage || 'Idea'
      map.set(stage, (map.get(stage) || 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [projects])

  // Task priority distribution
  const tasksByPriority = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) {
      if (t.completed) continue
      map.set(t.priority, (map.get(t.priority) || 0) + 1)
    }
    return map
  }, [tasks])

  const health = healthData?.summary
  const pendingTasks = tasks.filter((t) => !t.completed).length
  const activeIdeas = ideas.filter((i) => i.status !== 'archived').length

  return (
    <div>
      <SectionHeader title="Lab Analytics" subtitle="Performance metrics and activity reports" />

      {/* Weekly Summary Cards */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={CheckCircle2} label="Completed This Week" value={thisWeek.completedThisWeek} color="var(--green, #22c55e)" />
        <MetricCard icon={Plus} label="Created This Week" value={thisWeek.createdThisWeek} color="var(--teal)" />
        <MetricCard icon={AlertTriangle} label="Overdue Tasks" value={thisWeek.overdue} color="var(--maroon)" />
        <MetricCard icon={TrendingUp} label="Activity Events" value={thisWeek.activityThisWeek} color="var(--gold)" />
      </div>

      {/* Second row: summary stats */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={FolderKanban} label="Active Projects" value={projects.filter((p) => p.status === 'Active').length} color="var(--teal)" subtitle={`${projects.length} total`} />
        <MetricCard icon={Lightbulb} label="Research Ideas" value={activeIdeas} color="var(--gold)" subtitle={`${ideas.length} total`} />
        <MetricCard icon={FileText} label="Pending Tasks" value={pendingTasks} color="var(--ink)" subtitle={`${tasks.length} total`} />
        <MetricCard icon={Users} label="Project Health" value={health?.green || 0} color="var(--green, #22c55e)" subtitle={`${health?.yellow || 0} attention · ${health?.red || 0} stale`} />
      </div>

      {/* Team Performance */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completion by person */}
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-light)' }}>
          <h3 className="text-sm font-semibold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
            Team Task Overview
          </h3>
          <div className="flex flex-col gap-3">
            {completionByPerson.map(({ slug, total, done, overdue, rate }) => {
              const person = getPersonInfo(slug)
              return (
                <div key={slug} className="flex items-center gap-3">
                  <div style={{ width: 28, height: 28 }}>
                    <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-7 !h-7 !min-w-0 !min-h-0 !text-[8px]" />
                  </div>
                  <span className="text-sm w-28 truncate" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
                    {person.name}
                  </span>
                  {/* Progress bar */}
                  <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-light)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, backgroundColor: rate > 70 ? 'var(--green, #22c55e)' : rate > 40 ? 'var(--gold)' : 'var(--maroon)' }} />
                  </div>
                  <span className="text-[11px] w-16 text-right" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)' }}>
                    {done}/{total}
                  </span>
                  {overdue > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ fontFamily: 'var(--font-mono)', color: 'var(--maroon)', backgroundColor: 'rgba(122,0,25,0.08)' }}>
                      {overdue} overdue
                    </span>
                  )}
                </div>
              )
            })}
            {completionByPerson.length === 0 && (
              <p className="text-center py-6 text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>No task data yet</p>
            )}
          </div>
        </div>

        {/* Projects by stage */}
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-light)' }}>
          <h3 className="text-sm font-semibold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
            Project Pipeline Distribution
          </h3>
          <div className="flex flex-col gap-2">
            {projectsByStage.map(([stage, count]) => {
              const maxCount = Math.max(...projectsByStage.map(([, c]) => c))
              const width = (count / maxCount) * 100
              const stageColors: Record<string, string> = {
                'Idea': 'var(--slate)',
                'Data Collection': 'var(--teal)',
                'Analysis': 'var(--gold)',
                'Writing': '#c2410c',
                'Review': 'var(--maroon)',
                'Published': 'var(--green, #22c55e)',
              }
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className="text-xs w-28" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>{stage}</span>
                  <div className="flex-1 h-5 rounded overflow-hidden" style={{ backgroundColor: 'var(--border-light)' }}>
                    <div className="h-full rounded transition-all flex items-center px-2" style={{ width: `${width}%`, backgroundColor: stageColors[stage] || 'var(--teal)', minWidth: 24 }}>
                      <span className="text-[9px] font-semibold" style={{ color: 'white', fontFamily: 'var(--font-mono)' }}>{count}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Priority distribution */}
          <h4 className="text-xs font-semibold mt-6 mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
            Active Task Priority
          </h4>
          <div className="flex items-center gap-3">
            {(['urgent', 'high', 'medium', 'low'] as const).map((p) => {
              const count = tasksByPriority.get(p) || 0
              const colors: Record<string, string> = { urgent: 'var(--maroon)', high: '#c2410c', medium: 'var(--gold)', low: 'var(--slate)' }
              return (
                <div key={p} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: colors[p] }} />
                  <span className="text-xs capitalize" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>{p}</span>
                  <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-mono)', color: colors[p] }}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Lab-wide Activity Heatmap */}
      <div className="mt-6 rounded-xl border p-5" style={{ borderColor: 'var(--border-light)' }}>
        <h3 className="text-sm font-semibold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
          Lab Activity
        </h3>
        <ActivityHeatmap days={90} />
      </div>
    </div>
  )
}
