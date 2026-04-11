interface SkeletonProps {
  variant?: 'text' | 'card' | 'circle'
  width?: string | number
  height?: string | number
  className?: string
}

export default function Skeleton({ variant = 'text', width, height, className }: SkeletonProps) {
  const baseStyle = {
    backgroundColor: 'var(--border-subtle)',
    borderRadius: variant === 'circle' ? 'var(--radius-circle)' : variant === 'card' ? 'var(--radius-xl)' : 'var(--radius-sm)',
    animation: 'skeleton-pulse 1.5s ease-in-out infinite',
    width: width || (variant === 'card' ? '100%' : variant === 'circle' ? '40px' : '100%'),
    height: height || (variant === 'card' ? '120px' : variant === 'circle' ? '40px' : '14px'),
  }

  return <div className={className} style={baseStyle} />
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center gap-3 mb-4">
        <Skeleton variant="circle" width={32} height={32} />
        <div className="flex-1">
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={10} className="mt-2" />
        </div>
      </div>
      <Skeleton height={12} className="mb-2" />
      <Skeleton width="80%" height={12} />
    </div>
  )
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--ice)' }}>
          <Skeleton variant="circle" width={28} height={28} />
          <div className="flex-1">
            <Skeleton width={`${60 + (i * 13) % 30}%`} height={13} />
            <Skeleton width="40%" height={10} className="mt-1.5" />
          </div>
        </div>
      ))}
    </div>
  )
}
