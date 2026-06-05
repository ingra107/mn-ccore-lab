const skeletonStyle: React.CSSProperties = {
  backgroundColor: 'var(--ink)',
  opacity: 0.06,
  borderRadius: 'var(--radius-sm)',
  animation: 'skeleton-pulse 1.8s ease-in-out infinite',
}

function SkeletonBar({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return (
    <div
      style={{
        ...skeletonStyle,
        width,
        height,
      }}
    />
  )
}

/**
 * Table skeleton with rows and columns of varying widths.
 */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  // Deterministic pseudo-random widths per cell
  const cellWidths = [72, 85, 64, 90, 78, 68, 82, 60, 88, 75]

  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 'var(--sp-lg)',
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {Array.from({ length: cols }).map((_, c) => (
          <SkeletonBar key={c} width="50%" height={10} />
        ))}
      </div>

      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 'var(--sp-lg)',
            padding: '14px 20px',
            borderBottom: r < rows - 1 ? '1px solid var(--border-subtle)' : undefined,
          }}
        >
          {Array.from({ length: cols }).map((_, c) => {
            const widthIdx = (r * cols + c) % cellWidths.length
            return (
              <SkeletonBar
                key={c}
                width={`${cellWidths[widthIdx]}%`}
                height={13}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * Card skeleton with a header bar and content lines.
 */
export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 'var(--sp-lg)',
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-xl)',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-md)',
          }}
        >
          {/* Header bar */}
          <SkeletonBar width="60%" height={16} />
          {/* Content lines */}
          <SkeletonBar width="100%" height={12} />
          <SkeletonBar width="85%" height={12} />
          <SkeletonBar width="45%" height={12} />
        </div>
      ))}
    </div>
  )
}

/**
 * Text skeleton with horizontal bars at varying widths.
 */
export function TextSkeleton({
  lines = 3,
  widths,
}: {
  lines?: number
  widths?: string[]
}) {
  const defaultWidths = ['100%', '85%', '70%']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => {
        const w = widths?.[i] ?? defaultWidths[i % defaultWidths.length]
        return <SkeletonBar key={i} width={w} height={14} />
      })}
    </div>
  )
}
