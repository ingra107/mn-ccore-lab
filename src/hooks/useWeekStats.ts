import { useMemo } from 'react'
import { useTasks, useActivity } from './useApiData'
import { localDateKey } from '../lib/dateUtils'
import { countOverdue, countOverdueBefore } from '../lib/taskStats'
import { addDays, trailingMondays } from '../lib/isoWeek'

// The Pipeline tab's weekly numbers, on ISO Monday weeks throughout: the stat
// row for the selected week, its prior week, the 8-week sparklines and the
// 52-week velocity series. Analytics counted the stat row on Monday weeks but
// drew the velocity bars and sparklines on Sunday weeks; every window here
// starts on a Monday.

export interface VelocityWeek { week: string; completed: number; created: number }

export function useWeekStats(monday: Date) {
  const tasksQ = useTasks()
  const activityQ = useActivity(100)
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data])
  const activity = useMemo(() => activityQ.data ?? [], [activityQ.data])

  const weekStats = useMemo(() => {
    const start = monday
    const end = addDays(monday, 7)
    const priorStart = addDays(monday, -7)
    const startStr = start.toISOString()
    const endStr = end.toISOString()
    const priorStartStr = priorStart.toISOString()

    const completed = tasks.filter((t) => t.completed_at && t.completed_at >= startStr && t.completed_at < endStr).length
    const created = tasks.filter((t) => t.created_at >= startStr && t.created_at < endStr).length
    const overdue = countOverdue(tasks)
    const activityCount = activity.filter((a) => a.timestamp >= startStr && a.timestamp < endStr).length

    const completedPrior = tasks.filter((t) => t.completed_at && t.completed_at >= priorStartStr && t.completed_at < startStr).length
    const createdPrior = tasks.filter((t) => t.created_at >= priorStartStr && t.created_at < startStr).length
    const overduePrior = countOverdueBefore(tasks, localDateKey(start))
    const activityPrior = activity.filter((a) => a.timestamp >= priorStartStr && a.timestamp < startStr).length

    return { completed, created, overdue, activityCount, completedPrior, createdPrior, overduePrior, activityPrior }
  }, [tasks, activity, monday])

  // Completed and created per Monday week, oldest first, 52 weeks ending with this one.
  const velocityWeeks = useMemo<VelocityWeek[]>(() => trailingMondays(52).map((wStart) => {
    const wStartStr = wStart.toISOString()
    const wEndStr = addDays(wStart, 7).toISOString()
    return {
      week: wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      completed: tasks.filter((t) => t.completed_at && t.completed_at >= wStartStr && t.completed_at < wEndStr).length,
      created: tasks.filter((t) => t.created_at >= wStartStr && t.created_at < wEndStr).length,
    }
  }), [tasks])

  const spark8 = useMemo(() => velocityWeeks.slice(-8), [velocityWeeks])
  const sparkCompleted = useMemo(() => spark8.map((w) => w.completed), [spark8])
  const sparkCreated = useMemo(() => spark8.map((w) => w.created), [spark8])
  const sparkOverdue = useMemo(() => trailingMondays(8).map((m) => {
    const wEnd = addDays(m, 7)
    return countOverdueBefore(tasks, localDateKey(wEnd))
  }), [tasks])
  const sparkActivity = useMemo(() => trailingMondays(8).map((m) => {
    const s = m.toISOString()
    const e = addDays(m, 7).toISOString()
    return activity.filter((a) => a.timestamp >= s && a.timestamp < e).length
  }), [activity])

  return {
    tasks,
    activity,
    isLoading: tasksQ.isLoading,
    isError: tasksQ.isError,
    error: tasksQ.error,
    weekStats,
    velocityWeeks,
    sparkCompleted, sparkCreated, sparkOverdue, sparkActivity,
  }
}
