import { BarChart3 } from 'lucide-react'
import PageHeader from '../../../components/PageHeader'
import PageContainer from '../../../components/PageContainer'
import QueryState from '../../../components/QueryState'
import ChartCard from '../../../components/ui/ChartCard'
import CollapsibleSection from '../../../components/CollapsibleSection'
import { CardSkeleton } from '../../../components/LoadingSkeleton'
import { SpeedTile } from '../../../components/labpulse/LabPulseTiles'
import WeekControl from '../../../components/labops/WeekControl'
import ReportMenu from '../../../components/labops/ReportMenu'
import StalledRegistry from '../../../components/labops/StalledRegistry'
import { BlockUnavailable } from '../../../components/labops/TeamBlocks'
import {
  ConnectionsBlock, PortfolioBlock, ProductsByStageBlock, PublicationsOutputBlock,
  ThisWeekBlock, VelocityBlock, VelocityOutliersBlock,
} from '../../../components/labops/PipelineBlocks'
import { useProjects, useIdeas, useProjectHealth } from '../../../hooks/useApiData'
import { useAuth } from '../../../hooks/useAuth'
import { usePageMeta } from '../../../hooks/usePageMeta'
import { usePIDashboard } from '../../../hooks/usePIDashboard'
import { isForbidden, useInsightsDashboard } from '../../../hooks/useInsightsDashboard'
import { useWeekParam } from '../../../hooks/useWeekParam'
import { useWeekStats } from '../../../hooks/useWeekStats'

/**
 * Lab overview > Pipeline. What moved this week and what is stuck first (the
 * stat row, the overdue list, stalled projects), then where the work stands
 * (products by stage, portfolio), then velocity. Outliers, connections and
 * publications output sit behind one disclosure. Products are counted on one
 * scope for everyone: live products of active projects.
 */
export default function PipelineTab() {
  usePageMeta('Lab overview · Pipeline · MN-CCORE', 'Where attention should go this week.')
  const { user } = useAuth()
  const isPi = user.isPi
  const { monday, apiWeek } = useWeekParam()
  const w = useWeekStats(monday)
  const { data: projects = [], isLoading: projectsLoading } = useProjects()
  const { data: ideas = [] } = useIdeas()
  const { data: healthData } = useProjectHealth()
  const pi = usePIDashboard()
  const ins = useInsightsDashboard(apiWeek)
  const errStatus = (w.error as (Error & { status?: number }) | null)?.status

  const header = (
    <PageHeader
      title="Lab overview"
      subtitle={w.tasks.length > 0 || projects.length > 0 ? `${projects.length} projects, ${w.tasks.filter((t) => !t.completed).length} active tasks` : 'Pipeline, velocity and stalled work'}
      actions={
        <div className="flex items-center gap-3 flex-wrap">
          <WeekControl />
          {isPi && <ReportMenu />}
        </div>
      }
    />
  )

  if (w.isLoading || projectsLoading) {
    return (
      <PageContainer>
        {header}
        <div className="mt-5"><CardSkeleton count={4} /></div>
      </PageContainer>
    )
  }

  const piData = isPi ? pi.data : undefined
  return (
    <PageContainer>
      {header}
      <div data-testid="lab-pipeline">
        <QueryState
          isLoading={false}
          isError={w.isError}
          isEmpty={w.tasks.length === 0 && projects.length === 0}
          errorStatus={errStatus}
          emptyIcon={<BarChart3 size={40} />}
          emptyTitle="No pipeline data yet"
          emptySubtitle="Pipeline numbers appear as projects and tasks are tracked."
        >
          <div className="flex flex-col gap-4">
            <ThisWeekBlock
              stats={w.weekStats}
              sparks={{ completed: w.sparkCompleted, created: w.sparkCreated, overdue: w.sparkOverdue }}
              tasks={w.tasks}
              health={healthData?.summary}
              stalled={isPi ? ins.data?.metrics.stalledProjects : undefined}
            />

            {isPi && (ins.data
              ? <StalledRegistry rows={ins.data.stalledRegistry} />
              : (
                <ChartCard title="Stalled projects" count="PI only">
                  {ins.isError
                    ? <BlockUnavailable forbidden={isForbidden(ins.error)} what="Stalled projects" />
                    : <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading</p>}
                </ChartCard>
              ))}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <ProductsByStageBlock rows={pi.data?.productsByStage} />
              <PortfolioBlock projects={projects} ideas={ideas} pi={piData} insights={isPi ? ins.data : undefined} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              <div className="lg:col-span-2 min-w-0">
                <VelocityBlock weeks={w.velocityWeeks} tasks={w.tasks} />
              </div>
              {isPi && <SpeedTile />}
            </div>

            <CollapsibleSection title={isPi ? 'Outliers, connections and publications' : 'Connections'} storageKey="lab-pipeline-more">
              <div className="flex flex-col gap-4">
                {isPi && ins.data && <VelocityOutliersBlock rows={ins.data.velocityScatter} />}
                <ConnectionsBlock />
                {isPi && <PublicationsOutputBlock data={piData} />}
              </div>
            </CollapsibleSection>
          </div>
        </QueryState>
      </div>
    </PageContainer>
  )
}
