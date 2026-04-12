import { useMemo, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { useTasks } from '../../hooks/useApiData'
import BentoCard from './BentoCard'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface BarDatum { label: string; count: number; isToday: boolean }

function MiniBarChart({ bars }: { bars: BarDatum[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(...bars.map(b => b.count), 1)
  const chartH = 44 // px — bar area height (excludes label row)
  const labelH = 14 // px — label row height
  const totalH = chartH + labelH
  const barW = 10
  const gap = 4
  const totalW = bars.length * (barW + gap) - gap

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        width="100%"
        height={totalH}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {bars.map((bar, i) => {
          const barH = Math.max((bar.count / max) * chartH, bar.count > 0 ? 3 : 1)
          const x = i * (barW + gap)
          const y = chartH - barH
          const fill = bar.isToday
            ? 'var(--teal)'
            : bar.count > 0
              ? 'rgba(45,138,138,0.4)'
              : 'var(--border-subtle)'
          return (
            <g key={i}>
              {/* invisible full-height hit area for tooltip */}
              <rect
                x={x}
                y={0}
                width={barW}
                height={chartH}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'default' }}
              />
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={2}
                ry={2}
                fill={fill}
              />
              <text
                x={x + barW / 2}
                y={totalH - 1}
                textAnchor="middle"
                fontSize={7}
                fill="var(--slate)"
                opacity={0.7}
              >
                {bar.label}
              </text>
            </g>
          )
        })}
      </svg>
      {/* Tooltip */}
      {hovered !== null && (
        <div
          style={{
            position: 'absolute',
            bottom: labelH + 4,
            left: `${(hovered / (bars.length - 1)) * 80 + 5}%`,
            transform: 'translateX(-50%)',
            background: 'var(--cream, #1a2330)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md, 6px)',
            fontSize: 10,
            color: 'var(--ink)',
            padding: '2px 6px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <span style={{ fontWeight: 500 }}>{bars[hovered].label}</span>
          {': '}
          {bars[hovered].count} completed
        </div>
      )}
    </div>
  )
}

export default function WeeklyProgressCard() {
  const { data: tasks = [] } = useTasks()

  const { bars, totalCompleted, trend } = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const days: BarDatum[] = []

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
      <MiniBarChart bars={bars} />
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
