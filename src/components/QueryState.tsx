/**
 * QueryState — unified loading / error / empty state renderer.
 *
 * Usage: wrap a page's main content area.
 *
 *   <QueryState isLoading={isLoading} isError={isError} isEmpty={!items.length}>
 *     <MyTable items={items} />
 *   </QueryState>
 *
 * States (checked in priority order):
 *   1. isLoading → skeleton (TableSkeleton default, or custom `skeleton` prop)
 *   2. isError   → auth-error or generic error message (distinguishes 401 via
 *                  the `errorStatus` prop)
 *   3. isEmpty   → empty state art via `EmptyState` component
 *   4. otherwise → renders children
 *
 * Design: follows existing skeleton + EmptyState patterns in the codebase.
 * No emoji per CLAUDE.md. No Framer Motion (axe rule 44: transform-only).
 */
import type { ReactNode } from 'react'
import { TableSkeleton } from './LoadingSkeleton'
import EmptyState from './EmptyState'

interface QueryStateProps {
  isLoading: boolean
  isError: boolean
  isEmpty?: boolean
  /** HTTP status of the error, if known. 401/403 shows "Sign in" message. */
  errorStatus?: number
  /** Custom skeleton shown while loading. Defaults to TableSkeleton. */
  skeleton?: ReactNode
  /** Icon for the empty state (passed to EmptyState). */
  emptyIcon?: ReactNode
  /** Title for the empty state. */
  emptyTitle?: string
  /** Subtitle for the empty state. */
  emptySubtitle?: string
  /** Rendered when all checks pass (data loaded, no error, not empty). */
  children: ReactNode
}

export default function QueryState({
  isLoading,
  isError,
  isEmpty = false,
  errorStatus,
  skeleton,
  emptyIcon,
  emptyTitle = 'No data',
  emptySubtitle,
  children,
}: QueryStateProps) {
  if (isLoading) {
    return <>{skeleton ?? <TableSkeleton rows={6} cols={4} />}</>
  }

  if (isError) {
    const isAuth = errorStatus === 401 || errorStatus === 403
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          textAlign: 'center',
          gap: 'var(--sp-md)',
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
          {isAuth ? 'Sign in to view this page' : 'Something went wrong loading this data'}
        </p>
        <p style={{ fontSize: 12, color: 'var(--slate)', opacity: 0.75, margin: 0 }}>
          {isAuth
            ? 'Your session may have expired. Refresh and sign in again.'
            : 'Refresh the page or contact support if the problem persists.'}
        </p>
      </div>
    )
  }

  if (isEmpty) {
    return (
      <EmptyState
        icon={emptyIcon ?? (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
        )}
        title={emptyTitle}
        subtitle={emptySubtitle}
      />
    )
  }

  return <>{children}</>
}
