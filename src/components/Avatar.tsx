import HermesMark from './HermesMark'
import { ACCENT_GOLD, withAlpha } from '../lib/taskGrouping'

/** Lab-aesthetic generated portrait — used when a team member has no
 *  photo_url. Two stacked geometric arcs (suggesting a tilted-head
 *  silhouette) in a muted token-aligned palette, with the initials
 *  layered on top. Same name → same portrait (deterministic hash). */
function GeneratedPortrait({ name, initials, fallbackColor, textClass }: { name: string; initials: string; fallbackColor: string; textClass: string }) {
  // Pick one of 4 palette swatches deterministically.
  const palette = [
    { bg: 'color-mix(in srgb, var(--teal) 22%, var(--cream))',  arc: 'var(--teal)' },
    { bg: 'color-mix(in srgb, var(--gold) 22%, var(--cream))',  arc: 'var(--gold)' },
    { bg: 'color-mix(in srgb, var(--maroon) 18%, var(--cream))', arc: 'var(--maroon)' },
    { bg: 'color-mix(in srgb, var(--green) 22%, var(--cream))', arc: 'var(--green)' },
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  const swatch = palette[hash % palette.length]
  return (
    <span
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: swatch.bg,
      }}
    >
      <svg
        viewBox="0 0 64 64"
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0, opacity: 0.55 }}
        aria-hidden="true"
      >
        <path d="M14 50 Q32 38 50 50" fill="none" stroke={swatch.arc} strokeWidth="2" strokeLinecap="round" />
        <circle cx="32" cy="26" r="9" fill="none" stroke={swatch.arc} strokeWidth="2" />
      </svg>
      <span
        className={`${textClass} font-bold select-none`}
        style={{
          position: 'relative',
          fontFamily: 'var(--font-display)',
          color: fallbackColor,
        }}
      >
        {initials}
      </span>
    </span>
  )
}

interface AvatarProps {
  name: string
  initials: string
  photoUrl?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xs' | 'xs' | 'sm-icon' | 'sm-plus' | 'tight' | 'base-sm' | 'base' | 'base-lg' | 'base-xl'
  variant?: 'gold' | 'ice'
  /** Slug — used to swap in the HermesMark when slug === 'claude-ai' so
   *  Hermes shows up as a peer avatar instead of "AI" letter initials. */
  slug?: string
  className?: string
}

const sizeConfig = {
  // GUARDRAIL EXCEPTION: text below 10px floor is grandfathered for avatar tier initials
  // where the container is ≤24px. Initials are glyph-scale, not readable content.
  // See CLAUDE.md "10px typography floor" guardrail. (C-15 escalation, 2026-04-12)
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
    border: `1px solid ${withAlpha(ACCENT_GOLD, 20)}`,
    color: 'var(--slate)',
  },
} as const

export default function Avatar({
  name,
  initials,
  photoUrl,
  size = 'md',
  variant = 'gold',
  slug,
  className,
}: AvatarProps) {
  const { container, text } = sizeConfig[size]
  const styles = variantStyles[variant]
  const isHermes = slug === 'claude-ai'

  return (
    <div
      className={`${container} rounded-full flex items-center justify-center shrink-0 overflow-hidden ${className ?? ''}`}
      style={{
        background: styles.background,
        border: styles.border,
        transition: 'transform var(--duration-normal, 150ms) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.03)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {isHermes ? (
        <span
          aria-label="Hermes — AI research assistant"
          title="Hermes — AI research assistant"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '70%',
            height: '70%',
            color: 'var(--gold)',
          }}
        >
          <HermesMark variant="icon" size={32} color="var(--gold)" pulse />
        </span>
      ) : photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          width={96}
          height={96}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <GeneratedPortrait name={name} initials={initials} fallbackColor={styles.color} textClass={text} />
      )}
    </div>
  )
}
