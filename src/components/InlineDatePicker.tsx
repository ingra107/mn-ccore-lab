import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, CalendarDays } from 'lucide-react'
import { formatShortDate } from '../lib/dateUtils'
import { ICON_PROPS } from '../lib/iconProps'
import { usePortalDropdown, type PortalDropdownPosition } from '../hooks/usePortalDropdown'

interface InlineDatePickerProps {
  value: string | null
  onChange: (date: string | null) => void
}

// ── date helpers (local, no UTC drift) ──────────────────────────────────────
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseYmd(s: string): Date {
  // noon avoids the DST / timezone date-shift on `new Date('YYYY-MM-DD')`.
  return new Date(s + 'T12:00:00')
}
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// P1-3: a single first-click popover — presets row + full in-app month grid
// (keyboard: arrows move day, Enter commits, Esc cancels; today ringed,
// selection in gold) + Clear in the footer. No native <input type=date> edit
// mode remains. Pick a day or preset → optimistic write + close. The
// { value, onChange } contract is unchanged, so every consumer (ListView,
// Deadlines, Today drawer via DateInput/DueInlineSelect, Insights, grid)
// keeps working without edits.
export default function InlineDatePicker({ value, onChange }: InlineDatePickerProps) {
  const [open, setOpen] = useState(false)

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayStr = ymd(today)
  const dueDate = value ? parseYmd(value) : null
  const isOverdue = dueDate && dueDate < today
  const isToday = dueDate && dueDate.toDateString() === today.toDateString()
  const isTomorrow = dueDate && dueDate.toDateString() === new Date(today.getTime() + 86400000).toDateString()
  const isThisWeek = dueDate && !isOverdue && !isToday && !isTomorrow && dueDate < new Date(today.getTime() + 7 * 86400000)

  // The month currently shown in the grid, and the keyboard "focus" day.
  const [cursor, setCursor] = useState<Date>(() => (value ? parseYmd(value) : today))
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = value ? parseYmd(value) : today
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  // #383: consolidate onto usePortalDropdown. This popover never had scroll/
  // resize handling — its first portal iteration (GH #24, 2026-04-22)
  // computed position once at render with no listener, and the P1-3 rewrite
  // (b1fdb7a0) kept that shape. In its real mount contexts (ListView's
  // virtualized scrollRef, TaskGridView's board, Deadlines/Insights page
  // scroll) a mid-open scroll left the popover stuck at a stale position,
  // detached from its trigger — worse than InlineSelect's old close-on-
  // scroll, since it neither followed nor closed. minWidth/maxHeight below
  // are unused by this component's JSX (it keeps its fixed `width: 248` and
  // unclamped intrinsic height) but required by the shared position shape.
  // Outside-click still closes WITHOUT committing (the value only changes
  // when a day/preset is actually picked) — `onClose` here is a pure
  // setOpen(false), matching the removed handler exactly.
  const getPosition = useCallback((rect: DOMRect): PortalDropdownPosition => ({
    top: Math.min(rect.bottom + 4, window.innerHeight - 320),
    left: Math.min(rect.left, window.innerWidth - 256),
    minWidth: 248,
    maxHeight: 320,
  }), [])
  const closeMenu = useCallback(() => setOpen(false), [])
  const { triggerRef, menuRef, pos } = usePortalDropdown<HTMLDivElement>({ open, onClose: closeMenu, getPosition })

  // Reset the grid to the current value each time the popover opens.
  useEffect(() => {
    if (!open) return
    const base = value ? parseYmd(value) : today
    setCursor(base)
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1))
    // focus the popover so arrow keys land here, not the page
    requestAnimationFrame(() => menuRef.current?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value])

  const commit = useCallback((next: string | null) => {
    if (next !== value) onChange(next)   // optimistic write
    setOpen(false)
  }, [value, onChange])

  const presets = useMemo(() => {
    const tmrw = new Date(today.getTime() + 86400000)
    const nextMon = new Date(today.getTime() + ((8 - today.getDay()) % 7 || 7) * 86400000)
    const plusWeek = new Date(today.getTime() + 7 * 86400000)
    return [
      { label: 'Today', value: todayStr },
      { label: 'Tomorrow', value: ymd(tmrw) },
      { label: 'Next Mon', value: ymd(nextMon) },
      { label: '+1 Week', value: ymd(plusWeek) },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr])

  // grid cells for viewMonth (leading blanks for the first weekday)
  const cells = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
    const lead = first.getDay()
    const out: (Date | null)[] = []
    for (let i = 0; i < lead; i++) out.push(null)
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d))
    return out
  }, [viewMonth])

  const moveCursor = useCallback((deltaDays: number) => {
    setCursor((c) => {
      const next = new Date(c.getFullYear(), c.getMonth(), c.getDate() + deltaDays)
      setViewMonth((vm) => (next.getMonth() !== vm.getMonth() || next.getFullYear() !== vm.getFullYear())
        ? new Date(next.getFullYear(), next.getMonth(), 1) : vm)
      return next
    })
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); moveCursor(-1); break
      case 'ArrowRight': e.preventDefault(); moveCursor(1); break
      case 'ArrowUp': e.preventDefault(); moveCursor(-7); break
      case 'ArrowDown': e.preventDefault(); moveCursor(7); break
      case 'PageUp': e.preventDefault(); setViewMonth((vm) => new Date(vm.getFullYear(), vm.getMonth() - 1, 1)); break
      case 'PageDown': e.preventDefault(); setViewMonth((vm) => new Date(vm.getFullYear(), vm.getMonth() + 1, 1)); break
      case 'Enter': e.preventDefault(); commit(ymd(cursor)); break
      case 'Escape': e.preventDefault(); setOpen(false); break
      case 'Backspace': case 'Delete': e.preventDefault(); commit(null); break
    }
  }

  return (
    <div ref={triggerRef} style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="inline-flex items-center gap-1 rounded-md transition-colors hov-bg"
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          // #82 (Nick 2026-06-24): hover shows the ghost tint ONLY — no outline
          // box. A box on top of the ghost is duplicative (matches the project
          // GhostSelect, which tints on hover and borders only on focus).
          padding: '3px 8px',
          border: '1px solid transparent',
          background: 'none',
          cursor: 'pointer',
          fontSize: 'var(--text-label)',
          fontWeight: isOverdue || isToday ? 500 : 400,
          color: isOverdue ? 'var(--maroon)' : isToday ? 'var(--teal)' : isThisWeek ? 'var(--gold)' : 'var(--slate)',
          opacity: 0.85,
          fontVariantNumeric: 'tabular-nums',
          '--hov-bg': 'var(--teal-hover)',
        } as React.CSSProperties}
      >
        <CalendarDays {...ICON_PROPS} size={11} />
        <span>{!value ? 'Set date' : isOverdue
          ? (() => { const days = Math.ceil((today.getTime() - dueDate!.getTime()) / 86400000); return days === 1 ? 'Yesterday' : `${days}d ago` })()
          : isToday ? 'Today' : isTomorrow ? 'Tomorrow'
          : isThisWeek ? (() => { const days = Math.ceil((dueDate!.getTime() - today.getTime()) / 86400000); return `in ${days}d` })()
          : formatShortDate(value)
        }</span>
        <ChevronDown {...ICON_PROPS} size={10} style={{ opacity: 0.85 }} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label="Choose a date"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: 248,
            background: 'var(--cream)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-menu)',
            zIndex: 'var(--z-toast)',
            padding: 8,
            outline: 'none',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {/* presets */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {presets.map((p) => (
              <button
                key={p.label}
                onMouseDown={(e) => { e.preventDefault(); commit(p.value) }}
                style={{
                  flex: 1, padding: '4px 2px', borderRadius: 'var(--radius-md)', border: 'none',
                  fontSize: 10, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: value === p.value ? 'var(--teal-emphasis)' : 'transparent',
                  color: value === p.value ? 'var(--teal)' : 'var(--slate)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* month header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <button
              aria-label="Previous month"
              onMouseDown={(e) => { e.preventDefault(); setViewMonth((vm) => new Date(vm.getFullYear(), vm.getMonth() - 1, 1)) }}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', fontSize: 14, padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}
            >‹</button>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</span>
            <button
              aria-label="Next month"
              onMouseDown={(e) => { e.preventDefault(); setViewMonth((vm) => new Date(vm.getFullYear(), vm.getMonth() + 1, 1)) }}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--slate)', fontSize: 14, padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}
            >›</button>
          </div>

          {/* weekday labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, color: 'var(--slate)', opacity: 0.7, letterSpacing: '0.04em' }}>{w}</div>
            ))}
          </div>

          {/* day grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={`b${i}`} />
              const ds = ymd(d)
              const isSel = value === ds
              const isCur = ds === ymd(cursor)
              const isTod = ds === todayStr
              return (
                <button
                  key={ds}
                  onMouseEnter={() => setCursor(d)}
                  onMouseDown={(e) => { e.preventDefault(); commit(ds) }}
                  style={{
                    aspectRatio: '1 / 1', display: 'grid', placeItems: 'center',
                    border: isTod && !isSel ? '1px solid var(--teal)' : '1px solid transparent',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 11.5, fontWeight: isSel ? 600 : 400, cursor: 'pointer',
                    background: isSel ? 'var(--gold)' : isCur ? 'var(--teal-hover)' : 'transparent',
                    color: isSel ? '#1a1a1a' : 'var(--ink)',
                    outline: 'none',
                  }}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          {/* footer — clear */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onMouseDown={(e) => { e.preventDefault(); commit(null) }}
              disabled={!value}
              style={{
                border: 'none', background: 'transparent', cursor: value ? 'pointer' : 'default',
                color: value ? 'var(--maroon)' : 'var(--slate)', opacity: value ? 0.85 : 0.4,
                fontSize: 11, fontWeight: 500, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
              }}
            >
              Clear
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
