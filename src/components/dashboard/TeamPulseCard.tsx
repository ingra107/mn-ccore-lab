import { memo, useMemo } from 'react'
import { Users } from 'lucide-react'
import BentoCard from './BentoCard'
import { useTeamPulse } from '../../hooks/useApiData'
import { directors, getAllMembers } from '../../data/team'

function TeamPulseCard() {
  const { data } = useTeamPulse(48)

  const allMembers = useMemo(() => {
    const list: { name: string; initials: string; photoUrl?: string; slug: string }[] = []
    for (const d of directors) {
      if (d.slug) list.push({ name: d.name, initials: d.initials, photoUrl: d.photoUrl, slug: d.slug })
    }
    for (const m of getAllMembers()) {
      if (m.slug && !list.some(l => l.slug === m.slug)) {
        list.push({ name: m.name, initials: m.initials, photoUrl: m.photoUrl, slug: m.slug })
      }
    }
    return list
  }, [])

  const activeSet = useMemo(() => {
    const set = new Set<string>()
    for (const a of (data?.activity ?? [])) set.add(a.slug)
    return set
  }, [data])

  const activeThisWeek = data?.active_this_week ?? 0
  const totalMembers = allMembers.length
  const totalUpdates = data?.totals.updates ?? 0
  const totalCompletions = data?.totals.completions ?? 0
  const hasActivity = totalUpdates > 0 || totalCompletions > 0

  return (
    <BentoCard title="Team Pulse" subtitle="last 48 hours" size="span-2" icon={Users}>
      <div className="flex flex-col gap-3">
        {/* Headline */}
        <div className="flex items-center gap-2">
          <div
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: activeThisWeek > 0 ? 'var(--green-light)' : 'rgba(100, 116, 139, 0.3)',
              boxShadow: activeThisWeek > 0 ? '0 0 6px rgba(34, 197, 94, 0.4)' : 'none',
              flexShrink: 0,
              animation: activeThisWeek > 0 ? 'status-pulse 2s ease-in-out infinite' : 'none',
            }}
          />
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
            {activeThisWeek}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.7 }}>
            of {totalMembers} members active
          </span>
        </div>

        {/* Avatar row */}
        <div
          className="flex items-center gap-2"
          style={{ overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}
        >
          {allMembers.map((member) => (
            <MemberDot
              key={member.slug}
              name={member.name}
              initials={member.initials}
              photoUrl={member.photoUrl}
              isActive={activeSet.has(member.slug)}
            />
          ))}
        </div>

        {/* Activity summary */}
        <div className="flex items-center gap-4 pt-1" style={{ borderTop: '1px solid rgba(201, 168, 76, 0.08)' }}>
          {hasActivity ? (
            <>
              {totalUpdates > 0 && (
                <div className="flex items-center gap-1.5">
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal)' }}>
                    {totalUpdates}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
                    {totalUpdates === 1 ? 'project update' : 'project updates'}
                  </span>
                </div>
              )}
              {totalCompletions > 0 && (
                <div className="flex items-center gap-1.5">
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gold)' }}>
                    {totalCompletions}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
                    {totalCompletions === 1 ? 'task completed' : 'tasks completed'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.4 }}>
              No activity in the last 48 hours
            </span>
          )}
        </div>
      </div>
    </BentoCard>
  )
}

export default memo(TeamPulseCard)

function MemberDot({ name, initials, photoUrl, isActive }: {
  name: string; initials: string; photoUrl?: string; isActive: boolean
}) {
  return (
    <div className="relative flex-shrink-0" title={name} style={{ width: 32, height: 32 }}>
      <div
        style={{
          width: 32, height: 32, borderRadius: '50%', overflow: 'hidden',
          background: isActive ? 'rgba(34, 197, 94, 0.08)' : 'rgba(100, 116, 139, 0.08)',
          border: isActive ? '1.5px solid rgba(34, 197, 94, 0.35)' : '1.5px solid rgba(100, 116, 139, 0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.2s',
        }}
      >
        {photoUrl ? (
          <img src={photoUrl} alt={name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{
            fontSize: '10px', fontWeight: 700,
            color: isActive ? 'var(--green-light)' : 'var(--slate)', opacity: isActive ? 1 : 0.45,
          }}>
            {initials}
          </span>
        )}
      </div>
      <div style={{
        position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%',
        background: isActive ? 'var(--green-light)' : 'rgba(100, 116, 139, 0.25)',
        border: '1.5px solid var(--cream)',
        boxShadow: isActive ? '0 0 4px rgba(34, 197, 94, 0.5)' : 'none',
      }} />
    </div>
  )
}
