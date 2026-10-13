import { Suspense } from 'react'
import PageContainer from '../../../components/PageContainer'
import { lazyRoute } from '../../../lib/lazyRoute'
import { PubsTile } from '../../../components/labpulse/LabPulseTiles'
import { TraineeVelocityBlock } from '../../../components/labops/MenteeBlocks'
import { TabFallback } from '../hosts/TabFallback'
import { useAuth } from '../../../hooks/useAuth'
import { usePIDashboard } from '../../../hooks/usePIDashboard'

const MenteeMilestonesPage = lazyRoute(() => import('../MenteeMilestonesPage'))

/**
 * Lab overview > Mentees. The trainee publication pace (PI only: it names
 * people and counts) above the Mentee milestones page, which every member can
 * open and keeps its own header and controls.
 */
export default function MenteesTab() {
  const { user } = useAuth()
  const pi = usePIDashboard(user.isPi)
  return (
    <>
      {user.isPi && (
        <PageContainer>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start mb-6" data-testid="lab-mentees">
            <PubsTile />
            <TraineeVelocityBlock data={pi.data} />
          </div>
        </PageContainer>
      )}
      <Suspense fallback={<TabFallback />}><MenteeMilestonesPage /></Suspense>
    </>
  )
}
