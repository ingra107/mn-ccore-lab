import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { CheckCircle2, Plus, AlertTriangle, TrendingUp, Users, FolderKanban, Lightbulb, FileText, ChevronLeft, ChevronRight, Calendar, Circle, BarChart3, Download, Copy } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import MetricCard from '../../components/MetricCard'
import EmptyState from '../../components/EmptyState'
import { CardSkeleton } from '../../components/LoadingSkeleton'
import ActivityHeatmap from '../../components/ActivityHeatmap'
import { staggerContainer, staggerItem } from '../../lib/animations'
import { useTasks, useProjects, useIdeas, useActivity, useProjectHealth } from '../../hooks/useApiData'
import { formatShortDate } from '../../lib/dateUtils'
import { useAuth } from '../../hooks/useAuth'
import { getPersonInfo } from '../../data/team'
import Avatar from '../../components/Avatar'
import { PRIORITY_COLORS, isProjectActive } from '../../lib/taskConstants'

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

type TimeRange = '7d' | '4w' | '3m' | 'all'

const RANGE_WEEKS: Record<TimeRange, number> = {
  '7d': 1,
  '4w': 4,
  '3m': 13,
  'all': 52,
}

export default function AnalyticsPage() {
  const { user } = useAuth()
  const isPi = user?.email ? PI_EMAILS.includes(user.email) : false
  const { data: tasks = [], isLoading: tasksLoading } = useTasks()
  const { data: projects = [], isLoading: projectsLoading } = useProjects()
  const { data: ideas = [] } = useIdeas()
  const { data: activity = [] } = useActivity(100)
  const { data: healthData } = useProjectHealth()

  // Time range filter
  const [range, setRange] = useState<TimeRange>('4w')

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

  // Task completion by person — only computed for PIs (individual metrics are PI-only)
  const completionByPerson = useMemo(() => {
    if (!isPi) return []
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
  }, [tasks, isPi])

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

  // Velocity data: compute up to 52 weeks, slice by range for display
  const allVelocityWeeks = useMemo(() => {
    const now = new Date()
    const totalWeeks = 52
    const weeks: { week: string; completed: number; created: number }[] = []
    for (let i = totalWeeks - 1; i >= 0; i--) {
      const wStart = new Date(now)
      wStart.setDate(wStart.getDate() - wStart.getDay() - i * 7)
      wStart.setHours(0, 0, 0, 0)
      const wEnd = new Date(wStart)
      wEnd.setDate(wEnd.getDate() + 7)
      const wStartStr = wStart.toISOString()
      const wEndStr = wEnd.toISOString()
      const completed = tasks.filter(t => t.completed_at && t.completed_at >= wStartStr && t.completed_at < wEndStr).length
      const created = tasks.filter(t => t.created_at >= wStartStr && t.created_at < wEndStr).length
      const label = wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      weeks.push({ week: label, completed, created })
    }
    return weeks
  }, [tasks])

  const velocityWeeks = useMemo(() => {
    const numWeeks = RANGE_WEEKS[range]
    return allVelocityWeeks.slice(-numWeeks)
  }, [allVelocityWeeks, range])

  // Task age histogram data for Recharts
  const taskAgeBuckets = useMemo(() => {
    const now = new Date()
    const active = tasks.filter(t => !t.completed && t.created_at)
    const buckets = [
      { label: '<1w', max: 7, count: 0, fill: 'var(--teal)' },
      { label: '1-2w', max: 14, count: 0, fill: 'var(--teal)' },
      { label: '2-4w', max: 28, count: 0, fill: 'var(--gold)' },
      { label: '1-2m', max: 60, count: 0, fill: 'var(--maroon)' },
      { label: '2m+', max: Infinity, count: 0, fill: 'var(--maroon)' },
    ]
    for (const t of active) {
      const age = Math.floor((now.getTime() - new Date(t.created_at).getTime()) / 86400000)
      const bucket = buckets.find(b => age < b.max) || buckets[buckets.length - 1]
      bucket.count++
    }
    return buckets
  }, [tasks])

  // Sparkline arrays (always trailing 8-week values for metric cards)
  const spark8 = useMemo(() => allVelocityWeeks.slice(-8), [allVelocityWeeks])
  const sparkCompleted = useMemo(() => spark8.map(w => w.completed), [spark8])
  const sparkCreated = useMemo(() => spark8.map(w => w.created), [spark8])
  const sparkOverdue = useMemo(() => {
    const now = new Date()
    const data: number[] = []
    for (let i = 7; i >= 0; i--) {
      const wEnd = new Date(now)
      wEnd.setDate(wEnd.getDate() - wEnd.getDay() - i * 7 + 7)
      wEnd.setHours(0, 0, 0, 0)
      const overdue = tasks.filter(t => !t.completed && t.due_date && new Date(t.due_date + 'T23:59:59') < wEnd).length
      data.push(overdue)
    }
    return data
  }, [tasks])
  const sparkActivity = useMemo(() => {
    const now = new Date()
    const data: number[] = []
    for (let i = 7; i >= 0; i--) {
      const wStart = new Date(now)
      wStart.setDate(wStart.getDate() - wStart.getDay() - i * 7)
      wStart.setHours(0, 0, 0, 0)
      const wEnd = new Date(wStart)
      wEnd.setDate(wEnd.getDate() + 7)
      const wStartStr = wStart.toISOString()
      const wEndStr = wEnd.toISOString()
      const count = activity.filter(a => a.timestamp >= wStartStr && a.timestamp < wEndStr).length
      data.push(count)
    }
    return data
  }, [activity])

  // Cross-project resource heatmap: tasks per person per week (this week + 3 future weeks)
  const workloadHeatmap = useMemo(() => {
    if (!isPi) return { members: [], weeks: [] }
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    // Get Monday of current week
    const day = todayStart.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    const thisMonday = new Date(todayStart)
    thisMonday.setDate(thisMonday.getDate() + mondayOffset)

    const weeks: { label: string; start: Date; end: Date }[] = []
    for (let i = 0; i < 4; i++) {
      const wStart = new Date(thisMonday)
      wStart.setDate(wStart.getDate() + i * 7)
      const wEnd = new Date(wStart)
      wEnd.setDate(wEnd.getDate() + 7)
      const label = i === 0 ? 'This Week' : i === 1 ? 'Next Week' : `Week ${i + 1}`
      weeks.push({ label, start: wStart, end: wEnd })
    }

    const active = tasks.filter(t => !t.completed && t.due_date)
    const memberMap = new Map<string, number[]>()
    for (const t of active) {
      const due = new Date(t.due_date! + 'T12:00:00')
      for (let wi = 0; wi < weeks.length; wi++) {
        if (due >= weeks[wi].start && due < weeks[wi].end) {
          if (!memberMap.has(t.assignee)) memberMap.set(t.assignee, [0, 0, 0, 0])
          memberMap.get(t.assignee)![wi]++
          break
        }
      }
    }

    // Sort by total task count (busiest first)
    const members = [...memberMap.entries()]
      .map(([slug, counts]) => ({ slug, counts, total: counts.reduce((a, b) => a + b, 0) }))
      .filter(m => m.total > 0)
      .sort((a, b) => b.total - a.total)

    return { members, weeks }
  }, [tasks, isPi])

  const health = healthData?.summary
  const pendingTasks = tasks.filter((t) => !t.completed).length
  const activeIdeas = ideas.filter((i) => i.status !== 'archived').length

  const copyReport = () => {
    const lines = [
      `# MN-CCORE Lab Report — ${new Date().toLocaleDateString()}`,
      '',
      `## Week of ${formatWeekRange(selectedWeekStart)}`,
      `- Completed: ${weekStats.completed}`,
      `- Created: ${weekStats.created}`,
      `- Overdue: ${weekStats.overdue}`,
      `- Activity: ${weekStats.activityCount}`,
      '',
      '## Summary',
      `- ${projects.filter(p => isProjectActive(p.status)).length} active projects`,
      `- ${pendingTasks} pending tasks`,
      `- ${ideas.filter(i => i.status !== 'archived').length} research ideas`,
      health ? `- Health: ${health.healthy} healthy, ${health.needs_attention || 0} need attention, ${(health.at_risk || 0) + (health.critical || 0)} at risk` : '',
    ].filter(Boolean)
    navigator.clipboard.writeText(lines.join('\n'))
  }

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

  if (tasksLoading || projectsLoading) return <CardSkeleton count={6} />

  if (tasks.length === 0 && projects.length === 0) {
    return (
      <div>
        <PageHeader
          icon={<BarChart3 size={20} />}
          title="Lab Analytics"
          subtitle="Track lab performance and trends"
        />
        <EmptyState
          icon={<BarChart3 size={40} />}
          title="No analytics data yet"
          subtitle="Analytics appear as projects and tasks are tracked."
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        icon={<BarChart3 size={20} />}
        title="Lab Analytics"
        subtitle={`${projects.length} projects, ${pendingTasks} active tasks`}
        actions={isPi ? (
          <div className="flex items-center gap-2">
            <button
              onClick={copyReport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', background: 'none', cursor: 'pointer' }}
            >
              <Copy size={14} />
              Copy Report
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', background: 'none', cursor: 'pointer' }}
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        ) : undefined}
      />

      {/* Week Navigator + Range Selector */}
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setWeekOffset(weekOffset - 1)}
          aria-label="Previous week"
          className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ borderColor: 'var(--border-subtle)', background: 'none', cursor: 'pointer', color: 'var(--slate)' }}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <Calendar size={14} style={{ color: 'var(--teal)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {formatWeekRange(selectedWeekStart)}
          </span>
        </div>
        <button
          onClick={() => setWeekOffset(weekOffset + 1)}
          disabled={isCurrentWeek}
          aria-label="Next week"
          className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ borderColor: 'var(--border-subtle)', background: 'none', cursor: isCurrentWeek ? 'default' : 'pointer', color: 'var(--slate)', opacity: isCurrentWeek ? 0.3 : 1 }}
        >
          <ChevronRight size={16} />
        </button>
        {!isCurrentWeek && (
          <button
            onClick={() => setWeekOffset(0)}
            className="px-3 py-1 rounded-lg text-xs font-medium border transition-colors"
            style={{ color: 'var(--teal)', borderColor: 'var(--teal)', background: 'none', cursor: 'pointer' }}
          >
            This Week
          </button>
        )}

        {/* Range selector pills */}
        <div className="flex items-center gap-1 ml-auto rounded-lg border p-0.5" style={{ borderColor: 'var(--border-subtle)' }}>
          {(['7d', '4w', '3m', 'all'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
              style={{
                background: range === r ? 'var(--teal)' : 'transparent',
                color: range === r ? 'var(--ink-bright, #fff)' : 'var(--slate)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {r === 'all' ? 'All' : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly Summary Cards */}
      <motion.div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3" variants={staggerContainer} initial="hidden" animate="visible">
        <motion.div variants={staggerItem}><MetricCard icon={CheckCircle2} label="Completed" value={weekStats.completed} color="var(--green)" sparklineData={sparkCompleted} /></motion.div>
        <motion.div variants={staggerItem}><MetricCard icon={Plus} label="Created" value={weekStats.created} color="var(--teal)" sparklineData={sparkCreated} /></motion.div>
        <motion.div variants={staggerItem}><MetricCard icon={AlertTriangle} label="Overdue" value={weekStats.overdue} color="var(--maroon)" sparklineData={sparkOverdue} /></motion.div>
        <motion.div variants={staggerItem}><MetricCard icon={TrendingUp} label="Activity" value={weekStats.activityCount} color="var(--gold)" sparklineData={sparkActivity} /></motion.div>
      </motion.div>

      {/* Lab health summary */}
      {health && (
        <div className="mt-3 flex items-center gap-2 text-[11px]" style={{ color: 'var(--muted)' }}>
          <span>Lab health:</span>
          <span style={{ color: 'var(--green)' }}>{health.healthy} healthy</span>
          {(health.needs_attention || 0) > 0 && <span style={{ color: 'var(--gold)' }}>{health.needs_attention} need attention</span>}
          {((health.at_risk || 0) + (health.critical || 0)) > 0 && <span style={{ color: 'var(--maroon)' }}>{(health.at_risk || 0) + (health.critical || 0)} at risk</span>}
          <span>&middot;</span>
          <span>Net this week: {weekStats.completed - weekStats.created > 0 ? '+' : ''}{weekStats.completed - weekStats.created} tasks ({weekStats.completed} done, {weekStats.created} created)</span>
        </div>
      )}

      {/* Attention Required — positive empty state when clear */}
      {weekStats.overdue > 0 ? (
        <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'var(--maroon)', borderLeftWidth: 3 }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} style={{ color: 'var(--maroon)' }} />
            <h3 className="text-sm font-normal" style={{ color: 'var(--maroon)' }}>
              Attention Required
            </h3>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {weekStats.overdue} overdue task{weekStats.overdue > 1 ? 's' : ''} need attention
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {tasks.filter(t => !t.completed && t.due_date && new Date(t.due_date + 'T23:59:59') < new Date()).slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink)' }}>
                <Circle size={10} style={{ color: 'var(--maroon)', flexShrink: 0 }} />
                <span className="truncate">{t.title}</span>
                {t.due_date && <span style={{ color: 'var(--maroon)', fontSize: '10px', flexShrink: 0 }}>Due {formatShortDate(t.due_date)}</span>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border p-4 text-center" style={{ borderColor: 'var(--border-subtle)' }}>
          <CheckCircle2 size={24} style={{ color: 'var(--green)', margin: '0 auto 6px' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>All caught up!</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>No overdue tasks. Keep up the momentum.</p>
        </div>
      )}

      {/* Lab-wide Activity Heatmap — above the fold */}
      <div className="mt-4 rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <h3 className="text-sm font-normal mb-4" style={{ color: 'var(--ink)' }}>
          Lab Activity
        </h3>
        <ActivityHeatmap days={range === '7d' ? 30 : range === '4w' ? 90 : range === '3m' ? 180 : 365} />
      </div>

      {/* Second row: summary stats */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={FolderKanban} label="Active Projects" value={projects.filter((p) => isProjectActive(p.status)).length} color="var(--teal)" subtitle={`${projects.length} total`} />
        <MetricCard icon={Lightbulb} label="Research Ideas" value={activeIdeas} color="var(--gold)" subtitle={`${ideas.length} total`} />
        <MetricCard icon={FileText} label="Pending Tasks" value={pendingTasks} color="var(--ink)" subtitle={`${tasks.length} total`} />
        <MetricCard icon={Users} label="Project Health" value={health?.healthy || 0} color="var(--green)" subtitle={`${health?.needs_attention || 0} attention · ${(health?.at_risk || 0) + (health?.critical || 0)} at risk`} />
      </div>

      {/* Task Velocity — completions per week, last 8 weeks */}
      <div className="mt-6 rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <h3 className="text-sm font-normal mb-4" style={{ color: 'var(--ink)' }}>Task Velocity</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={velocityWeeks} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="week" tick={{ fill: 'var(--slate)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--slate)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: 'var(--cream)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
                color: 'var(--ink)',
              }}
              labelStyle={{ color: 'var(--ink)', fontWeight: 500 }}
            />
            <Bar dataKey="completed" fill="var(--teal)" radius={[4, 4, 0, 0]} name="Completed" />
            <Bar dataKey="created" fill="var(--gold)" radius={[4, 4, 0, 0]} name="Created" opacity={0.6} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Team Performance */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completion by person — PI-only for psychological safety (SDT research) */}
        {isPi ? (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-normal" style={{ color: 'var(--ink)' }}>
                Team Task Overview
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--slate)', backgroundColor: 'var(--border-subtle)' }}>
                PI only
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {completionByPerson.map(({ slug, total, done, overdue, rate }) => {
                const person = getPersonInfo(slug)
                return (
                  <div key={slug} className="flex items-center gap-3">
                    <div style={{ width: 28, height: 28 }}>
                      <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="base-sm" variant="ice" />
                    </div>
                    <span className="text-sm w-28 truncate" style={{ color: 'var(--ink)' }}>
                      {person.name}
                    </span>
                    {/* Progress bar */}
                    <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, backgroundColor: rate > 70 ? 'var(--green)' : rate > 40 ? 'var(--gold)' : 'var(--maroon)' }} />
                    </div>
                    <span className="text-[11px] w-16 text-right" style={{ color: 'var(--slate)' }}>
                      {done}/{total}
                    </span>
                    {overdue > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--maroon)', backgroundColor: 'var(--maroon-hover)' }}>
                        {overdue} overdue
                      </span>
                    )}
                  </div>
                )
              })}
              {completionByPerson.length === 0 && (
                <p className="text-center py-6 text-sm" style={{ color: 'var(--muted)' }}>No task data yet</p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
            <h3 className="text-sm font-normal mb-4" style={{ color: 'var(--ink)' }}>
              Lab Progress This Week
            </h3>
            <div className="text-center py-6">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-3xl font-bold" style={{ color: 'var(--teal)' }}>
                  {tasks.filter(t => t.completed_at && t.completed_at >= new Date(Date.now() - 7 * 86400000).toISOString()).length}
                </span>
                <span className="text-sm" style={{ color: 'var(--slate)' }}>tasks completed</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {pendingTasks} still pending across the lab
              </p>
            </div>
            <div className="text-center pt-3 mt-3" style={{ borderTop: '1px dashed rgba(201,168,76,0.15)' }}>
              <p style={{ fontSize: 'var(--value-size)', color: 'var(--muted)' }}>
                Individual performance metrics are visible to PIs only
              </p>
            </div>
          </div>
        )}

        {/* Projects by stage */}
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-normal mb-4" style={{ color: 'var(--ink)' }}>
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
                'Writing': 'var(--orange)',
                'Review': 'var(--maroon)',
                'Published': 'var(--green)',
              }
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className="text-xs w-28" style={{ color: 'var(--ink)' }}>{stage}</span>
                  <div className="flex-1 h-5 rounded overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)' }}>
                    <div className="h-full rounded transition-all flex items-center px-2" style={{ width: `${width}%`, backgroundColor: stageColors[stage] || 'var(--teal)', minWidth: 24 }}>
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--ink-bright, #fff)' }}>{count}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Priority distribution */}
          <h4 className="text-xs font-semibold mt-6 mb-3" style={{ color: 'var(--ink)' }}>
            Active Task Priority
          </h4>
          <div className="flex items-center gap-3">
            {(['urgent', 'high', 'medium', 'low'] as const).map((p) => {
              const count = tasksByPriority.get(p) || 0
              return (
                <div key={p} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: PRIORITY_COLORS[p] }} />
                  <span className="text-xs capitalize" style={{ color: 'var(--ink)' }}>{p}</span>
                  <span className="text-xs font-semibold" style={{ color: PRIORITY_COLORS[p] }}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Task Age Distribution + Workload */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task age histogram */}
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-normal mb-4" style={{ color: 'var(--ink)' }}>Task Age Distribution</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={taskAgeBuckets} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--slate)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--slate)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--cream)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 12,
                  color: 'var(--ink)',
                }}
                labelStyle={{ color: 'var(--ink)', fontWeight: 500 }}
                formatter={(value) => [value, 'Tasks']}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Tasks">
                {taskAgeBuckets.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] mt-3" style={{ color: 'var(--muted)' }}>
            {tasks.filter(t => !t.completed && t.created_at && (new Date().getTime() - new Date(t.created_at).getTime()) > 28 * 86400000).length} tasks older than 4 weeks
          </p>
        </div>

        {/* Workload distribution */}
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-normal mb-4" style={{ color: 'var(--ink)' }}>Workload Distribution</h3>
          {(() => {
            const active = tasks.filter(t => !t.completed)
            const byPerson = new Map<string, number>()
            for (const t of active) {
              byPerson.set(t.assignee, (byPerson.get(t.assignee) || 0) + 1)
            }
            const sorted = [...byPerson.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
            const max = sorted[0]?.[1] || 1
            return (
              <div className="flex flex-col gap-2">
                {sorted.map(([slug, count]) => {
                  const person = getPersonInfo(slug)
                  return (
                    <div key={slug} className="flex items-center gap-2">
                      <div style={{ width: 22, height: 22 }}>
                        <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm-plus" variant="ice" />
                      </div>
                      <span className="text-[11px] w-20 truncate" style={{ color: 'var(--ink)' }}>{person.name.split(' ')[0]}</span>
                      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${(count / max) * 100}%`,
                          backgroundColor: count > 8 ? 'var(--maroon)' : count > 5 ? 'var(--gold)' : 'var(--teal)',
                          transition: 'width 300ms ease',
                        }} />
                      </div>
                      <span className="text-[10px] w-6 text-right font-medium" style={{ color: count > 8 ? 'var(--maroon)' : 'var(--slate)' }}>{count}</span>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Cross-Project Resource Heatmap — PI only */}
      {isPi && workloadHeatmap.members.length > 0 && (
        <div className="mt-6 rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-normal" style={{ color: 'var(--ink)' }}>Team Workload Forecast</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--slate)', backgroundColor: 'var(--border-subtle)' }}>
              PI only
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(4, 1fr)', gap: 2 }}>
            {/* Header row */}
            <div />
            {workloadHeatmap.weeks.map((w, i) => (
              <div key={i} className="text-center text-[10px] uppercase tracking-wider pb-2" style={{ color: 'var(--slate)', opacity: 0.6 }}>
                {w.label}
              </div>
            ))}
            {/* Member rows */}
            {workloadHeatmap.members.map(({ slug, counts }) => {
              const person = getPersonInfo(slug)
              return (
                <div key={slug} style={{ display: 'contents' }}>
                  <div className="flex items-center gap-2 pr-2" style={{ height: 36 }}>
                    <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm-plus" variant="ice" />
                    <span className="text-[11px] truncate" style={{ color: 'var(--ink)' }}>{person.name.split(' ')[0]}</span>
                  </div>
                  {counts.map((count, wi) => {
                    const bg = count === 0 ? 'var(--border-subtle)'
                      : count <= 2 ? 'rgba(22, 163, 74, 0.2)'
                      : count <= 5 ? 'rgba(201, 168, 76, 0.25)'
                      : 'rgba(122, 0, 25, 0.25)'
                    const fg = count === 0 ? 'var(--slate)'
                      : count <= 2 ? 'var(--green)'
                      : count <= 5 ? 'var(--gold)'
                      : 'var(--maroon)'
                    return (
                      <div
                        key={wi}
                        className="flex items-center justify-center rounded"
                        style={{
                          background: bg,
                          height: 36,
                          fontSize: '13px',
                          fontWeight: count > 5 ? 600 : 500,
                          color: fg,
                          opacity: count === 0 ? 0.4 : 1,
                          transition: 'background 200ms ease',
                        }}
                      >
                        {count}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-2" style={{ borderTop: '1px dashed rgba(201,168,76,0.15)' }}>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(22, 163, 74, 0.2)' }} />
              <span className="text-[10px]" style={{ color: 'var(--slate)' }}>0-2 tasks</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(201, 168, 76, 0.25)' }} />
              <span className="text-[10px]" style={{ color: 'var(--slate)' }}>3-5 tasks</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(122, 0, 25, 0.25)' }} />
              <span className="text-[10px]" style={{ color: 'var(--slate)' }}>6+ tasks</span>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
