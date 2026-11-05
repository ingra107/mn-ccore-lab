import { useContext } from 'react'
import HeartbeatLine from '../../../components/HeartbeatLine'
import PageHeader from '../../../components/PageHeader'
import { PageTabsContext } from '../../../lib/pageTabs'

/** The loading state while a tab's page chunk arrives (same pulse as PageLoader). */
export function TabFallback() {
  const title = useContext(PageTabsContext)?.title
  return (
    <>
      {/* The title and tabs hold their places while the tab's page loads. */}
      {title && <div className="content-container"><PageHeader title={title} /></div>}
      <div className="flex items-center justify-center min-h-[40vh]" role="status" aria-label="Loading">
        <HeartbeatLine width={140} height={40} color="var(--sk-t3)" ariaLabel="Loading" />
      </div>
    </>
  )
}
