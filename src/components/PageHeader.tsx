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
    <div style={{ marginBottom: 24 }}>
      {/* Title row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
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
                opacity: 0.6,
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
                opacity: 0.7,
                whiteSpace: 'nowrap',
              }}
            >
              {subtitle}
            </span>
          )}
        </div>

        {actions && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            {actions}
          </div>
        )}
      </div>

      {/* Horizontal rule */}
      <div
        style={{
          height: 1,
          backgroundColor: 'var(--border-subtle)',
          marginTop: 12,
        }}
      />

      {/* Children (filters, view controls, tabs) */}
      {children && (
        <div style={{ paddingTop: 12 }}>
          {children}
        </div>
      )}
    </div>
  )
}
