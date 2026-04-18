import { useMemo, useState } from 'react'
import { Timer } from 'lucide-react'
import { usePBSessionStats } from '../../hooks/useApiData'
import BentoCard from './BentoCard'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface FocusBarDatum { label: string; minutes: number; isToday: boolean }

function FocusBarChart({ bars }: { bars: FocusBarDatum[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(...bars.map(b => b.minutes), 1)
  const chartH = 44
  const labelH = 14
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
          const barH = Math.max((bar.minutes / max) * chartH, bar.minutes > 0 ? 3 : 1)
          const x = i * (barW + gap)
          const y = chartH - barH
          const fill = bar.isToday
            ? 'var(--teal)'
            : bar.minutes > 0
              ? 'rgba(45,138,138,0.4)'
              : 'var(--border-subtle)'
          return (
            <g key={i}>
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
          {bars[hovered].minutes} min
        </div>
      )}
    </div>
  )
}

export default function PomodoroStatsCard() {
  const { data: stats, isLoading } = usePBSessionStats()

  const { weekHours, bars, streak, topProject } = useMemo(() => {
    if (!stats) return { weekHours: 0, bars: [] as FocusBarDatum[], streak: 0, topProject: null }

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
    const dayBars: FocusBarDatum[] = []

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
          {/* 7-day bar chart — lightweight SVG, no recharts */}
          <FocusBarChart bars={bars} />

          {/* Streak + top project */}
          <div className="flex items-center justify-between mt-2">
            {streak > 0 && (
              <span className="text-[10px]" style={{ color: 'var(--teal)', opacity: 0.8 }}>
                {streak}-day streak
              </span>
            )}
            {topProject && (
              <span className="text-[10px] truncate" style={{ color: 'var(--slate)', opacity: 0.75, maxWidth: '60%' }}>
                Top: {topProject.project_name}
              </span>
            )}
          </div>
        </>
      )}
    </BentoCard>
  )
}
