import { useMemo } from 'react'
import { Timer } from 'lucide-react'
import { usePBSessionStats } from '../../hooks/useApiData'
import BentoCard from './BentoCard'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function PomodoroStatsCard() {
  const { data: stats, isLoading } = usePBSessionStats()

  const { weekHours, bars, streak, topProject } = useMemo(() => {
    if (!stats) return { weekHours: 0, bars: [], streak: 0, topProject: null }

    // Focus hours this week
    const hours = Math.round((stats.per_day
      ?.filter(d => {
        const date = new Date(d.day + 'T12:00:00')
        const now = new Date()
        const weekAgo = new Date(now.getTime() - 7 * 86400000)
        return date >= weekAgo
      })
      .reduce((sum, d) => sum + d.total_minutes, 0) ?? 0) / 60 * 10) / 10

    // 7-day bar data
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayBars: { label: string; minutes: number; isToday: boolean }[] = []

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const dayData = stats.per_day?.find(pd => pd.day === dateStr)
      dayBars.push({
        label: DAY_LABELS[d.getDay()],
        minutes: dayData?.total_minutes ?? 0,
        isToday: i === 0,
      })
    }

    // Current streak: consecutive days (from today backward) with >= 1 session
    let currentStreak = 0
    for (let i = dayBars.length - 1; i >= 0; i--) {
      if (dayBars[i].minutes > 0) currentStreak++
      else break
    }

    // Top project by total focus time
    const top = stats.per_project
      ?.slice()
      .sort((a, b) => b.total_minutes - a.total_minutes)[0] ?? null

    return { weekHours: hours, bars: dayBars, streak: currentStreak, topProject: top }
  }, [stats])

  const maxMinutes = Math.max(...bars.map(b => b.minutes), 1)

  return (
    <BentoCard title="Focus Time" icon={Timer} subtitle={isLoading ? 'Loading...' : `${weekHours}h this week`}>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-3 rounded" style={{ background: 'var(--border-subtle)', width: `${60 + i * 10}%` }} />
          ))}
        </div>
      ) : (
        <>
          {/* 7-day bar chart */}
          <div className="flex items-end gap-1.5" style={{ height: 56 }}>
            {bars.map((bar, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-sm transition-all"
                  style={{
                    height: `${Math.max((bar.minutes / maxMinutes) * 40, bar.minutes > 0 ? 4 : 2)}px`,
                    backgroundColor: bar.isToday
                      ? 'var(--teal)'
                      : bar.minutes > 0
                        ? 'rgba(45,138,138,0.4)'
                        : 'var(--border-subtle)',
                    minHeight: 2,
                  }}
                />
                <span
                  className="text-[8px]"
                  style={{
                    color: bar.isToday ? 'var(--teal)' : 'var(--slate)',
                    opacity: bar.isToday ? 1 : 0.5,
                  }}
                >
                  {bar.label}
                </span>
              </div>
            ))}
          </div>

          {/* Streak + top project */}
          <div className="flex items-center justify-between mt-2">
            {streak > 0 && (
              <span className="text-[10px]" style={{ color: 'var(--teal)', opacity: 0.8 }}>
                {streak}-day streak
              </span>
            )}
            {topProject && (
              <span className="text-[10px] truncate" style={{ color: 'var(--slate)', opacity: 0.6, maxWidth: '60%' }}>
                Top: {topProject.project_name}
              </span>
            )}
          </div>
        </>
      )}
    </BentoCard>
  )
}
