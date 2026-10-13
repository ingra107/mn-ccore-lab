import { BarChart3 } from 'lucide-react'
import PageHeader from '../../../components/PageHeader'
import PageContainer from '../../../components/PageContainer'
import QueryState from '../../../components/QueryState'
import CollapsibleSection from '../../../components/CollapsibleSection'
import { CardSkeleton } from '../../../components/LoadingSkeleton'
import { ActiveTile } from '../../../components/labpulse/LabPulseTiles'
import WeekControl from '../../../components/labops/WeekControl'
import ReportMenu from '../../../components/labops/ReportMenu'
import {
  ActivityBlock, BlockUnavailable, CommitmentsBlock, ForecastBlock, LabProgressBlock,
  LeadershipInsightsBlock, WorkloadBlock,
} from '../../../components/labops/TeamBlocks'
import { useAuth } from '../../../hooks/useAuth'
import { usePageMeta } from '../../../hooks/usePageMeta'
import { usePIDashboard } from '../../../hooks/usePIDashboard'
import { isForbidden, useInsightsDashboard } from '../../../hooks/useInsightsDashboard'
import { useWeekParam } from '../../../hooks/useWeekParam'
import { useWeekStats } from '../../../hooks/useWeekStats'

/**
 * Lab overview > Team. Ordered by what a PI decides on: what to say to the
 * team (Leadership insights), who is loaded, who is engaged, what is coming.
 * Commitments and the lab-activity heatmap sit behind one disclosure. A member
 * sees the lab's totals and the open-task counts, never an individual metric.
 */
export default function TeamTab() {
  usePageMeta('Lab overview · Team · MN-CCORE', 'Workload, engagement and commitments across the lab.')
  const { user } = useAuth()
  const isPi = user.isPi
  const { monday, apiWeek } = useWeekParam()
  const w = useWeekStats(monday)
  const pi = usePIDashboard(isPi)
  const ins = useInsightsDashboard(apiWeek)
  const errStatus = (w.error as (Error & { status?: number }) | null)?.status

  const header = (
    <PageHeader
      title="Lab overview"
      subtitle="Team workload, engagement and commitments"
      actions={
        <div className="flex items-center gap-3 flex-wrap">
          <WeekControl />
          {isPi && <ReportMenu />}
        </div>
      }
    />
  )

  if (w.isLoading) {
    return (
      <PageContainer>
        {header}
        <div className="mt-5"><CardSkeleton count={4} /></div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      {header}
      <div data-testid="lab-team">
        <QueryState
          isLoading={false}
          isError={w.isError}
          isEmpty={w.tasks.length === 0}
          errorStatus={errStatus}
          emptyIcon={<BarChart3 size={40} />}
          emptyTitle="No team data yet"
          emptySubtitle="Workload and engagement appear as tasks are tracked."
        >
          <div className="flex flex-col gap-4">
            {isPi ? (
              <>
                <LeadershipInsightsBlock data={pi.data} isLoading={pi.isLoading} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                  <WorkloadBlock isPi tasks={w.tasks} insights={ins.data} />
                  <ActiveTile />
                </div>
                <ForecastBlock
                  tasks={w.tasks}
                  insights={ins.data}
                  unavailable={ins.isError ? <BlockUnavailable forbidden={isForbidden(ins.error)} what="The weekday forecast" /> : undefined}
                />
                <CollapsibleSection title="Commitments and lab activity" storageKey="lab-team-more">
                  <div className="flex flex-col gap-4">
                    <CommitmentsBlock data={pi.data} />
                    <ActivityBlock stats={{ activityCount: w.weekStats.activityCount, activityPrior: w.weekStats.activityPrior, spark: w.sparkActivity }} />
                  </div>
                </CollapsibleSection>
              </>
            ) : (
              <>
                <LabProgressBlock completed={w.weekStats.completed} pending={w.tasks.filter((t) => !t.completed).length} />
                <WorkloadBlock isPi={false} tasks={w.tasks} />
                <CollapsibleSection title="Lab activity" storageKey="lab-team-more">
                  <ActivityBlock stats={{ activityCount: w.weekStats.activityCount, activityPrior: w.weekStats.activityPrior, spark: w.sparkActivity }} />
                </CollapsibleSection>
              </>
            )}
          </div>
        </QueryState>
      </div>
    </PageContainer>
  )
}
