// JoinPage — where the public "Member Hub" tab sends someone who is signed in
// with a UMN account but is not a lab member yet (nav redesign, 2026-10-09).
// Nick: "if they are not a member it kindly instructs them about it." The
// steps, contact and "Request to join" are components/JoinSteps.tsx, the same
// copy RequireAuth's members-only wall shows.

import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePageMeta } from '../hooks/usePageMeta'
import { PATHS } from '../constants/paths'
import JoinSteps from '../components/JoinSteps'

export default function JoinPage() {
  usePageMeta('Join MN-CCORE · MN-CCORE', 'How to join the MN-CCORE lab and its Member Hub.')
  const { user, isAuthenticated } = useAuth()
  const email = user?.email ?? ''
  const name = user?.name ?? ''
  const isMember = isAuthenticated && user?.isMember

  return (
    <div className="content-container" style={{ paddingTop: '3rem', paddingBottom: '4rem', maxWidth: 720 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '2rem', color: 'var(--ink)', margin: 0 }}>
        Join the lab
      </h1>
      <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: 'var(--slate)', maxWidth: 560 }}>
        The Member Hub is where MN-CCORE members run their projects, meetings and tasks.
        {isAuthenticated && !isMember && email
          ? <> You are signed in as <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{email}</strong>, which is not on a lab project yet. Here is how to join.</>
          : <> Here is how to join.</>}
      </p>

      {isMember && (
        <p style={{ marginTop: 16, fontSize: 14 }}>
          You are already a member. <Link to={PATHS.dashboard} style={{ color: 'var(--teal)' }}>Go to Today</Link>
        </p>
      )}

      <div style={{ marginTop: '2rem' }}>
        <JoinSteps email={email} name={name} />
      </div>
    </div>
  )
}
