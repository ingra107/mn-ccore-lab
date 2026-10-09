// Library — Artifacts + Research Digest as two tabs (nav redesign, 2026-10-09).
// /portal/library (Artifacts) and /portal/library?tab=digest. The old
// /portal/artifacts index and /portal/digest redirect here; an artifact's own
// page stays at /portal/artifacts/:id.

import { Suspense } from 'react'
import { lazyRoute } from '../../../lib/lazyRoute'
import PageTabs from '../../../components/PageTabs'
import { TabFallback } from './TabFallback'

const ArtifactsGalleryPage = lazyRoute(() => import('../ArtifactsGalleryPage'))
const Digest = lazyRoute(() => import('../../Digest'))

export default function LibraryPage() {
  return (
    <PageTabs
      ariaLabel="Library"
      tabs={[
        { key: 'artifacts', label: 'Artifacts', render: () => <Suspense fallback={<TabFallback />}><ArtifactsGalleryPage /></Suspense> },
        { key: 'digest', label: 'Research Digest', render: () => <Suspense fallback={<TabFallback />}><Digest /></Suspense> },
      ]}
    />
  )
}
