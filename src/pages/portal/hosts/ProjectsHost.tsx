// Projects + Ideas as two tabs (nav redesign, 2026-10-09). /portal/ideas
// redirects to /portal/projects?tab=ideas (keeping ?create=true, which the
// Ideas tab reads to open its create form).

import { Suspense } from 'react'
import { lazyRoute } from '../../../lib/lazyRoute'
import PageTabs from '../../../components/PageTabs'
import { TabFallback } from './TabFallback'

const Projects = lazyRoute(() => import('../../Projects'))
const IdeasPage = lazyRoute(() => import('../IdeasPage'))

export default function ProjectsHost() {
  return (
    <PageTabs
      ariaLabel="Projects"
      tabs={[
        { key: 'projects', label: 'Projects', render: () => <Suspense fallback={<TabFallback />}><Projects /></Suspense> },
        { key: 'ideas', label: 'Ideas', render: () => <Suspense fallback={<TabFallback />}><IdeasPage /></Suspense> },
      ]}
    />
  )
}
