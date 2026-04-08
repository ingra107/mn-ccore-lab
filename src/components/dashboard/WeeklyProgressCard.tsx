import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import { useTasks } from '../../hooks/useApiData'
import BentoCard from './BentoCard'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function WeeklyProgressCard() {
  const { data: tasks = [] } = useTasks()

  const { bars, totalCompleted, trend } = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const days: { label: string; count: number; isToday: boolean }[] = []

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const count = tasks.filter(t =>
        t.completed && t.completed_at &&
        t.completed_at.startsWith(dateStr)
      ).length
      days.push({ label: DAY_LABELS[d.getDay()], count, isToday: i === 0 })
    }

    const total = days.reduce((s, d) => s + d.count, 0)
    const firstHalf = days.slice(0, 3).reduce((s, d) => s + d.count, 0)
    const secondHalf = days.slice(4).reduce((s, d) => s + d.count, 0)
    const trendDir = secondHalf > firstHalf ? 'up' : secondHalf < firstHalf ? 'down' : 'flat'

    return { bars: days, totalCompleted: total, trend: trendDir }
  }, [tasks])

  const max = Math.max(...bars.map(b => b.count), 1)

  return (
    <BentoCard title="Weekly Progress" subtitle={`${totalCompleted} tasks completed`}>
      <div className="flex items-end gap-1.5" style={{ height: 64 }}>
        {bars.map((bar, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height: `${Math.max((bar.count / max) * 48, bar.count > 0 ? 4 : 2)}px`,
                backgroundColor: bar.isToday
                  ? 'var(--teal)'
                  : bar.count > 0
                    ? 'rgba(45,138,138,0.4)'
                    : 'var(--border-subtle)',
                minHeight: 2,
              }}
            />
            <span className="text-[8px]" style={{ color: bar.isToday ? 'var(--teal)' : 'var(--slate)', opacity: bar.isToday ? 1 : 0.5 }}>
              {bar.label}
            </span>
          </div>
        ))}
      </div>
      {trend !== 'flat' && (
        <div className="flex items-center gap-1 mt-2">
          <TrendingUp size={10} style={{ color: trend === 'up' ? 'var(--green)' : 'var(--maroon)', transform: trend === 'down' ? 'scaleY(-1)' : undefined }} />
          <span className="text-[10px]" style={{ color: trend === 'up' ? 'var(--green)' : 'var(--maroon)', opacity: 0.7 }}>
            {trend === 'up' ? 'Trending up' : 'Slowing down'}
          </span>
        </div>
      )}
    </BentoCard>
  )
}
