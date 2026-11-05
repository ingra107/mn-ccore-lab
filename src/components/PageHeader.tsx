import type React from 'react'
import PageHeartbeat from './moments/PageHeartbeat'
import HeroNumber, { type HeroNumberProps } from './moments/HeroNumber'
import { usePageTabsTray } from '../lib/pageTabs'

// The rule under the title is the heartbeat line (color-back pick 10), and a
// page with one telling number shows it beside the title as `hero` (pick 2).
interface PageHeaderProps {
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  count?: number
  /** The page's one telling number, in Today's stat face, beside the title. */
  hero?: HeroNumberProps
  /** A line between the rule and the tabs (Meetings' progress and next date on a phone). */
  meta?: React.ReactNode
  /** Beside the tab tray on its row (Projects' view switch on a phone). */
  besideTabs?: React.ReactNode
}

export default function PageHeader({
  title,
  subtitle,
  actions,
  children,
  count,
  hero,
  meta,
  besideTabs,
}: PageHeaderProps) {
  // Inside a tab host (Projects, Meetings, Library, Lab Overview) the tabs sit below
  // the title, and the title stays put when they change.
  const tabs = usePageTabsTray()
  return (
    <div style={{ marginBottom: 'var(--sp-xl)' }}>
      {/* Title row: Today's anatomy. 28px display title, then a muted count or
          note beside it on the baseline. No icon, no count pill. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--sp-lg)',
          flexWrap: 'wrap',
        }}
      >
        <div className="tk-titlerow" style={{ minWidth: 0 }}>
          <h1 className="tk-h1" style={{ color: 'var(--sk-t1)' }}>{title}</h1>
          {hero && <HeroNumber {...hero} />}
          {count !== undefined && (
            <span className="tk-date" aria-live="polite" aria-atomic="true">
              {count}
            </span>
          )}
          {subtitle && (
            <span className="tk-date" aria-live="polite" style={{ whiteSpace: 'normal', minWidth: 0 }}>
              {subtitle}
            </span>
          )}
        </div>

        {actions && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-sm)',
              flexShrink: 1,
              flexWrap: 'wrap',
              minWidth: 0,
              maxWidth: '100%',
              justifyContent: 'flex-end',
            }}
          >
            {actions}
          </div>
        )}
      </div>

      {/* The heartbeat line: the header's rule */}
      <PageHeartbeat />

      {meta}

      {(tabs || besideTabs) && (
        <div className="page-tabs-row" style={{ paddingTop: 'var(--sp-md)' }}>
          {tabs && <div className="page-tabs" data-testid="page-tabs" style={{ display: 'flex', minWidth: 0 }}>{tabs}</div>}
          {besideTabs}
        </div>
      )}

      {/* Children (filters, view controls) */}
      {children && (
        <div style={{ paddingTop: 'var(--sp-md)' }}>
          {children}
        </div>
      )}
    </div>
  )
}
