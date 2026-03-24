interface SectionHeaderProps {
  title: string
  subtitle?: string
  as?: 'h1' | 'h2' | 'h3'
  size?: 'sm' | 'md' | 'lg'
  accentLine?: boolean
  className?: string
}

const sizeClasses = {
  sm: 'text-xl sm:text-2xl lg:text-3xl',
  md: 'text-2xl sm:text-3xl lg:text-4xl',
  lg: 'text-3xl sm:text-4xl lg:text-5xl',
} as const

export default function SectionHeader({
  title,
  subtitle,
  as: Tag = 'h2',
  size = 'md',
  accentLine = false,
  className,
}: SectionHeaderProps) {
  const weight = Tag === 'h1' ? 800 : 600

  return (
    <div className={className}>
      {accentLine ? (
        <div className="flex items-center">
          <Tag
            className={sizeClasses[size]}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: weight,
              color: 'var(--ink)',
              lineHeight: 1.2,
            }}
          >
            {title}
          </Tag>
          <div className="section-header-line" />
        </div>
      ) : (
        <Tag
          className={sizeClasses[size]}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: weight,
            color: 'var(--ink)',
            lineHeight: 1.2,
          }}
        >
          {title}
        </Tag>
      )}
      {subtitle && (
        <p
          className="text-base sm:text-lg mt-3"
          style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--slate)',
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}
