import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Circle, CheckCircle2, Clock, Ban, ChevronRight,
  Check, Copy, Link, Archive, Eye, ArrowRight,
} from 'lucide-react'
import type { TaskRow } from '../../lib/api'
import type { ContextMenuState } from '../../hooks/useContextMenu'
import { STATUS_CONFIG, PRIORITY_CONFIG } from '../../lib/taskConstants'

// ── Constants ──────────────────────────────────────────────────

const STATUS_ICON_MAP: Record<string, typeof Circle> = {
  Circle,
  Clock,
  CheckCircle2,
  Ban,
}

const STATUS_ITEMS = (Object.entries(STATUS_CONFIG) as [string, typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]][]).map(
  ([value, cfg]) => ({
    value,
    label: cfg.label,
    icon: STATUS_ICON_MAP[cfg.icon] || Circle,
    color: cfg.color,
  })
)

const PRIORITY_ITEMS = (Object.entries(PRIORITY_CONFIG) as [string, typeof PRIORITY_CONFIG[keyof typeof PRIORITY_CONFIG]][]).map(
  ([value, cfg]) => ({
    value,
    label: cfg.label,
    color: cfg.color,
  })
)

// ── Types ──────────────────────────────────────────────────────

interface TaskContextMenuProps {
  state: ContextMenuState
  task: TaskRow | null
  onClose: () => void
  onStatusChange: (id: string, status: string) => void
  onFieldChange?: (id: string, field: string, value: unknown) => void
  onOpenDetail?: (task: TaskRow) => void
  onPeek?: (task: TaskRow) => void
  onArchive?: (task: TaskRow) => void
}

// ── Styles ─────────────────────────────────────────────────────

const menuStyles: React.CSSProperties = {
  position: 'fixed',
  zIndex: 9999,
  minWidth: '200px',
  background: '#111820',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  padding: '4px 0',
  fontSize: '13px',
  color: 'var(--ink, #e2e8f0)',
  fontWeight: 400,
}

const itemStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  width: '100%',
  padding: '6px 12px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 400,
  color: 'var(--ink, #e2e8f0)',
  textAlign: 'left',
  transition: 'background 100ms ease',
}

const shortcutStyles: React.CSSProperties = {
  color: 'var(--slate, #94a3b8)',
  opacity: 0.4,
  fontSize: '11px',
  fontWeight: 400,
  marginLeft: 'auto',
  flexShrink: 0,
}

const dividerStyles: React.CSSProperties = {
  height: '1px',
  background: 'var(--border-subtle)',
  margin: '4px 0',
}

const submenuIndicatorStyles: React.CSSProperties = {
  opacity: 0.3,
  flexShrink: 0,
}

// ── MenuItem Component (shared hover pattern) ─────────────────

function MenuItem({
  onClick,
  style,
  children,
}: {
  onClick: () => void
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <button
      className="context-menu-item"
      style={{ ...itemStyles, ...style }}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// ── Submenu Component ──────────────────────────────────────────

function SubmenuItem({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const itemRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleMouseEnter = () => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setOpen(true), 80)
  }

  const handleMouseLeave = () => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setOpen(false), 150)
  }

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  // Calculate submenu position
  const getSubmenuStyle = (): React.CSSProperties => {
    if (!itemRef.current) return { position: 'absolute', left: '100%', top: 0 }
    const rect = itemRef.current.getBoundingClientRect()
    const submenuWidth = 160
    const viewportWidth = window.innerWidth

    // Open to the left if not enough room on the right
    const openLeft = rect.right + submenuWidth > viewportWidth

    return {
      position: 'fixed',
      top: `${rect.top - 4}px`,
      left: openLeft ? `${rect.left - submenuWidth - 2}px` : `${rect.right + 2}px`,
      minWidth: `${submenuWidth}px`,
      ...menuStyles,
      zIndex: 10000,
    }
  }

  return (
    <div
      ref={itemRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative' }}
    >
      <div
        style={{
          ...itemStyles,
          background: open ? 'rgba(201,168,76,0.06)' : 'none',
        }}
      >
        <span>{label}</span>
        <ChevronRight size={12} style={submenuIndicatorStyles} />
      </div>

      {open && (
        <div
          style={getSubmenuStyle()}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export default function TaskContextMenu({
  state,
  task,
  onClose,
  onStatusChange,
  onFieldChange,
  onOpenDetail,
  onPeek,
  onArchive,
}: TaskContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [adjustedPos, setAdjustedPos] = useState(state.position)

  // Adjust position to keep menu within viewport
  useEffect(() => {
    if (!state.isOpen || !menuRef.current) return

    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let { x, y } = state.position

    if (x + rect.width > vw - 8) x = vw - rect.width - 8
    if (y + rect.height > vh - 8) y = vh - rect.height - 8
    if (x < 8) x = 8
    if (y < 8) y = 8

    setAdjustedPos({ x, y })
  }, [state.isOpen, state.position])

  // Close on Escape
  useEffect(() => {
    if (!state.isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [state.isOpen, onClose])

  // Close on click outside
  useEffect(() => {
    if (!state.isOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Use setTimeout to avoid immediately closing from the contextmenu event
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [state.isOpen, onClose])

  const handleAction = useCallback((action: () => void) => {
    action()
    onClose()
  }, [onClose])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    })
  }, [])

  if (!state.isOpen || !task) return null

  const menu = (
    <div
      ref={menuRef}
      style={{
        ...menuStyles,
        left: `${adjustedPos.x}px`,
        top: `${adjustedPos.y}px`,
        opacity: 0,
        transform: 'scale(0.95)',
        animation: 'contextMenuIn 100ms ease-out forwards',
      }}
    >
      {/* Status submenu */}
      <SubmenuItem label="Status">
        {STATUS_ITEMS.map((s) => {
          const Icon = s.icon
          const isCurrent = task.status === s.value
          return (
            <MenuItem
              key={s.value}
              style={{ color: isCurrent ? 'var(--teal)' : s.color }}
              onClick={() => handleAction(() => onStatusChange(task.id, s.value))}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon size={13} />
                {s.label}
              </span>
              {isCurrent && <Check size={12} style={{ opacity: 0.6 }} />}
            </MenuItem>
          )
        })}
      </SubmenuItem>

      {/* Priority submenu */}
      <SubmenuItem label="Priority">
        {PRIORITY_ITEMS.map((p) => {
          const isCurrent = task.priority === p.value
          return (
            <MenuItem
              key={p.value}
              style={{ color: isCurrent ? 'var(--teal)' : 'var(--ink, #e2e8f0)' }}
              onClick={() => handleAction(() => {
                onFieldChange?.(task.id, 'priority', p.value)
              })}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: p.color,
                  flexShrink: 0,
                }} />
                {p.label}
              </span>
              {isCurrent && <Check size={12} style={{ opacity: 0.6 }} />}
            </MenuItem>
          )
        })}
      </SubmenuItem>

      <div style={dividerStyles} />

      {/* Assign to */}
      {onFieldChange && (
        <MenuItem onClick={() => handleAction(() => { onOpenDetail?.(task) })}>
          <span>Assign to...</span>
        </MenuItem>
      )}

      {/* Set due date */}
      {onFieldChange && (
        <MenuItem onClick={() => handleAction(() => { onOpenDetail?.(task) })}>
          <span>Set due date...</span>
        </MenuItem>
      )}

      <div style={dividerStyles} />

      {/* Open detail panel */}
      {onOpenDetail && (
        <MenuItem onClick={() => handleAction(() => onOpenDetail(task))}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowRight size={13} style={{ opacity: 0.5 }} />
            Open detail panel
          </span>
          <span style={shortcutStyles}>Enter</span>
        </MenuItem>
      )}

      {/* Peek */}
      {onPeek && (
        <MenuItem onClick={() => handleAction(() => onPeek(task))}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Eye size={13} style={{ opacity: 0.5 }} />
            Peek
          </span>
          <span style={shortcutStyles}>Space</span>
        </MenuItem>
      )}

      <div style={dividerStyles} />

      {/* Copy task title */}
      <MenuItem onClick={() => handleAction(() => { copyToClipboard(task.title || task.description) })}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Copy size={13} style={{ opacity: 0.5 }} />
          Copy task title
        </span>
      </MenuItem>

      {/* Copy link */}
      <MenuItem onClick={() => handleAction(() => {
        const url = `${window.location.origin}/portal/tasks?task=${task.id}`
        copyToClipboard(url)
      })}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link size={13} style={{ opacity: 0.5 }} />
          Copy link
        </span>
      </MenuItem>

      <div style={dividerStyles} />

      {/* Archive */}
      <MenuItem onClick={() => handleAction(() => {
        if (onArchive) {
          onArchive(task)
        } else {
          onStatusChange(task.id, 'done')
        }
      })}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Archive size={13} style={{ opacity: 0.5 }} />
          Archive
        </span>
      </MenuItem>
    </div>
  )

  return createPortal(menu, document.body)
}
