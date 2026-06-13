import { memo } from 'react'
import { Users, FlaskConical, FileText, Award } from 'lucide-react'
import { useCountUp } from '../../hooks/useCountUp'
import BentoCard from './BentoCard'
import { usePublications, useProjects, useTeam, useCitations } from '../../hooks/useApiData'
import { useDashboardMounted } from '../../pages/Dashboard'
import { isProjectActive } from '../../lib/taskConstants'
import type { LucideIcon } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'

interface StatItem {
  icon: LucideIcon
  value: number
  label: string
  suffix?: string
  /**
   * If set, overrides the rendered number. Used by the citations stat to
   * show "—" when no scholarly fetch has run yet — useCountUp would render
   * "0" otherwise, which reads as a real number.
   */
  displayOverride?: string
  /**
   * Native title attribute for hover hint. Used by the citations stat to
   * explain "—" or surface freshness info.
   */
  tooltip?: string
}

function MiniStat({ icon: Icon, value, label, suffix = '', delay, displayOverride, tooltip }: StatItem & { delay: number }) {
  const { count, ref } = useCountUp(value, 1800 + delay)
  const display = displayOverride ?? `${count}${suffix}`

  return (
    <div ref={ref} className="flex items-center gap-2.5 py-2" title={tooltip}>
      <div
        style={{
          // N1b de-box: was a --gold-active icon box per mini-stat. Dropped
          // bg+radius — gold glyph floats; fixed slot keeps value alignment.
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon {...ICON_PROPS} size={18} style={{ color: 'var(--gold)' }} />
      </div>
      <div>
        <div
          style={{
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--ink)',
            lineHeight: 1.1,
          }}
        >
          {display}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--muted)',
            lineHeight: 1.2,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  )
}

// "Updated 3 days ago" / "Updated 2 weeks ago" / "Updated just now".
// Resolution: hours / days / weeks. Returns null for unparseable input
// or "in the future" timestamps (clock-skew defense).
function formatRelativeRefresh(iso: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const diffMs = Date.now() - t
  if (diffMs < 0) return null
  const hours = diffMs / (1000 * 60 * 60)
  if (hours < 1) return 'Updated just now'
  if (hours < 24) {
    const h = Math.floor(hours)
    return `Updated ${h} hour${h === 1 ? '' : 's'} ago`
  }
  const days = Math.floor(hours / 24)
  if (days < 14) return `Updated ${days} day${days === 1 ? '' : 's'} ago`
  const weeks = Math.floor(days / 7)
  return `Updated ${weeks} week${weeks === 1 ? '' : 's'} ago`
}

const STALE_AFTER_DAYS = 14

function StatsCard() {
  const mounted = useDashboardMounted()
  const { data: publications = [] } = usePublications(undefined, { enabled: mounted })
  const { data: projects = [] } = useProjects(undefined, { enabled: mounted })
  const { data: team = [] } = useTeam({ enabled: mounted })
  const { data: citations, isLoading: citationsLoading } = useCitations({ enabled: mounted })

  const teamSize = team.length
  const activeProjects = projects.filter((p) => isProjectActive(p.status)).length
  const inReview = publications.filter((p) => p.status === 'In Review').length

  // Citations rendering rules (LO-1 / D2-followup):
  //   1. Loading -> show "…"; do NOT render 0 (would read as "no citations").
  //   2. members_with_data === 0 (no scholarly fetch ever) -> "—" + tooltip.
  //   3. Stale > 14d -> add "Updated N weeks ago" subtitle on BentoCard.
  let citationDisplay: string | undefined
  let citationTooltip: string | undefined
  let citationCountValue = 0
  let staleSubtitle: string | undefined

  if (citationsLoading || !mounted) {
    citationDisplay = '…'
  } else if (!citations || citations.members_with_data === 0) {
    citationDisplay = '—'
    citationTooltip = 'Citations collected weekly via Google Scholar. No data yet.'
  } else {
    citationCountValue = citations.total
    const refreshLabel = formatRelativeRefresh(citations.last_refresh)
    if (refreshLabel) {
      const refreshedAt = citations.last_refresh ? Date.parse(citations.last_refresh) : NaN
      const ageDays = Number.isNaN(refreshedAt) ? 0 : (Date.now() - refreshedAt) / (1000 * 60 * 60 * 24)
      if (ageDays > STALE_AFTER_DAYS) {
        staleSubtitle = refreshLabel
        citationTooltip = `${refreshLabel} — Google Scholar weekly cron may be lagging.`
      }
    }
  }

  const stats: StatItem[] = [
    { icon: Users, value: teamSize, label: 'Team members' },
    { icon: FlaskConical, value: activeProjects, label: 'Active projects' },
    { icon: FileText, value: inReview, label: 'Papers in review' },
    {
      icon: Award,
      value: citationCountValue,
      label: 'Total citations',
      suffix: '+',
      displayOverride: citationDisplay,
      tooltip: citationTooltip,
    },
  ]

  return (
    <BentoCard title="At a Glance" size="span-1" subtitle={staleSubtitle}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {stats.map((stat, i) => (
          <MiniStat key={stat.label} {...stat} delay={i * 120} />
        ))}
      </div>
    </BentoCard>
  )
}

export default memo(StatsCard)
