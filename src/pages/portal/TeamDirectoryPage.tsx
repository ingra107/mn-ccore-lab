// TeamDirectoryPage — /portal/team, the signed-in team roster (F7, 2026-10-09).
//
// The sidebar's "Team" item and Settings' "Team Directory" shortcut used to
// point at the public marketing roster (/team, Layout chrome, static
// data/team.ts), which dropped a signed-in member out of the portal. Only
// /portal/team/:slug existed inside the portal. This is the index for it:
// the live team_members rows from /api/team, each linking to the in-portal
// member page.

import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import QueryState from '../../components/QueryState'
import { useTeam } from '../../hooks/useApiData'
import { usePageMeta } from '../../hooks/usePageMeta'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'

export default function TeamDirectoryPage() {
  usePageMeta('Team · MN-CCORE', 'Everyone on the MN-CCORE team.')
  const teamQuery = useTeam()
  const members = [...(teamQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="content-container">
      <PageHeader
        icon={<Users {...ICON_PROPS} size={20} />}
        title="Team"
        subtitle="Everyone on the MN-CCORE team"
        count={members.length || undefined}
      />
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
                <span
                  aria-hidden
                  style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 600, overflow: 'hidden',
                    background: 'var(--surface-2)', color: 'var(--slate)',
                  }}
                >
                  {m.photoUrl
                    ? <img src={m.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : m.initials}
                </span>
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
