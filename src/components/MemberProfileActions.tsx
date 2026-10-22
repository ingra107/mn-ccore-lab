import { Link } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { ICON_PROPS } from '../lib/iconProps'
import { useAuth } from '../hooks/useAuth'

// The member page's "View Trajectory" button. It is a tool for signed-in
// members, so a signed-out visitor on the public /team/:slug does not see it
// (prod check 2026-10-11). The same component serves /portal/team/:slug, where
// the viewer is signed in. (The per-browser Watch button that sat beside it was
// retired 2026-10-22, PB #911: nothing ever read the list it kept.)
export default function MemberProfileActions({ slug, teamBase }: { slug: string; teamBase: string }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return null
  return (
    <div className="mb-6 flex flex-wrap gap-2" data-testid="member-profile-actions">
      <Link to={`${teamBase}/${slug}/trajectory`} className="tk-btn" style={{ textDecoration: 'none' }}>
        <TrendingUp {...ICON_PROPS} size={12} />
        View Trajectory
      </Link>
    </div>
  )
}
