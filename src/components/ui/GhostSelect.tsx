/**
 * GhostSelect — opaque themed dropdown (Rule 45)
 *
 * Trigger: pill ghost resting state (value text + ▾, hover tint, focus teal
 * border). Menu: custom popover via createPortal. Fully opaque bg (var(--cream)
 * = #ffffff light / ~#0f1923 dark). Never translucent + backdrop-filter.
 *
 * ARIA: trigger has role="combobox" (searchable) or "button", aria-haspopup,
 * aria-expanded. Menu has role="listbox". Options have role="option" +
 * aria-selected.
 * Keyboard: Enter/Space open, ArrowUp/Down navigate filtered list, Esc closes.
 *
 * Scroll tracking: menu repositions on scroll/resize (rAF-throttled) instead
 * of closing, so the trigger stays anchored while the user scrolls.
 *
 * Usage:
 *   <GhostSelect
 *     aria-label="Status"
 *     value="todo"
 *     onChange={v => handleChange(v)}
 *     options={[{ value: 'todo', label: 'To Do' }, ...]}
 *     searchable  // enables combobox search input in the menu
 *   />
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { usePortalDropdown, type PortalDropdownPosition } from '../../hooks/usePortalDropdown'

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
  /**
   * When true: renders a search input at the top of the menu (combobox
   * pattern). Arrow keys navigate the filtered list; typing narrows it.
   * Best for long option lists (e.g. 60+ projects).
   */
  searchable?: boolean
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
  searchable,
}: GhostSelectProps) {
  const [open, setOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const currentOption = options.find((o) => o.value === value)
  const displayLabel = triggerLabel ?? (currentOption?.label ?? value)

  // Filtered option list — only active when menu is open
  const filteredOptions = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const closeMenu = useCallback(() => setOpen(false), [])
  // #90: clamp `top` (not maxHeight) into the viewport so the fixed 300px
  // menu never runs off the bottom/right edge — GhostSelect's menu height
  // is constant (list + optional sticky search), so repositioning it as a
  // whole keeps it fully visible rather than truncating content.
  const getPosition = useCallback((rect: DOMRect): PortalDropdownPosition => ({
    top: Math.min(rect.bottom + 4, window.innerHeight - 308),
    left: Math.min(rect.left, window.innerWidth - 160),
    minWidth: rect.width,
    maxHeight: 300,
  }), [])
  const { triggerRef, menuRef, pos } = usePortalDropdown<HTMLButtonElement>({ open, onClose: closeMenu, getPosition })

  // Open/close side effects local to GhostSelect (focus/filter state, not
  // portal positioning — that's usePortalDropdown's concern). Adjusted during
  // render (React's "adjusting state when a prop changes" pattern) rather
  // than an effect; the joined key mirrors the effect's old dependency tuple.
  const menuKey = `${open}|${options.map((o) => o.value).join('␟')}|${value}`
  const [prevMenuKey, setPrevMenuKey] = useState(menuKey)
  if (menuKey !== prevMenuKey) {
    setPrevMenuKey(menuKey)
    if (!open) {
      setFocusedIdx(-1)
      setQuery('')
    } else {
      // Pre-select the current value index so arrow keys start from there
      const idx = options.findIndex((o) => o.value === value)
      setFocusedIdx(idx >= 0 ? idx : 0)
    }
  }

  // When searchable: auto-focus the search input when the menu opens
  useEffect(() => {
    if (!open || !searchable) return
    // Small delay so the portal is rendered before we focus
    const t = setTimeout(() => searchRef.current?.focus(), 16)
    return () => clearTimeout(t)
  }, [open, searchable])

  // When NOT searchable: focus first option row when menu opens
  useEffect(() => {
    if (!open || searchable) return
    const first = menuRef.current?.querySelector<HTMLElement>('[role="option"]')
    first?.focus()
  }, [open, searchable, menuRef])

  // Reset focused index when filter changes. Same render-time-adjustment
  // pattern as above.
  const filterKey = `${query}|${filteredOptions.length}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setFocusedIdx(filteredOptions.length > 0 ? 0 : -1)
  }

  const closeAndRefocus = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [triggerRef])

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
    } else {
      // When menu is open and focus is on the trigger (non-searchable case)
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault()
        closeAndRefocus()
      }
    }
  }

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    const listLen = filteredOptions.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx((i) => Math.min(i + 1, listLen - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = filteredOptions[focusedIdx]
      if (pick) { onChange(pick.value); setOpen(false) }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeAndRefocus()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      closeAndRefocus()
    }
  }

  const menuId = `ghost-select-menu-${ariaLabel.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <>
      {/* ── Trigger ── */}
      <button
        ref={triggerRef}
        type="button"
        role={searchable ? 'combobox' : 'button'}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? menuId : undefined}
        aria-autocomplete={searchable ? 'list' : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 10px 3px 10px',
          borderRadius: 'var(--radius-full)',
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
          transition: 'background 0.12s, border-color 0.12s',
          fontFamily: 'inherit',
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
          id={menuId}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={handleMenuKeyDown}
          tabIndex={-1}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            minWidth: Math.max(pos.minWidth, 140),
            maxHeight: pos.maxHeight,
            overflowY: 'auto',
            backgroundColor: 'var(--cream)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-menu)',
            zIndex: 9999,
            outline: 'none',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search input — pinned at top, auto-focused when searchable */}
          {searchable && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleMenuKeyDown}
                placeholder="Search…"
                aria-label={`Search ${ariaLabel} options`}
                style={{
                  width: '100%',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '4px 8px',
                  fontSize: 'var(--label-size)',
                  color: 'var(--ink)',
                  background: 'var(--cream)',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--teal)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
              />
            </div>
          )}

          {/* Options list — scrollable below the search bar */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.70 }}>
                No matches
              </div>
            ) : filteredOptions.map((opt, idx) => {
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
                    borderBottom: idx < filteredOptions.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    cursor: 'pointer',
                    color: opt.color ?? 'var(--ink)',
                    backgroundColor: focused ? 'var(--teal-active)' : selected ? 'var(--hover-subtle)' : 'transparent',
                    fontWeight: selected ? 600 : 400,
                    outline: 'none',
                    fontFamily: 'inherit',
                    flexShrink: 0,
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
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
