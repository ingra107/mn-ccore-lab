import { useState, useMemo } from 'react'
import { CheckCircle2, Plus, AlertTriangle, TrendingUp, Users, FolderKanban, Lightbulb, FileText, ChevronLeft, ChevronRight, Calendar, Circle, BarChart3, Download } from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import MetricCard from '../../components/MetricCard'
import ActivityHeatmap from '../../components/ActivityHeatmap'
import { useTasks, useProjects, useIdeas, useActivity, useProjectHealth } from '../../hooks/useApiData'
import { useAuth } from '../../hooks/useAuth'
import { getPersonInfo } from '../../data/team'
import Avatar from '../../components/Avatar'

const PI_EMAILS = ['ningraha@umn.edu', 'sandb029@umn.edu', 'nicholas.ingraham@gmail.com']

// Get Monday of the week containing the given date
function getWeekStart(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function formatWeekRange(start: Date): string {
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} - ${fmt(end)}, ${end.getFullYear()}`
}

export default function AnalyticsPage() {
  const { user } = useAuth()
  const isPi = user?.email ? PI_EMAILS.includes(user.email) : false
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: ideas = [] } = useIdeas()
  const { data: activity = [] } = useActivity(100)
  const { data: healthData } = useProjectHealth()

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0)
  const currentWeekStart = useMemo(() => getWeekStart(new Date()), [])
  const selectedWeekStart = useMemo(() => {
    const d = new Date(currentWeekStart)
    d.setDate(d.getDate() + weekOffset * 7)
    return d
  }, [currentWeekStart, weekOffset])
  const selectedWeekEnd = useMemo(() => {
    const d = new Date(selectedWeekStart)
    d.setDate(d.getDate() + 7)
    return d
  }, [selectedWeekStart])
  const isCurrentWeek = weekOffset === 0

  // Week stats — relative to selected week
  const weekStats = useMemo(() => {
    const startStr = selectedWeekStart.toISOString()
    const endStr = selectedWeekEnd.toISOString()
    const now = new Date()

    const completed = tasks.filter((t) => t.completed_at && t.completed_at >= startStr && t.completed_at < endStr).length
    const created = tasks.filter((t) => t.created_at >= startStr && t.created_at < endStr).length
    const overdue = tasks.filter((t) => !t.completed && t.due_date && new Date(t.due_date + 'T23:59:59') < now).length
    const activityCount = activity.filter((a) => a.timestamp >= startStr && a.timestamp < endStr).length

    return { completed, created, overdue, activityCount }
  }, [tasks, activity, selectedWeekStart, selectedWeekEnd])

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

  const exportCSV = () => {
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
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mnccore-tasks-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <SectionHeader icon={BarChart3} title="Lab Analytics" subtitle={`${projects.length} projects · ${pendingTasks} active tasks — performance metrics and reports`} />
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors mt-1"
          style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', borderColor: 'var(--border-light)', background: 'none', cursor: 'pointer' }}
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Week Navigator */}
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setWeekOffset(weekOffset - 1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ borderColor: 'var(--border-light)', background: 'none', cursor: 'pointer', color: 'var(--slate)' }}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <Calendar size={14} style={{ color: 'var(--teal)' }} />
          <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
            {formatWeekRange(selectedWeekStart)}
          </span>
        </div>
        <button
          onClick={() => setWeekOffset(weekOffset + 1)}
          disabled={isCurrentWeek}
          className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ borderColor: 'var(--border-light)', background: 'none', cursor: isCurrentWeek ? 'default' : 'pointer', color: 'var(--slate)', opacity: isCurrentWeek ? 0.3 : 1 }}
        >
          <ChevronRight size={16} />
        </button>
        {!isCurrentWeek && (
          <button
            onClick={() => setWeekOffset(0)}
            className="px-3 py-1 rounded-lg text-xs font-medium border transition-colors"
            style={{ fontFamily: 'var(--font-sans)', color: 'var(--teal)', borderColor: 'var(--teal)', background: 'none', cursor: 'pointer' }}
          >
            This Week
          </button>
        )}
      </div>

      {/* Weekly Summary Cards */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={CheckCircle2} label="Completed" value={weekStats.completed} color="var(--green, #22c55e)" />
        <MetricCard icon={Plus} label="Created" value={weekStats.created} color="var(--teal)" />
        <MetricCard icon={AlertTriangle} label="Overdue" value={weekStats.overdue} color="var(--maroon)" />
        <MetricCard icon={TrendingUp} label="Activity" value={weekStats.activityCount} color="var(--gold)" />
      </div>

      {/* Attention Required — positive empty state when clear */}
      {weekStats.overdue > 0 ? (
        <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'var(--maroon)', borderLeftWidth: 3 }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} style={{ color: 'var(--maroon)' }} />
            <h3 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--maroon)' }}>
              Attention Required
            </h3>
            <span className="text-xs" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.6 }}>
              {weekStats.overdue} overdue task{weekStats.overdue > 1 ? 's' : ''} need attention
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {tasks.filter(t => !t.completed && t.due_date && new Date(t.due_date + 'T23:59:59') < new Date()).slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
                <Circle size={10} style={{ color: 'var(--maroon)', flexShrink: 0 }} />
                <span className="truncate">{t.title}</span>
                {t.due_date && <span style={{ color: 'var(--maroon)', fontFamily: 'var(--font-mono)', fontSize: '10px', flexShrink: 0 }}>Due {new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border p-4 text-center" style={{ borderColor: 'var(--border-light)' }}>
          <CheckCircle2 size={24} style={{ color: 'var(--green, #22c55e)', margin: '0 auto 6px' }} />
          <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>All caught up!</p>
          <p className="text-xs" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.6 }}>No overdue tasks. Keep up the momentum.</p>
        </div>
      )}

      {/* Second row: summary stats */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={FolderKanban} label="Active Projects" value={projects.filter((p) => p.status === 'Active').length} color="var(--teal)" subtitle={`${projects.length} total`} />
        <MetricCard icon={Lightbulb} label="Research Ideas" value={activeIdeas} color="var(--gold)" subtitle={`${ideas.length} total`} />
        <MetricCard icon={FileText} label="Pending Tasks" value={pendingTasks} color="var(--ink)" subtitle={`${tasks.length} total`} />
        <MetricCard icon={Users} label="Project Health" value={health?.green || 0} color="var(--green, #22c55e)" subtitle={`${health?.yellow || 0} attention · ${health?.red || 0} stale`} />
      </div>

      {/* Team Performance */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completion by person — PI-only for psychological safety (SDT research) */}
        {isPi ? (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-light)' }}>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
                Team Task Overview
              </h3>
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', backgroundColor: 'var(--border-light)' }}>
                PI only
              </span>
            </div>
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
        ) : (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-light)' }}>
            <h3 className="text-sm font-semibold mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
              Lab Progress This Week
            </h3>
            <div className="text-center py-6">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}>
                  {tasks.filter(t => t.completed_at && t.completed_at >= new Date(Date.now() - 7 * 86400000).toISOString()).length}
                </span>
                <span className="text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}>tasks completed</span>
              </div>
              <p className="text-xs" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.6 }}>
                {pendingTasks} still pending across the lab
              </p>
            </div>
          </div>
        )}

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
