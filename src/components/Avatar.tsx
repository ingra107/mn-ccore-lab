interface AvatarProps {
  name: string
  initials: string
  photoUrl?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xs' | 'xs' | 'sm-icon' | 'sm-plus' | 'tight' | 'base-sm' | 'base' | 'base-lg' | 'base-xl'
  variant?: 'gold' | 'ice'
  className?: string
}

const sizeConfig = {
  // Micro sizes for inline/compact contexts — min-w-0 min-h-0 prevents flex inflation
  '2xs': {
    container: 'w-4 h-4 min-w-0 min-h-0',
    text: 'text-[6px]',
  },
  'xs': {
    container: 'w-5 h-5 min-w-0 min-h-0',
    text: 'text-[7px]',
  },
  'sm-icon': {
    container: 'w-[18px] h-[18px] min-w-0 min-h-0',
    text: 'text-[7px]',
  },
  'sm-plus': {
    container: 'w-[22px] h-[22px] min-w-0 min-h-0',
    text: 'text-[7px]',
  },
  'tight': {
    container: 'w-6 h-6 min-w-0 min-h-0',
    text: 'text-[10px]',
  },
  'base-sm': {
    container: 'w-7 h-7 min-w-0 min-h-0',
    text: 'text-[10px]',
  },
  'base': {
    container: 'w-8 h-8 min-w-0 min-h-0',
    text: 'text-[10px]',
  },
  'base-lg': {
    container: 'w-9 h-9 min-w-0 min-h-0',
    text: 'text-[10px]',
  },
  'base-xl': {
    container: 'w-10 h-10 min-w-0 min-h-0',
    text: 'text-xs',
  },
  // Standard named sizes (profile photos, member cards, etc.)
  sm: {
    container: 'w-14 h-14 sm:w-16 sm:h-16',
    text: 'text-sm sm:text-base',
  },
  md: {
    container: 'w-20 h-20 sm:w-24 sm:h-24',
    text: 'text-xl sm:text-2xl',
  },
  lg: {
    container: 'w-32 h-32',
    text: 'text-3xl',
  },
  xl: {
    container: 'w-36 h-36 sm:w-40 sm:h-40',
    text: 'text-4xl',
  },
} as const

const variantStyles = {
  gold: {
    background: 'var(--gold-light)',
    border: '2px solid var(--gold)',
    color: 'var(--gold)',
  },
  ice: {
    background: 'var(--ice)',
    border: '1px solid rgba(201,168,76,0.2)',
    color: 'var(--slate)',
  },
} as const

export default function Avatar({
  name,
  initials,
  photoUrl,
  size = 'md',
  variant = 'gold',
  className,
}: AvatarProps) {
  const { container, text } = sizeConfig[size]
  const styles = variantStyles[variant]

  return (
    <div
      className={`${container} rounded-full flex items-center justify-center shrink-0 overflow-hidden ${className ?? ''}`}
      style={{
        background: styles.background,
        border: styles.border,
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.03)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          loading="lazy"
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <span
          className={`${text} font-bold select-none`}
          style={{
            fontFamily: 'var(--font-display)',
            color: styles.color,
          }}
        >
          {initials}
        </span>
      )}
    </div>
  )
}
