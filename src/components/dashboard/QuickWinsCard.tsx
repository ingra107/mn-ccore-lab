import { useMemo } from 'react'
import { Zap } from 'lucide-react'
import { useTasks } from '../../hooks/useApiData'
import { useAuth } from '../../hooks/useAuth'
import BentoCard from './BentoCard'

/**
 * "Quick Wins" — tasks that are close to done or low-effort.
 * Scoring: high priority + due soon + in_progress = easy win.
 */
export default function QuickWinsCard() {
  const { user } = useAuth()
  const slug = user?.email?.split('@')[0]?.toLowerCase() || ''
  const { data: tasks = [] } = useTasks()

  const quickWins = useMemo(() => {
    const now = new Date()
    const active = slug
      ? tasks.filter(t => !t.completed && t.assignee === slug)
      : tasks.filter(t => !t.completed)

    return active
      .map(t => {
        let score = 0
        // In progress = already started
        if (t.status === 'in_progress') score += 30
        // Due soon = urgency
        if (t.due_date) {
          const days = (new Date(t.due_date + 'T12:00:00').getTime() - now.getTime()) / 86400000
          if (days <= 1) score += 25
          else if (days <= 3) score += 15
          else if (days <= 7) score += 5
        }
        // Higher priority = more impactful to close
        const pScore: Record<string, number> = { urgent: 20, high: 15, medium: 5, low: 0 }
        score += pScore[t.priority] ?? 5
        // Has subtasks or description = well-defined
        if (t.description && t.description.length > 20) score += 5
        return { task: t, score }
      })
      .filter(t => t.score >= 20)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
  }, [tasks, slug])

  if (quickWins.length === 0) return null

  return (
    <BentoCard title="Quick Wins" subtitle="Tasks close to done">
      <div className="flex flex-col gap-2">
        {quickWins.map(({ task }) => (
            <div
              key={task.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
            >
              <Zap size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />
              <span className="text-[12px] truncate flex-1" style={{ color: 'var(--ink)' }}>
                {task.title || task.description}
              </span>
              {task.due_date && (
                <span className="text-[10px] flex-shrink-0" style={{
                  color: new Date(task.due_date + 'T23:59:59') < new Date() ? 'var(--maroon)' : 'var(--slate)',
                  opacity: 0.6,
                }}>
                  {task.due_date}
                </span>
              )}
            </div>
          ))}
      </div>
    </BentoCard>
  )
}
