import React from 'react'

interface PageHeaderProps {
  icon?: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  count?: number
}

export default function PageHeader({
  icon,
  title,
  subtitle,
  actions,
  children,
  count,
}: PageHeaderProps) {
  return (
    <div style={{ marginBottom: 'var(--sp-xl)' }}>
      {/* Title row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--sp-lg)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
          {icon && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: 'var(--teal)',
                paddingBottom: 6,
              }}
            >
              {icon}
            </span>
          )}
          {/* Title + muted inline meta, laid out like Today's title row
              (.tk-titlerow): display h1 at the baseline with the count and
              subtitle beside it as quiet text. No filled count pill. */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px 14px', flexWrap: 'wrap', minWidth: 0 }}>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              {title}
            </h1>
            {count !== undefined && (
              <span
                aria-live="polite"
                aria-atomic="true"
                style={{
                  fontSize: 13,
                  color: 'var(--sk-t3)',
                  fontVariantNumeric: 'tabular-nums',
                  paddingBottom: 4,
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
                  color: 'var(--sk-t3)',
                  paddingBottom: 4,
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

      {/* Children (filters, view controls, tabs) */}
      {children && (
        <div style={{ paddingTop: 'var(--sp-lg)' }}>
          {children}
        </div>
      )}
    </div>
  )
}
