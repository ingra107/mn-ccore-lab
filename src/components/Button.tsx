import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

interface ButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
  href?: string
  to?: string
  onClick?: () => void
  icon?: ReactNode
  className?: string
}

const sizeClasses = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-6 py-3',
} as const

const variantStyles = {
  primary: {
    background: 'var(--gold)',
    color: '#0f1923',
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--ink)',
    border: '1px solid var(--border-light)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--gold)',
    border: 'none',
  },
} as const

const hoverHandlers = {
  primary: {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      e.currentTarget.style.filter = 'brightness(1.1)'
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      e.currentTarget.style.filter = 'brightness(1)'
    },
  },
  secondary: {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      e.currentTarget.style.borderColor = 'var(--gold)'
      e.currentTarget.style.color = 'var(--gold)'
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      e.currentTarget.style.borderColor = 'var(--border-light)'
      e.currentTarget.style.color = 'var(--ink)'
    },
  },
  ghost: {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      e.currentTarget.style.background = 'rgba(201,168,76,0.1)'
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      e.currentTarget.style.background = 'transparent'
    },
  },
} as const

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  to,
  onClick,
  icon,
  className,
}: ButtonProps) {
  const baseClasses = `inline-flex items-center justify-center gap-2 rounded-md cursor-pointer font-semibold ${sizeClasses[size]} ${className ?? ''}`
  const style = {
    ...variantStyles[variant],
    fontFamily: 'var(--font-body)',
    transition: 'all 150ms ease',
    minHeight: '44px',
    textDecoration: 'none',
  }
  const hover = hoverHandlers[variant]

  const content = (
    <>
      {children}
      {icon && <span className="inline-flex">{icon}</span>}
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        className={baseClasses}
        style={style}
        {...hover}
      >
        {content}
      </Link>
    )
  }

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={baseClasses}
        style={style}
        {...hover}
      >
        {content}
      </a>
    )
  }

  return (
    <button
      onClick={onClick}
      className={baseClasses}
      style={style}
      {...hover}
    >
      {content}
    </button>
  )
}
