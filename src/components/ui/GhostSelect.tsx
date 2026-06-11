/**
 * GhostSelect — opaque themed dropdown (Rule 45)
 *
 * Trigger: ghost resting state (value text + ▾, hover tint, focus teal border).
 * Menu: custom popover via createPortal. Fully opaque bg (var(--cream) =
 * #ffffff light / ~#0f1923 dark). Never translucent + backdrop-filter.
 *
 * ARIA: trigger has role="button", aria-haspopup="listbox", aria-expanded.
 * Menu has role="listbox". Options have role="option" + aria-selected.
 * Keyboard: Enter/Space open, ArrowUp/Down navigate, Esc closes.
 *
 * Usage:
 *   <GhostSelect
 *     aria-label="Status"
 *     value="todo"
 *     onChange={v => handleChange(v)}
 *     options={[{ value: 'todo', label: 'To Do' }, ...]}
 *   />
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

export interface GhostSelectOption {
  value: string
  label: string
  /** Optional style overrides for the option row text color */
  color?: string
}

export interface GhostSelectProps {
  'aria-label': string
  value: string
  onChange: (v: string) => void
  options: GhostSelectOption[]
  /** Override displayed trigger text (defaults to the matched option label) */
  triggerLabel?: string
  /** Override trigger text color (e.g. var(--teal) for project select) */
  triggerColor?: string
  /** Additional style applied to the trigger button wrapper */
  triggerStyle?: React.CSSProperties
  /** Optional max-width on the trigger */
  maxWidth?: number
}

export default function GhostSelect({
  'aria-label': ariaLabel,
  value,
  onChange,
  options,
  triggerLabel,
  triggerColor,
  triggerStyle,
  maxWidth,
}: GhostSelectProps) {
  const [open, setOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, minWidth: 0 })

  const currentOption = options.find((o) => o.value === value)
  const displayLabel = triggerLabel ?? (currentOption?.label ?? value)

  // Position the portal dropdown flush below the trigger button
  const computePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width })
  }, [])

  // Open/close side effects
  useEffect(() => {
    if (!open) {
      setFocusedIdx(-1)
      return
    }
    computePosition()
    // Pre-select the current value index so arrow keys start from there
    const idx = options.findIndex((o) => o.value === value)
    setFocusedIdx(idx >= 0 ? idx : 0)

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      const inTrigger = triggerRef.current?.contains(target)
      const inMenu = menuRef.current?.contains(target)
      if (!inTrigger && !inMenu) setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, computePosition, options, value])

  // Focus first option row when menu opens
  useEffect(() => {
    if (!open) return
    const first = menuRef.current?.querySelector<HTMLElement>('[role="option"]')
    first?.focus()
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = options[focusedIdx]
      if (pick) { onChange(pick.value); setOpen(false) }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
  }

  return (
    <>
      {/* ── Trigger ── */}
      <button
        ref={triggerRef}
        type="button"
        role="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        className="rounded-md text-xs transition-colors"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '3px 6px 3px 8px',
          fontSize: 'var(--label-size)',
          color: triggerColor ?? 'var(--ink)',
          background: 'transparent',
          border: '1px solid transparent',
          cursor: 'pointer',
          outline: 'none',
          whiteSpace: 'nowrap',
          maxWidth: maxWidth ?? undefined,
          overflow: maxWidth ? 'hidden' : undefined,
          textOverflow: maxWidth ? 'ellipsis' : undefined,
          ...triggerStyle,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-subtle)' }}
        onMouseLeave={(e) => {
          if (document.activeElement !== e.currentTarget) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--teal)'
          e.currentTarget.style.background = 'transparent'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'transparent'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <span style={{ flex: 1, overflow: maxWidth ? 'hidden' : undefined, textOverflow: maxWidth ? 'ellipsis' : undefined, whiteSpace: 'nowrap' }}>
          {displayLabel}
        </span>
        <span aria-hidden="true" style={{ fontSize: 9, color: 'var(--slate)', opacity: 0.70, flexShrink: 0 }}>▾</span>
      </button>

      {/* ── Portal menu ── */}
      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={handleKeyDown}
          tabIndex={-1}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            minWidth: Math.max(pos.minWidth, 140),
            maxHeight: 280,
            overflowY: 'auto',
            backgroundColor: 'var(--cream)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-menu)',
            zIndex: 9999,
            outline: 'none',
          }}
        >
          {options.map((opt, idx) => {
            const selected = opt.value === value
            const focused = idx === focusedIdx
            return (
              <button
                key={opt.value}
                role="option"
                aria-selected={selected ? 'true' : 'false'}
                type="button"
                tabIndex={focused ? 0 : -1}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                onMouseEnter={() => setFocusedIdx(idx)}
                className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                style={{
                  border: 'none',
                  borderBottom: idx < options.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  cursor: 'pointer',
                  color: opt.color ?? 'var(--ink)',
                  backgroundColor: focused ? 'var(--teal-active)' : selected ? 'var(--hover-subtle)' : 'transparent',
                  fontWeight: selected ? 600 : 400,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ flex: 1 }}>{opt.label}</span>
                {selected && (
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ color: 'var(--teal)', flexShrink: 0 }}>
                    <path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
