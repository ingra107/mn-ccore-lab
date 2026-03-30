import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, Calendar, Banknote, Diamond, ArrowRight } from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import MetricCard from '../../components/MetricCard'
import Avatar from '../../components/Avatar'
import { useGrantTimeline } from '../../hooks/useGrantTimeline'
import type { GrantTimelineItem } from '../../hooks/useGrantTimeline'
import { getPersonInfo } from '../../data/team'
import { formatMediumDate } from '../../lib/dateUtils'

function formatFunding(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  return `$${amount.toLocaleString()}`
}

function mechanismColor(mechanism: string): { bg: string; color: string } {
  switch (mechanism) {
    case 'R01': return { bg: 'rgba(45,138,138,0.1)', color: 'var(--teal)' }
    case 'K23': return { bg: 'rgba(45,138,138,0.1)', color: 'var(--teal)' }
    case 'R03': return { bg: 'rgba(122,0,25,0.1)', color: 'var(--maroon)' }
    default: return { bg: 'rgba(201,168,76,0.1)', color: 'var(--gold)' }
  }
}

export default function Grants() {
  const { data: grants = [], isLoading } = useGrantTimeline()

  const active = useMemo(() => grants.filter((g) => !g.proposed), [grants])
  const proposed = useMemo(() => grants.filter((g) => g.proposed), [grants])

  const totalFunding = useMemo(
    () => grants.reduce((sum, g) => sum + (g.total_funding || 0), 0),
    [grants]
  )

  const upcomingMilestones = useMemo(() => {
    const now = new Date().toISOString().slice(0, 10)
    return grants
      .flatMap((g) =>
        (g.milestones || [])
          .filter((m) => m.target_date >= now && m.status !== 'completed')
          .map((m) => ({ ...m, grantMechanism: g.mechanism, grantTitle: g.title }))
      )
      .sort((a, b) => a.target_date.localeCompare(b.target_date))
      .slice(0, 5)
  }, [grants])

  return (
    <div>
      <SectionHeader
        icon={Wallet}
        title="Grants & Funding"
        subtitle={`${active.length} active · ${proposed.length} proposed — track timelines and milestones`}
      />

      {/* Summary metrics */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={Wallet} label="Active Grants" value={active.length} color="var(--teal)" />
        <MetricCard icon={Wallet} label="Proposed" value={proposed.length} color="var(--gold)" />
        <MetricCard icon={Banknote} label="Total Funding" value={totalFunding > 0 ? formatFunding(totalFunding) : '-'} color="var(--teal)" />
        <MetricCard icon={Diamond} label="Upcoming Milestones" value={upcomingMilestones.length} color="var(--maroon)" />
      </div>

      {/* Upcoming milestones */}
      {upcomingMilestones.length > 0 && (
        <div className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
            Upcoming Milestones
          </h3>
          <div className="flex flex-col gap-1.5">
            {upcomingMilestones.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                <Diamond size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                <span className="flex-1 text-sm truncate" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
                  {m.title}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.08)' }}>
                  {m.grantMechanism}
                </span>
                <span className="text-[11px] flex-shrink-0 w-20 text-right" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.6 }}>
                  {formatMediumDate(m.target_date)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grant cards */}
      <div className="mt-5">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border p-5 animate-pulse" style={{ borderColor: 'var(--border-light)' }}>
                <div className="h-4 w-20 rounded" style={{ backgroundColor: 'var(--border-light)' }} />
                <div className="h-5 w-3/4 rounded mt-2" style={{ backgroundColor: 'var(--border-light)' }} />
                <div className="h-3 w-1/3 rounded mt-3" style={{ backgroundColor: 'var(--border-light)' }} />
              </div>
            ))}
          </div>
        ) : grants.length === 0 ? (
          <div className="text-center py-20">
            <div
              className="mx-auto mb-4"
              style={{ width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.08)' }}
            >
              <Wallet size={28} style={{ color: 'var(--teal)', opacity: 0.6 }} />
            </div>
            <p className="text-base font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
              No grants yet
            </p>
            <p className="text-sm mt-1.5 max-w-sm mx-auto" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
              Active and pending grants with timelines, milestones, and budget tracking will appear here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Active grants first, then proposed */}
            {[...active, ...proposed].map((grant) => (
              <GrantCard key={grant.id} grant={grant} />
            ))}
          </div>
        )}
      </div>

      {/* Link to full Gantt view */}
      {grants.length > 0 && (
        <div className="mt-4 text-center">
          <Link
            to="/grants"
            className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-80"
            style={{ fontFamily: 'var(--font-sans)', color: 'var(--teal)', textDecoration: 'none' }}
          >
            View full Gantt timeline
            <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  )
}

// ── Grant Card ──────────────────────────────────────────────

function GrantCard({ grant }: { grant: GrantTimelineItem }) {
  const pi = getPersonInfo(grant.pi)
  const mc = mechanismColor(grant.mechanism)
  const now = new Date().toISOString().slice(0, 10)

  // Progress percentage (how far through the grant period)
  let progress = 0
  if (grant.start_date && grant.end_date && !grant.proposed) {
    const start = new Date(grant.start_date).getTime()
    const end = new Date(grant.end_date).getTime()
    const current = Date.now()
    progress = Math.max(0, Math.min(100, ((current - start) / (end - start)) * 100))
  }

  const pendingMilestones = (grant.milestones || []).filter(
    (m) => m.target_date >= now && m.status !== 'completed'
  )

  return (
    <div
      className="rounded-xl border p-5 transition-all hover:shadow-sm"
      style={{ borderColor: 'var(--border-light)' }}
    >
      <div className="flex items-start gap-4">
        {/* Left: mechanism badge */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-lg"
            style={{ fontFamily: 'var(--font-mono)', backgroundColor: mc.bg, color: mc.color }}
          >
            {grant.mechanism}
          </span>
          {grant.proposed && (
            <span className="text-[8px] uppercase tracking-wider font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>
              Proposed
            </span>
          )}
        </div>

        {/* Center: content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold leading-tight" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
            {grant.title}
          </h4>

          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {/* PI */}
            <div className="flex items-center gap-1.5">
              <div style={{ width: 20, height: 20 }}>
                <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="sm" variant="ice" className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]" />
              </div>
              <span className="text-xs" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}>
                {pi.name}
              </span>
            </div>

            {/* Agency */}
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', backgroundColor: 'rgba(100,116,139,0.06)' }}>
              {grant.agency}
            </span>

            {/* Dates */}
            {(grant.start_date || grant.end_date) && (
              <span className="text-xs flex items-center gap-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.6 }}>
                <Calendar size={10} />
                {grant.start_date ? formatMediumDate(grant.start_date) : '?'}
                {' \u2013 '}
                {grant.end_date ? formatMediumDate(grant.end_date) : '?'}
              </span>
            )}

            {/* Funding */}
            {grant.total_funding ? (
              <span className="text-xs font-medium flex items-center gap-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>
                <Banknote size={10} />
                {formatFunding(grant.total_funding)}
              </span>
            ) : null}
          </div>

          {/* Progress bar (active grants only) */}
          {!grant.proposed && progress > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-light)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: progress > 80 ? 'var(--maroon)' : 'var(--teal)',
                  }}
                />
              </div>
              <span className="text-[10px] flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
                {Math.round(progress)}%
              </span>
            </div>
          )}

          {/* Upcoming milestones */}
          {pendingMilestones.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {pendingMilestones.slice(0, 3).map((m) => (
                <span
                  key={m.id}
                  className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)', backgroundColor: 'rgba(201,168,76,0.08)' }}
                >
                  <Diamond size={8} />
                  {m.title}
                  <span style={{ opacity: 0.5, marginLeft: 2 }}>{formatMediumDate(m.target_date)}</span>
                </span>
              ))}
              {pendingMilestones.length > 3 && (
                <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.4 }}>
                  +{pendingMilestones.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
