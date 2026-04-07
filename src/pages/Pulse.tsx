import { useState, useEffect, useMemo } from 'react'
import { useStats, useTasks, useProjects, useActivity, useProjectHealth } from '../hooks/useApiData'
import { useGrantTimeline } from '../hooks/useGrantTimeline'
import { getPersonInfo } from '../data/team'
import { formatShortDate } from '../lib/dateUtils'
import { formatBrandName } from '../components/BrandName'

/**
 * Lab Pulse — ambient kiosk display for conference room TVs.
 * Auto-rotates between cards every 8 seconds.
 * No sidebar, no nav, no interaction needed.
 * Access via /pulse or /pulse?kiosk=true for fullscreen.
 */

const ROTATE_INTERVAL = 8000

export default function Pulse() {
  const [activeCard, setActiveCard] = useState(0)

  const { data: stats } = useStats()
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: activity = [] } = useActivity(5)
  const { data: healthData } = useProjectHealth()
  const { data: grants = [] } = useGrantTimeline()

  const pendingTasks = tasks.filter((t) => !t.completed)
  const overdueTasks = pendingTasks.filter((t) => t.due_date && new Date(t.due_date + 'T23:59:59') < new Date())
  const activeProjects = projects.filter((p) => p.status === 'Active').length
  const health = healthData?.summary

  const cards = useMemo(() => {
    const c: { title: string; content: React.ReactNode }[] = []

    // Card 1: Lab at a Glance
    c.push({
      title: 'Lab at a Glance',
      content: (
        <div className="grid grid-cols-2 gap-8">
          <PulseStat label="Team Members" value={stats?.teamSize || 17} />
          <PulseStat label="Active Projects" value={activeProjects} />
          <PulseStat label="Publications" value={stats?.publicationCount || 63} />
          <PulseStat label="Total Citations" value="2,626+" />
        </div>
      ),
    })

    // Card 2: Task Overview
    c.push({
      title: 'Task Overview',
      content: (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-8">
            <PulseStat label="Active Tasks" value={pendingTasks.length} color="var(--teal)" />
            <PulseStat label="Overdue" value={overdueTasks.length} color={overdueTasks.length > 0 ? 'var(--maroon)' : 'var(--slate)'} />
            <PulseStat label="Completed" value={tasks.length - pendingTasks.length} color="var(--green)" />
          </div>
          <div className="flex flex-col gap-2">
            {pendingTasks.slice(0, 4).map((t) => {
              const person = getPersonInfo(t.assignee)
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  <span className="text-lg" style={{ color: 'var(--cream)' }}>
                    {formatBrandName(t.title || t.description)}
                  </span>
                  <span className="ml-auto text-sm" style={{ color: 'var(--gold)', opacity: 0.6 }}>
                    {person.name.split(' ')[0]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ),
    })

    // Card 3: Project Health
    if (health) {
      c.push({
        title: 'Project Health',
        content: (
          <div className="flex items-center justify-center gap-16">
            <PulseHealthDot color="#16a34a" label="Healthy" count={health.healthy} />
            <PulseHealthDot color="#c9a84c" label="Attention" count={health.needs_attention} />
            <PulseHealthDot color="#c2410c" label="At Risk" count={health.at_risk} />
            <PulseHealthDot color="#7a0019" label="Critical" count={health.critical} />
          </div>
        ),
      })
    }

    // Card 4: Grant Portfolio
    if (grants.length > 0) {
      c.push({
        title: 'Grant Portfolio',
        content: (
          <div className="flex flex-col gap-3">
            {grants.slice(0, 5).map((g, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <span className="text-sm font-semibold px-3 py-1 rounded" style={{ color: 'white', backgroundColor: g.proposed ? 'var(--gold)' : 'var(--teal)' }}>
                  {g.mechanism}
                </span>
                <span className="text-lg" style={{ color: 'var(--cream)' }}>{g.title}</span>
                <span className="ml-auto text-sm" style={{ color: g.proposed ? 'var(--gold)' : 'var(--teal)' }}>
                  {g.proposed ? 'Pending' : 'Active'}
                </span>
              </div>
            ))}
          </div>
        ),
      })
    }

    // Card 5: Upcoming Deadlines
    const deadlines = pendingTasks.filter((t) => t.due_date).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 5)
    if (deadlines.length > 0) {
      c.push({
        title: 'Upcoming Deadlines',
        content: (
          <div className="flex flex-col gap-3">
            {deadlines.map((t) => (
              <div key={t.id} className="flex items-center gap-4 px-4 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <span className="text-sm font-semibold px-3 py-1 rounded" style={{ color: 'white', backgroundColor: overdueTasks.includes(t) ? 'var(--maroon)' : 'var(--teal)' }}>
                  {formatShortDate(t.due_date!)}
                </span>
                <span className="text-lg" style={{ color: 'var(--cream)' }}>
                  {formatBrandName(t.title || t.description)}
                </span>
              </div>
            ))}
          </div>
        ),
      })
    }

    // Card 6: Recent Activity
    if (activity.length > 0) {
      c.push({
        title: 'Recent Activity',
        content: (
          <div className="flex flex-col gap-3">
            {activity.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--gold)', opacity: 0.6 }} />
                <span className="text-lg" style={{ color: 'var(--cream)' }}>
                  {formatBrandName(a.description)}
                </span>
              </div>
            ))}
          </div>
        ),
      })
    }

    return c
  }, [stats, pendingTasks, overdueTasks, tasks, health, grants, activity, activeProjects])

  // Auto-rotate
  useEffect(() => {
    if (cards.length <= 1) return
    const timer = setInterval(() => {
      setActiveCard((prev) => (prev + 1) % cards.length)
    }, ROTATE_INTERVAL)
    return () => clearInterval(timer)
  }, [cards.length])

  const currentCard = cards[activeCard] || cards[0]

  return (
    <div className="fixed inset-0 flex flex-col" style={{ backgroundColor: 'var(--ink)', color: 'var(--cream)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-12 py-6">
        <div className="flex items-center gap-4">
          <img src="/logos/mnccore-logo-mark.svg" alt="" style={{ width: 48, height: 48 }} />
          <img src="/logos/mnccore-logo-primary.svg" alt="MN-CCORE" style={{ height: 32, filter: 'brightness(2)' }} />
        </div>
        <span className="text-sm" style={{ color: 'var(--gold)', opacity: 0.5 }}>
          Lab Pulse
        </span>
      </div>

      {/* Card content */}
      <div className="flex-1 flex flex-col items-center justify-center px-12 pb-12">
        <h2 className="text-3xl font-medium mb-8" style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}>
          {currentCard?.title}
        </h2>
        <div className="w-full max-w-4xl">
          {currentCard?.content}
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pb-8">
        {cards.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveCard(i)}
            className="transition-all"
            style={{
              width: i === activeCard ? 24 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: i === activeCard ? 'var(--gold)' : 'rgba(201,168,76,0.2)',
              border: 'none',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function PulseStat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="text-center">
      <div className="text-5xl font-bold" style={{ fontFamily: 'var(--font-display)', color: color || 'var(--cream)' }}>
        {value}
      </div>
      <div className="text-sm mt-2" style={{ color: 'var(--gold)', opacity: 0.5 }}>
        {label}
      </div>
    </div>
  )
}

function PulseHealthDot({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-16 h-16 rounded-full" style={{ backgroundColor: color }} />
      <div className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--cream)' }}>{count}</div>
      <div className="text-sm" style={{ color: 'var(--gold)', opacity: 0.5 }}>{label}</div>
    </div>
  )
}
