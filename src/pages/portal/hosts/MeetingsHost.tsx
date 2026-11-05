// Meetings + Transcripts as two tabs (nav redesign, 2026-10-09).
// /portal/meeting-notes redirects to /portal/meetings?tab=transcripts.

import { Suspense } from 'react'
import { lazyRoute } from '../../../lib/lazyRoute'
import PageTabs from '../../../components/PageTabs'
import { TabFallback } from './TabFallback'

const Meetings = lazyRoute(() => import('../../Meetings'))
const MeetingNotesPage = lazyRoute(() => import('../MeetingNotesPage'))

export default function MeetingsHost() {
  return (
    <PageTabs
      title="Meetings"
      ariaLabel="Meetings views"
      tabs={[
        { key: 'meetings', label: 'All', render: () => <Suspense fallback={<TabFallback />}><Meetings /></Suspense> },
        { key: 'transcripts', label: 'Transcripts', render: () => <Suspense fallback={<TabFallback />}><MeetingNotesPage /></Suspense> },
      ]}
    />
  )
}
