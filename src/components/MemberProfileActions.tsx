import { Link } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { ICON_PROPS } from '../lib/iconProps'
import { useAuth } from '../hooks/useAuth'
import WatchButton from './WatchButton'

// The member page's "View Trajectory" and "Watch" buttons. They are tools for
// signed-in members (a watchlist is a member's own), so a signed-out visitor
// on the public /team/:slug sees neither (prod check 2026-10-11). The same
// component serves /portal/team/:slug, where the viewer is signed in.
export default function MemberProfileActions({ slug, teamBase, name }: { slug: string; teamBase: string; name: string }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return null
  return (
    <div className="mb-6 flex flex-wrap gap-2" data-testid="member-profile-actions">
      <Link
        to={`${teamBase}/${slug}/trajectory`}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium hov-border hov-color"
        style={{
          background: 'var(--sk-card)',
          color: 'var(--slate)',
          border: '1px solid transparent',
          textDecoration: 'none',
          transition: 'border-color var(--duration-normal) var(--ease-out), color var(--duration-normal) var(--ease-out)',
          '--hov-border': 'var(--job-accent)',
          '--hov-color': 'var(--job-accent)',
        } as React.CSSProperties}
      >
        <TrendingUp {...ICON_PROPS} size={12} />
        View Trajectory
      </Link>
      <WatchButton id={slug} type="person" label={name} slug={slug} />
    </div>
  )
}
