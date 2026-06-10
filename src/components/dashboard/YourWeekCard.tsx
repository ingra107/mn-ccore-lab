import { useMemo } from 'react'
import { CalendarDays, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { useTasks, useMeetingsApi } from '../../hooks/useApiData'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import { isOverdue } from '../../lib/dateUtils'
import { parseDbUtc } from '../../lib/time'
import BentoCard from './BentoCard'

export default function YourWeekCard() {
  const { user } = useAuth()
  const slug = emailToSlug(user?.email)
  const { data: tasks = [] } = useTasks()
  const { data: meetings = [] } = useMeetingsApi()

  const stats = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekEnd = new Date(today.getTime() + 7 * 86400000)
    const weekStart = new Date(today.getTime() - today.getDay() * 86400000) // start of this week (Sunday)

    const myTasks = slug ? tasks.filter(t => t.assignee === slug) : tasks

    const dueThisWeek = myTasks.filter(t =>
      !t.completed && t.due_date &&
      new Date(t.due_date + 'T12:00:00') >= today &&
      new Date(t.due_date + 'T12:00:00') < weekEnd
    ).length

    const overdue = myTasks.filter(t => !t.completed && isOverdue(t.due_date)).length

    const completedThisWeek = myTasks.filter(t =>
      t.completed && t.completed_at &&
      parseDbUtc(t.completed_at) >= weekStart
    ).length

    const meetingsThisWeek = meetings.filter(m =>
      m.date && new Date(m.date + 'T12:00:00') >= today &&
      new Date(m.date + 'T12:00:00') < weekEnd
    ).length

    return { dueThisWeek, overdue, completedThisWeek, meetingsThisWeek }
  }, [tasks, meetings, slug])

  const items = [
    { icon: CalendarDays, label: 'Due this week', value: stats.dueThisWeek, color: 'var(--teal)' },
    ...(stats.overdue > 0 ? [{ icon: AlertTriangle, label: 'Overdue', value: stats.overdue, color: 'var(--maroon)' }] : []),
    { icon: CheckCircle2, label: 'Done this week', value: stats.completedThisWeek, color: 'var(--green)' },
    { icon: Clock, label: 'Meetings', value: stats.meetingsThisWeek, color: 'var(--gold)' },
  ]

  return (
    <BentoCard title="Your Week" size="span-2">
      <div className="grid grid-cols-2 gap-3">
        {items.map(item => {
          const Icon = item.icon
          return (
            <div key={item.label} className="flex items-center gap-2">
              <Icon size={14} style={{ color: item.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: item.color, lineHeight: 1 }}>
                  {item.value}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75, marginTop: '2px' }}>
                  {item.label}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </BentoCard>
  )
}
