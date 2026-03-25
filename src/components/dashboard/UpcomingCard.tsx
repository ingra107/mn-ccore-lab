import { Calendar, AlertCircle } from 'lucide-react'
import BentoCard from './BentoCard'

interface Deadline {
  date: string
  label: string
  type: 'grant' | 'milestone' | 'review'
  daysUntil: number
}

function generateDeadlines(): Deadline[] {
  // Generate plausible upcoming deadlines based on real grant/project data
  const deadlines: Deadline[] = [
    {
      date: formatDate(daysFromNow(12)),
      label: 'R01 ADHERE-LPV LOI due',
      type: 'grant',
      daysUntil: 12,
    },
    {
      date: formatDate(daysFromNow(28)),
      label: 'LPV Variation revision response',
      type: 'review',
      daysUntil: 28,
    },
    {
      date: formatDate(daysFromNow(45)),
      label: 'CLIF annual meeting abstract',
      type: 'milestone',
      daysUntil: 45,
    },
    {
      date: formatDate(daysFromNow(67)),
      label: 'K23 progress report',
      type: 'grant',
      daysUntil: 67,
    },
    {
      date: formatDate(daysFromNow(-3)),
      label: 'CCI-ARDS data freeze',
      type: 'milestone',
      daysUntil: -3,
    },
  ]

  return deadlines.sort((a, b) => a.daysUntil - b.daysUntil)
}

function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function typeColor(type: Deadline['type']): string {
  switch (type) {
    case 'grant': return '#c9a84c'
    case 'review': return '#2d8a8a'
    case 'milestone': return '#64748b'
  }
}

export default function UpcomingCard() {
  const deadlines = generateDeadlines()

  return (
    <BentoCard title="Upcoming" subtitle="Deadlines & milestones" size="span-1" icon={Calendar}>
      <div className="flex flex-col gap-1">
        {deadlines.map((d, i) => {
          const isUrgent = d.daysUntil >= 0 && d.daysUntil <= 30
          const isOverdue = d.daysUntil < 0

          return (
            <div
              key={i}
              className="flex items-start gap-2.5 py-2"
              style={{
                borderBottom: i < deadlines.length - 1
                  ? '1px solid rgba(201, 168, 76, 0.06)'
                  : 'none',
              }}
            >
              {/* Date badge */}
              <div
                className="flex-shrink-0 text-center"
                style={{
                  minWidth: '46px',
                  padding: '3px 6px',
                  borderRadius: '6px',
                  background: isOverdue
                    ? 'rgba(122, 0, 25, 0.1)'
                    : isUrgent
                      ? 'rgba(201, 168, 76, 0.12)'
                      : 'rgba(100, 116, 139, 0.06)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: isOverdue
                    ? 'var(--maroon)'
                    : isUrgent
                      ? 'var(--gold)'
                      : 'var(--slate)',
                  lineHeight: 1.3,
                }}
              >
                {d.date}
              </div>

              {/* Description */}
              <div className="flex-1 min-w-0">
                <p
                  className="flex items-center gap-1"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '12px',
                    color: 'var(--ink)',
                    margin: 0,
                    lineHeight: 1.3,
                  }}
                >
                  {isOverdue && (
                    <AlertCircle
                      size={11}
                      style={{
                        color: 'var(--maroon)',
                        flexShrink: 0,
                        animation: 'overdue-pulse 2s ease-in-out infinite',
                      }}
                    />
                  )}
                  {d.label}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: typeColor(d.type),
                      opacity: 0.6,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9px',
                      color: 'var(--slate)',
                      opacity: 0.5,
                      textTransform: 'capitalize',
                    }}
                  >
                    {d.type}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Overdue pulse animation */}
      <style>{`
        @keyframes overdue-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </BentoCard>
  )
}
