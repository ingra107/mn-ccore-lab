import type {
  CSSProperties,
  ComponentPropsWithRef,
  ElementType,
  ReactNode,
} from 'react'
import { createElement } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'ghost-gold'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

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
 * `any` escape hatch. `ref` is included: React 19 passes it as a plain prop,
 * and the spread below hands it to the rendered element.
 */
export type ButtonProps<E extends ElementType = 'button'> = ButtonOwnProps & {
  as?: E
} & Omit<ComponentPropsWithRef<E>, keyof ButtonOwnProps | 'as'> & IconName

/**
 * An icon-only button has no visible text, so its name comes from
 * `aria-label`: size="icon" without one does not type-check. The raw
 * `<button>` route around this is refused by the lint rule icon/icon-button
 * (eslint-rules/icon-button.mjs).
 */
type IconName =
  | { size: 'icon'; 'aria-label': string }
  | { size?: Exclude<ButtonSize, 'icon'> }

const VARIANT_STYLES: Record<NonNullable<ButtonProps['variant']>, CSSProperties> = {
  primary: {
    background: 'var(--job-accent-solid)',
    color: 'var(--ink-bright, #fff)',
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    border: 'none',
    boxShadow: 'inset 0 0 0 1px var(--sk-line2)',
    color: 'var(--slate)',
  },
  ghost: {
    background: 'none',
    border: 'none',
    color: 'var(--slate)',
  },
  danger: {
    background: 'transparent',
    border: '1px solid var(--job-danger)',
    color: 'var(--job-danger)',
  },
  // gold — solid brand fill for the public site (LabPageLayout, /network).
  // --job-brand is gray inside .portal-shell, so a portal use renders neutral.
  gold: {
    background: 'var(--job-brand)',
    color: 'var(--task-page-bg)',
    border: 'none',
  },
  // ghost-gold — transparent bg, milestone gold text, no border. Its one use is
  // the milestone drawer's "Mark complete": milestones keep gold (principle 21).
  'ghost-gold': {
    background: 'none',
    border: 'none',
    color: 'var(--job-milestone)',
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
  // icon: an icon-only button in a row of other controls. No padding; the box
  // itself is sized by .btn-icon in index.css (24x24, 44x44 on touch), so the
  // tap zone is real layout space and can never cover a neighbour. Used only
  // with an explicit variant; a bare icon button takes no inline style at all
  // (see Button below).
  icon: {
    padding: 0,
    borderRadius: 'var(--radius-sm)',
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
  variant,
  size = 'md',
  disabled,
  style,
  children,
  ...rest
}: ButtonProps<E>) {
  const Component = (as ?? 'button') as ElementType

  // A bare icon button (size="icon", no variant) keeps its look in the caller's
  // className and style: inline variant styles would override every class rule
  // (colour, hover background, padding) at the ~130 sites that moved here from
  // a raw <button>. Its base (inline-flex, centred, pointer) is
  // :where(.btn-icon) in index.css, zero specificity, so any class still wins.
  const bareIcon = size === 'icon' && variant === undefined
  const computedStyle: CSSProperties | undefined = bareIcon ? style : {
    ...COMMON_STYLE,
    ...VARIANT_STYLES[variant ?? 'secondary'],
    ...SIZE_STYLES[size],
    ...(disabled ? { opacity: 0.5, cursor: 'default' } : {}),
    ...style,
  }

  // `disabled` is a native <button> attribute; on an anchor / Link it would be
  // an invalid DOM prop. Only forward it when we actually render a <button>.
  const disabledProp = Component === 'button' ? { disabled } : {}

  // Touch target (index.css): a stand-alone md/lg <button> gets the 44px
  // minimum height; an icon button gets a real 24x24 box (44x44 on touch);
  // everything else (sm, or an anchor/Link) gets a hit area that grows the
  // tap zone without changing the layout. md/lg do NOT get the hit area: its
  // ::before overhang knows nothing of the neighbours, so in a row of narrow
  // buttons the later one covers the earlier (Remove over Edit, 6px apart).
  const { className: extraClass, ...restProps } = rest as { className?: string }
  const touchClass =
    size === 'icon' ? 'btn-icon'
    : Component === 'button' && size !== 'sm' ? 'touch-tall'
    : 'hit-area'
  const className = extraClass ? `${touchClass} ${extraClass}` : touchClass

  return createElement(
    Component,
    { ...disabledProp, style: computedStyle, ...restProps, className },
    children,
  )
}

export default Button
