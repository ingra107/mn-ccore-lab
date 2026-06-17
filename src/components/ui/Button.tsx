import type { ButtonHTMLAttributes, CSSProperties } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'ghost-gold'
  size?: 'sm' | 'md' | 'lg'
}

const VARIANT_STYLES: Record<NonNullable<ButtonProps['variant']>, CSSProperties> = {
  primary: {
    background: 'var(--teal-solid)',
    color: 'var(--ink-bright, #fff)',
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    border: '1px solid var(--border-subtle)',
    color: 'var(--slate)',
  },
  ghost: {
    background: 'none',
    border: 'none',
    color: 'var(--slate)',
  },
  danger: {
    background: 'transparent',
    border: '1px solid var(--maroon)',
    color: 'var(--maroon)',
  },
  // gold — solid gold fill; for primary actions on the Today/task surfaces that
  // use ACCENT_GOLD (--task-accent-gold) as their accent (not teal).
  gold: {
    background: 'var(--task-accent-gold)',
    color: 'var(--task-page-bg)',
    border: 'none',
  },
  // ghost-gold — transparent bg, gold text, no border; for secondary/ghost
  // actions on gold-accented surfaces (e.g. "Plan for today" alongside the
  // solid gold "Work on this now" button).
  'ghost-gold': {
    background: 'none',
    border: 'none',
    color: 'var(--task-accent-gold)',
  },
}

const SIZE_STYLES: Record<NonNullable<ButtonProps['size']>, CSSProperties> = {
  sm: {
    padding: 'var(--sp-xs) var(--sp-md)',
    fontSize: 'var(--text-label)',
    borderRadius: 'var(--radius-sm)',
  },
  md: {
    padding: '6px 16px',
    fontSize: 'var(--text-base)',
    borderRadius: 'var(--radius-md)',
  },
  lg: {
    padding: '8px 20px',
    fontSize: 'var(--text-base)',
    borderRadius: 'var(--radius-lg)',
  },
}

const COMMON_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--sp-xs)',
  fontFamily: 'inherit',
  fontWeight: 'var(--weight-ui)' as CSSProperties['fontWeight'],
  whiteSpace: 'nowrap',
  transition: 'background var(--duration-normal), opacity var(--duration-normal)',
  cursor: 'pointer',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  disabled,
  style,
  children,
  ...rest
}: ButtonProps) {
  const computedStyle: CSSProperties = {
    ...COMMON_STYLE,
    ...VARIANT_STYLES[variant],
    ...SIZE_STYLES[size],
    ...(disabled ? { opacity: 0.5, cursor: 'default' } : {}),
    ...style,
  }

  return (
    <button disabled={disabled} style={computedStyle} {...rest}>
      {children}
    </button>
  )
}

export default Button
