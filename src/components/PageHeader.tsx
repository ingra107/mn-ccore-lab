import React from 'react'
import PageHeartbeat from './moments/PageHeartbeat'
import HeroNumber, { type HeroNumberProps } from './moments/HeroNumber'

// The rule under the title is the heartbeat line (color-back pick 10), and a
// page with one telling number shows it beside the title as `hero` (pick 2).
interface PageHeaderProps {
  icon?: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  count?: number
  /** The page's one telling number, in Today's stat face, beside the title. */
  hero?: HeroNumberProps
}

export default function PageHeader({
  icon,
  title,
  subtitle,
  actions,
  children,
  count,
  hero,
}: PageHeaderProps) {
  return (
    <div style={{ marginBottom: 'var(--sp-xl)' }}>
      {/* Title row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--sp-lg)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
          {icon && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: 'var(--teal)',
              }}
            >
              {icon}
            </span>
          )}
          {/* Title + inline badges — wraps naturally at <420px so subtitle drops below */}
          <div style={{ display: 'flex', alignItems: hero ? 'baseline' : 'center', gap: hero ? '4px 14px' : 8, flexWrap: 'wrap', minWidth: 0 }}>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 500,
                color: 'var(--ink)',
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {title}
            </h1>
            {hero && <HeroNumber {...hero} />}
            {count !== undefined && (
              <span
                aria-live="polite"
                aria-atomic="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--slate)',
                  opacity: 0.75,
                  backgroundColor: 'var(--border-subtle)',
                  borderRadius: 'var(--radius-full)',
                  padding: '2px 8px',
                  lineHeight: 1.4,
                  flexShrink: 0,
                }}
              >
                {count}
              </span>
            )}
            {subtitle && (
              <span
                aria-live="polite"
                style={{
                  fontSize: 13,
                  fontWeight: 400,
                  color: 'var(--slate)',
                  opacity: 0.85,
                  flexShrink: 1,
                  minWidth: 0,
                }}
              >
                {subtitle}
              </span>
            )}
          </div>
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

      {/* Children (filters, view controls, tabs) */}
      {children && (
        <div style={{ paddingTop: 'var(--sp-md)' }}>
          {children}
        </div>
      )}
    </div>
  )
}
