// Lab overview + its tabs (analytics fold, 2026-10-13): Overview, Team,
// Pipeline, Mentees, Cascade. Analytics, Insights and PI analytics became the
// Team and Pipeline tabs (and the trainee blocks on Mentees); their routes
// redirect here (App.tsx) and the old tab keys stay as aliases:
//   pi-analytics -> team, mentee-milestones -> mentees, deadline-cascade -> cascade.
//
// The page is open to everyone, though the sidebar lists it for a PI only (a
// member reaches it from the avatar menu). Tabs hide per SECTION, not per tab:
// every individual metric (a person's engagement, completion, trainee pace) is
// drawn only for a PI, so a member sees the lab's totals and the shared pages.
//
// `?week=` (ISO Monday week) and `?range=` belong to the page and survive a tab
// switch; every other param belonged to the tab you left.

import { Suspense } from 'react'
import { lazyRoute } from '../../../lib/lazyRoute'
import PageTabs from '../../../components/PageTabs'
import PageErrorBoundary from '../../../components/PageErrorBoundary'
import { TabFallback } from './TabFallback'

const Dashboard = lazyRoute(() => import('../../Dashboard'))
const TeamTab = lazyRoute(() => import('../labops/TeamTab'))
const PipelineTab = lazyRoute(() => import('../labops/PipelineTab'))
const MenteesTab = lazyRoute(() => import('../labops/MenteesTab'))
const DeadlineCascadePage = lazyRoute(() => import('../DeadlineCascadePage'))

const tab = (name: string, node: React.ReactNode) => (
  <PageErrorBoundary pageName={name}><Suspense fallback={<TabFallback />}>{node}</Suspense></PageErrorBoundary>
)

export default function LabOverviewHost() {
  return (
    <PageTabs
      ariaLabel="Lab overview"
      keepParams={['week', 'range']}
      tabs={[
        { key: 'overview', label: 'Overview', render: () => tab('LabOverview', <Dashboard />) },
        { key: 'team', label: 'Team', aliases: ['pi-analytics'], render: () => tab('LabTeam', <TeamTab />) },
        { key: 'pipeline', label: 'Pipeline', render: () => tab('LabPipeline', <PipelineTab />) },
        { key: 'mentees', label: 'Mentees', aliases: ['mentee-milestones'], render: () => tab('LabMentees', <MenteesTab />) },
        { key: 'cascade', label: 'Cascade', aliases: ['deadline-cascade'], render: () => <Suspense fallback={<TabFallback />}><DeadlineCascadePage /></Suspense> },
      ]}
    />
  )
}
