import { Activity } from 'lucide-react'
import { usePBHealth } from '../../hooks/useApiData'
import BentoCard from './BentoCard'

function formatAge(isoTimestamp: string | null): string {
  if (!isoTimestamp) return 'never'
  const diff = Date.now() - new Date(isoTimestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function SystemHealthMiniCard() {
  const { data: health, isLoading } = usePBHealth()

  // Determine health status
  let status: 'green' | 'amber' | 'red' = 'green'
  let label = 'System Healthy'
  let issues = 0

  if (health) {
    // Check sync freshness
    const syncAge = health.lastTaskSync
      ? (Date.now() - new Date(health.lastTaskSync).getTime()) / 60000
      : Infinity

    if (syncAge > 60) { issues++; status = 'amber' }
    if (syncAge > 360) { status = 'red' }

    // Check activity freshness
    const activityAge = health.lastActivityTimestamp
      ? (Date.now() - new Date(health.lastActivityTimestamp).getTime()) / 60000
      : Infinity

    if (activityAge > 120) { issues++ }

    if (issues > 0) {
      label = `${issues} issue${issues !== 1 ? 's' : ''}`
    }
  } else if (!isLoading) {
    status = 'red'
    label = 'Unavailable'
  }

  const statusColors: Record<string, string> = {
    green: 'var(--green-light)',
    amber: '#f59e0b',
    red: '#ef4444',
  }

  return (
    <BentoCard title="System Health" icon={Activity}>
      {isLoading ? (
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 rounded-full" style={{ background: 'var(--border-subtle)' }} />
          <div className="h-3 rounded flex-1" style={{ background: 'var(--border-subtle)', maxWidth: 100 }} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Status indicator row */}
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 'var(--radius-circle)',
                backgroundColor: statusColors[status],
                boxShadow: `0 0 8px ${statusColors[status]}40`,
                flexShrink: 0,
              }}
            />
            <span className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
              {label}
            </span>
          </div>

          {/* Details */}
          {health && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>
                  Last sync
                </span>
                <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                  {formatAge(health.lastTaskSync)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>
                  Active tasks
                </span>
                <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                  {health.tasks.active}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>
                  Active projects
                </span>
                <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                  {health.projects.active}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </BentoCard>
  )
}
