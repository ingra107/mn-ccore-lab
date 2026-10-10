// TeamDirectoryPage — /portal/team, the signed-in team roster (F7, 2026-10-09).
//
// The sidebar's "Team" item and Settings' "Team Directory" shortcut used to
// point at the public marketing roster (/team, Layout chrome, static
// data/team.ts), which dropped a signed-in member out of the portal. Only
// /portal/team/:slug existed inside the portal. This is the index for it:
// the live team_members rows from /api/team, each linking to the in-portal
// member page.

import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Users, X } from 'lucide-react'
import Avatar from '../../components/Avatar'
import PageHeader from '../../components/PageHeader'
import QueryState from '../../components/QueryState'
import { useTeam, useExpertise } from '../../hooks/useApiData'
import { usePageMeta } from '../../hooks/usePageMeta'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'

export default function TeamDirectoryPage() {
  usePageMeta('Team · MN-CCORE', 'Everyone on the MN-CCORE team.')
  const teamQuery = useTeam()
  const allMembers = [...(teamQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name))

  // ?expertise=<tag>: the member page's expertise chips land here (F91), so a
  // signed-in member filters the roster without leaving the portal.
  const [params, setParams] = useSearchParams()
  const expertise = params.get('expertise') || ''
  const { data: allExpertise = [] } = useExpertise()
  const taggedSlugs = useMemo(() => {
    const want = expertise.toLowerCase()
    return new Set(allExpertise.filter((t) => t.tag.toLowerCase() === want).map((t) => t.member_slug))
  }, [allExpertise, expertise])
  const members = expertise ? allMembers.filter((m) => !!m.slug && taggedSlugs.has(m.slug)) : allMembers

  return (
    <div className="content-container">
      <PageHeader
        icon={<Users {...ICON_PROPS} size={20} />}
        title="Team"
        subtitle="Everyone on the MN-CCORE team"
        count={members.length || undefined}
      />
      {expertise && (
        <div style={{ marginBottom: 'var(--sp-md)' }}>
          <button
            type="button"
            onClick={() => setParams({})}
            className="inline-flex items-center gap-1 cursor-pointer"
            aria-label={`Clear expertise filter: ${expertise}`}
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius-full)',
              background: 'var(--teal-active)', color: 'var(--teal)',
              border: '1px solid var(--teal)',
            }}
          >
            {expertise}
            <X {...ICON_PROPS} size={10} />
          </button>
        </div>
      )}
      <QueryState
        isLoading={teamQuery.isLoading}
        isError={teamQuery.isError}
        isEmpty={members.length === 0}
        emptyTitle="No team members yet"
      >
        <ul
          style={{
            listStyle: 'none', margin: 0, padding: 0,
            display: 'grid', gap: 'var(--sp-sm)',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          }}
        >
          {members.map((m) => {
            const body = (
              <>
                <Avatar name={m.name} initials={m.initials} photoUrl={m.photoUrl} size="base-lg" slug={m.slug} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
                    {m.name}{m.credentials ? `, ${m.credentials}` : ''}
                  </span>
                  {m.role && (
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)' }}>{m.role}</span>
                  )}
                </span>
              </>
            )
            const rowStyle = {
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)',
              background: 'var(--surface-1)', textDecoration: 'none',
            } as const
            return (
              <li key={m.slug ?? m.name}>
                {m.slug
                  ? <Link to={PATHS.teamMember(m.slug)} style={rowStyle}>{body}</Link>
                  : <div style={rowStyle}>{body}</div>}
              </li>
            )
          })}
        </ul>
      </QueryState>
    </div>
  )
}
