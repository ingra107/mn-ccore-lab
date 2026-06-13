import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { ICON_PROPS } from '../lib/iconProps'

interface InlineSelectProps {
  value: string
  options: { value: string; label: string; color?: string }[]
  onChange: (value: string) => void
  size?: 'sm' | 'md'
  /** Force chevron always-visible. Default false — chevron only appears on
   *  row hover / cell focus / button hover (per design ticket § 0 Ask 2).
   *  Set true on high-signal cells like Decisions Outcome where the dropdown
   *  affordance is the primary action. */
  alwaysShowChevron?: boolean
}

export default function InlineSelect({ value, options, onChange, size = 'sm', alwaysShowChevron = false }: InlineSelectProps) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', () => setOpen(false), true)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', () => setOpen(false), true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (open) {
      setFilter('')
      setFocusedIdx(-1)
      setTimeout(() => filterRef.current?.focus(), 0)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!filter) return options
    const lower = filter.toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(lower))
  }, [options, filter])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && focusedIdx >= 0 && filtered[focusedIdx]) {
      e.preventDefault()
      onChange(filtered[focusedIdx].value)
      setOpen(false)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const current = options.find((o) => o.value === value)
  const fontSize = size === 'sm' ? '11px' : '12px'
  const py = size === 'sm' ? '2px' : '4px'

  return (
    <>
      <button
        ref={buttonRef}
        className="inline-select-trigger hov-bg hov-border"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(!open)
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: `${py} 8px`,
          // Phase 7 (2026-05-27): WCAG 2.5.8 minimum tap target 24x24 CSS px.
          // sm tile was 11px font + 2px py = ~16px tall on touch — bumped
          // to a 24px floor while leaving visual padding alone so layouts
          // don't reflow noticeably.
          minHeight: '24px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid transparent',
          background: 'none',
          cursor: 'pointer',
          fontSize,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: current?.color || 'var(--slate)',
          transition: 'background-color var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out), box-shadow var(--duration-normal) var(--ease-out)',
          '--hov-bg': open ? 'none' : 'var(--teal-hover)',
          '--hov-border': open ? 'transparent' : 'var(--border-subtle)',
        } as React.CSSProperties}
      >
        {/* N1.01: inline-flex children don't ellipsize a bare text node —
            without this span the label hard-clips mid-word in narrow cells. */}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {current?.label || value}
        </span>
        <ChevronDown {...ICON_PROPS}
          size={10}
          className={alwaysShowChevron ? 'inline-select-chevron-always' : 'inline-select-chevron'}
        />
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          role="listbox"
          aria-label="Select options"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            background: 'var(--cream)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-menu)',
            zIndex: 'var(--z-toast)',
            minWidth: '120px',
            overflow: 'hidden',
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          {options.length >= 5 && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <input
                ref={filterRef}
                value={filter}
                onChange={(e) => { setFilter(e.target.value); setFocusedIdx(0) }}
                onKeyDown={handleKeyDown}
                placeholder="Filter..."
                style={{
                  width: '100%',
                  fontSize: 'var(--text-small)',
                  color: 'var(--ink)',
                  background: 'var(--field-bg)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--sp-xs) var(--sp-sm)',
                  outline: 'none',
                }}
              />
            </div>
          )}
          {filtered.map((opt, idx) => (
            <button
              key={opt.value}
              role="option"
              aria-selected={opt.value === value ? "true" : "false"}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange(opt.value)
                setOpen(false)
              }}
              onMouseEnter={() => setFocusedIdx(idx)}
              onMouseLeave={() => setFocusedIdx(-1)}
              onKeyDown={handleKeyDown}
              style={{
                display: 'block',
                width: '100%',
                padding: 'var(--sp-sm) var(--sp-md)',
                border: 'none',
                background: idx === focusedIdx
                  ? 'var(--teal-active)'
                  : opt.value === value
                    ? 'var(--teal-hover)'
                    : 'none',
                cursor: 'pointer',
                fontSize,
                fontWeight: opt.value === value ? 600 : 400,
                color: opt.color || 'var(--ink)',
                textAlign: 'left',
                transition: 'background-color var(--duration-fast) var(--ease-out)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
