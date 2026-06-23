import type {
  CSSProperties,
  ComponentPropsWithoutRef,
  ElementType,
  ReactNode,
} from 'react'
import { createElement } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'ghost-gold'
export type ButtonSize = 'sm' | 'md' | 'lg'

/**
 * Own props the Button controls regardless of which element it renders as.
 * `style`, `children`, and `disabled` are shared by every element we target
 * (button / a / react-router Link), so they live here; everything else comes
 * from the rendered element's own prop type via the polymorphic `as`.
 */
interface ButtonOwnProps {
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  style?: CSSProperties
  children?: ReactNode
}

/**
 * Polymorphic Button. Defaults to `<button>`; pass `as={Link}` (or `as="a"`,
 * any element/component) to render a `<Link>`-styled-as-button while reusing
 * Button's variant/size styling. The rendered element's full prop surface is
 * preserved and type-checked (e.g. `to` is required when `as={Link}`), with no
 * `any` escape hatch.
 */
export type ButtonProps<E extends ElementType = 'button'> = ButtonOwnProps & {
  as?: E
} & Omit<ComponentPropsWithoutRef<E>, keyof ButtonOwnProps | 'as'>

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

export function Button<E extends ElementType = 'button'>({
  as,
  variant = 'secondary',
  size = 'md',
  disabled,
  style,
  children,
  ...rest
}: ButtonProps<E>) {
  const Component = (as ?? 'button') as ElementType

  const computedStyle: CSSProperties = {
    ...COMMON_STYLE,
    ...VARIANT_STYLES[variant],
    ...SIZE_STYLES[size],
    ...(disabled ? { opacity: 0.5, cursor: 'default' } : {}),
    ...style,
  }

  // `disabled` is a native <button> attribute; on an anchor / Link it would be
  // an invalid DOM prop. Only forward it when we actually render a <button>.
  const disabledProp = Component === 'button' ? { disabled } : {}

  return createElement(
    Component,
    { ...disabledProp, style: computedStyle, ...rest },
    children,
  )
}

export default Button
