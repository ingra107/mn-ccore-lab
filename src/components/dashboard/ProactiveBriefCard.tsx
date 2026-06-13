import { Lightbulb } from 'lucide-react'
import { useProactiveBrief } from '../../hooks/useApiData'
import BentoCard from './BentoCard'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'

interface ProactiveBriefData {
  bullets: string[]
  overdue_count: number
  due_today_count: number
  suggested_focus: {
    id: string
    title: string
    project?: string
  } | null
}

export default function ProactiveBriefCard() {
  const { data, isLoading } = useProactiveBrief()

  const brief = data as ProactiveBriefData | undefined

  return (
    <BentoCard title="Your Brief" icon={Lightbulb} size="span-2">
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-3 rounded" style={{ background: 'var(--border-subtle)', width: `${50 + i * 12}%` }} />
          ))}
        </div>
      ) : !brief ? (
        <div className="flex items-center justify-center h-full">
          <span className="text-[12px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
            No briefing available
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Badges row */}
          <div className="flex items-center gap-2">
            {brief.overdue_count > 0 && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{
                  backgroundColor: 'rgba(122,0,25,0.1)',
                  color: 'var(--maroon)',
                }}
              >
                {brief.overdue_count} overdue
              </span>
            )}
            {brief.due_today_count > 0 && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{
                  backgroundColor: 'var(--gold-emphasis)',
                  color: 'var(--gold)',
                }}
              >
                {brief.due_today_count} due today
              </span>
            )}
          </div>

          {/* Bullet points */}
          {brief.bullets?.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: '1rem' }} className="flex flex-col gap-1.5">
              {brief.bullets.slice(0, 5).map((bullet, i) => (
                <li
                  key={i}
                  className="text-[12px]"
                  style={{
                    color: 'var(--ink)',
                    lineHeight: 1.5,
                    opacity: 0.85,
                  }}
                >
                  {bullet}
                </li>
              ))}
            </ul>
          )}

          {/* Suggested focus */}
          {brief.suggested_focus && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg mt-1"
              style={{
                background: 'var(--teal-hover)',
                border: '1px solid rgba(45,138,138,0.15)',
              }}
            >
              <Lightbulb {...ICON_PROPS} size={12} style={{ color: 'var(--teal)', flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-medium" style={{ color: 'var(--teal)' }}>
                  Suggested focus
                </span>
                <p className="text-[12px] truncate" style={{ color: 'var(--ink)', margin: 0, marginTop: 1 }}>
                  {brief.suggested_focus.title}
                </p>
              </div>
              <a
                href={`${PATHS.myTasks}?id=${brief.suggested_focus.id}`}
                className="text-[10px] px-2 py-1 rounded-md font-medium flex-shrink-0"
                style={{
                  color: 'var(--teal)',
                  background: 'var(--teal-active)',
                  textDecoration: 'none',
                }}
              >
                Start
              </a>
            </div>
          )}
        </div>
      )}
    </BentoCard>
  )
}
