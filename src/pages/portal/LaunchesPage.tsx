// My Launches — the PI's launch_log recovery list (re-fire a Claude launch),
// moved here from the retired My Hub page (nav redesign, 2026-10-09). It sits
// under PI tools in the sidebar's avatar menu. Launches are PI-only (POST
// /api/launch-log refuses anyone else), so a member sees a short note instead
// of a list that could only ever be empty.

import { Zap } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import LaunchLogPanel from '../../components/launches/LaunchLogPanel'
import { useAuth } from '../../hooks/useAuth'
import { ICON_PROPS } from '../../lib/iconProps'

export default function LaunchesPage() {
  const { user } = useAuth()
  return (
    <div className="content-container">
      <PageHeader
        icon={<Zap {...ICON_PROPS} size={20} />}
        title="My Launches"
        subtitle="Claude sessions you started from the Hub. Re-fire one that did not start."
      />
      {user?.isPi ? (
        <div className="mt-4"><LaunchLogPanel /></div>
      ) : (
        <p style={{ fontSize: 'var(--text-small)', color: 'var(--slate)' }}>Launches are for the PI.</p>
      )}
    </div>
  )
}
