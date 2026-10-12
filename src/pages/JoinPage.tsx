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
import { PublicHead } from '../components/public/PublicParts'

export default function JoinPage() {
  usePageMeta('Join MN-CCORE · MN-CCORE', 'How to join the MN-CCORE lab and its Member Hub.')
  const { user, isAuthenticated } = useAuth()
  const email = user?.email ?? ''
  const name = user?.name ?? ''
  const isMember = isAuthenticated && user?.isMember

  return (
    <div className="content-container pub-foot" style={{ maxWidth: 760 }}>
      <PublicHead
        kicker="Join the lab"
        title={<>How to <em>join</em>.</>}
        small
        lede={
          <>
            The Member Hub is where MN-CCORE members run their projects, meetings and tasks.
            {isAuthenticated && !isMember && email
              ? <> You are signed in as <strong style={{ color: 'var(--sk-t1)', fontWeight: 500 }}>{email}</strong>, which is not on a lab project yet. Here is how to join.</>
              : <> Here is how to join.</>}
          </>
        }
      />

      {isMember && (
        <p style={{ marginTop: 16, fontSize: 14 }}>
          You are already a member. <Link to={PATHS.dashboard} className="pub-link">Go to Today</Link>
        </p>
      )}

      <div style={{ marginTop: '2rem' }}>
        <JoinSteps email={email} name={name} />
      </div>
    </div>
  )
}
