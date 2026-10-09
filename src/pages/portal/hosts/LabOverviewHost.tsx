// Lab Overview + its tabs (nav redesign, 2026-10-09): Overview, PI Analytics,
// Mentee Milestones, Deadline Cascade. The old /portal/pi/analytics,
// /portal/mentee-milestones and /portal/deadline-cascade redirect here.
//
// Lab Overview sits in the sidebar for a PI only (Nick's nav), but the page
// stays open to everyone: a member still reaches Mentee Milestones from a
// member page's "View all" and Deadline Cascade from the Deadlines page, as
// before. PI Analytics was PI-only in the sidebar and the palette, so its tab
// is too.

import { Suspense } from 'react'
import { lazyRoute } from '../../../lib/lazyRoute'
import PageTabs from '../../../components/PageTabs'
import PageErrorBoundary from '../../../components/PageErrorBoundary'
import { useAuth } from '../../../hooks/useAuth'
import { TabFallback } from './TabFallback'

const Dashboard = lazyRoute(() => import('../../Dashboard'))
const PIAnalytics = lazyRoute(() => import('../PIAnalytics'))
const MenteeMilestonesPage = lazyRoute(() => import('../MenteeMilestonesPage'))
const DeadlineCascadePage = lazyRoute(() => import('../DeadlineCascadePage'))

export default function LabOverviewHost() {
  const { user } = useAuth()
  return (
    <PageTabs
      ariaLabel="Lab Overview"
      tabs={[
        {
          key: 'overview', label: 'Overview',
          render: () => <PageErrorBoundary pageName="LabOverview"><Suspense fallback={<TabFallback />}><Dashboard /></Suspense></PageErrorBoundary>,
        },
        {
          key: 'pi-analytics', label: 'PI Analytics', hidden: !user?.isPi,
          render: () => <PageErrorBoundary pageName="PIAnalytics"><Suspense fallback={<TabFallback />}><PIAnalytics /></Suspense></PageErrorBoundary>,
        },
        { key: 'mentee-milestones', label: 'Mentee Milestones', render: () => <Suspense fallback={<TabFallback />}><MenteeMilestonesPage /></Suspense> },
        { key: 'deadline-cascade', label: 'Deadline Cascade', render: () => <Suspense fallback={<TabFallback />}><DeadlineCascadePage /></Suspense> },
      ]}
    />
  )
}
