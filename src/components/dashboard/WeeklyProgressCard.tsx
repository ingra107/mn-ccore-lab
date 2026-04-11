import { useMemo } from 'react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
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

  return (
    <BentoCard title="Weekly Progress" subtitle={`${totalCompleted} tasks completed`}>
      <ResponsiveContainer width="100%" height={64}>
        <BarChart data={bars} barCategoryGap="15%">
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--slate)', fontSize: 8 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--cream)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: 11,
              color: 'var(--ink)',
            }}
            labelStyle={{ color: 'var(--ink)', fontWeight: 500 }}
            formatter={(value) => [value, 'Completed']}
          />
          <Bar dataKey="count" radius={[2, 2, 0, 0]} name="Completed">
            {bars.map((bar, index) => (
              <Cell
                key={index}
                fill={bar.isToday ? 'var(--teal)' : bar.count > 0 ? 'rgba(45,138,138,0.4)' : 'var(--border-subtle)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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
