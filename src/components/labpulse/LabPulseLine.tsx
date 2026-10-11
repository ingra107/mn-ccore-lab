// LabPulseLine -- the one quiet line on Today (Nick, 2026-10-11):
//   Lab pulse · trainees 2.4 pubs/yr ▲ · tasks done in 6 days ▲ · 9 of 14 active ▼2
// Tapping it opens the Lab pulse section on PI Analytics. PI only: the hooks
// never fire for a member, and the routes would answer them 403 anyway. Gray
// text; an arrow turns orange only when that number is slipping.

import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { useAuth } from '../../hooks/useAuth'
import { usePubsPulse, useSpeedPulse, useEngagementPulse } from '../../hooks/useLabPulse'
import { pulseParts } from '../../lib/labPulse'

export default function LabPulseLine() {
  const { user } = useAuth()
  const pubs = usePubsPulse().data
  const speed = useSpeedPulse().data
  const eng = useEngagementPulse().data
  const parts = user.isPi ? pulseParts(pubs, speed, eng) : []
  if (parts.length === 0) return null
  return (
    <Link
      to={PATHS.piAnalyticsTab}
      className="lab-pulse-line"
      data-testid="lab-pulse-line"
      title="Open Lab pulse on PI Analytics"
    >
      <span className="lab-pulse-line-k">Lab pulse</span>
      {parts.map((p) => (
        <span key={p.key}>
          <span aria-hidden="true"> · </span>
          {p.text}
          {p.mark && (
            <span aria-hidden="true" className={p.better === 'worse' ? 'lab-pulse-slip' : undefined}> {p.mark}</span>
          )}
          {p.better !== 'flat' && p.mark && <span className="sr-only">{p.better === 'worse' ? ' (slipping)' : ' (improving)'}</span>}
        </span>
      ))}
    </Link>
  )
}
