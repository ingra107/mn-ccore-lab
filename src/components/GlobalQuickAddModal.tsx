/**
 * Global quick-add modal — the single canonical capture surface (Decision #5).
 *
 * Open from anywhere via the `q` shortcut (single key, no modifier; only when
 * no input/textarea/contenteditable is focused — matching Ideas' `n` precedent),
 * the floating "+" FAB, or the `mn-ccore:open-quick-add` window event (which
 * lets any surface — QuickCaptureBar, Personal's quick capture — route into this
 * one primitive instead of forking its own capture input).
 *
 * The old Cmd/Ctrl+N binding (S11) was browser-reserved (new window) and could
 * never fire in Chrome/Edge/Firefox.
 *
 * Renders a floating panel with QuickAddTaskInput. On submit it POSTs
 * a new task to the D1 API using the parsed token values.
 */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, X } from 'lucide-react'
import QuickAddTaskInput from './QuickAddTaskInput'
import { parseQuickAddInput } from '../lib/parseQuickAdd'
import { useCreateTask } from '../hooks/useMutations'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import { emailToSlug } from '../lib/emailSlug'
import { ICON_PROPS } from '../lib/iconProps'

// ── Token hint pill ──────────────────────────────────────────

function TokenHint({ prefix, desc, color }: { prefix: string; desc: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '10px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span style={{ color, fontWeight: 700 }}>{prefix}</span>
      <span style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>{desc}</span>
    </span>
  )
}

// ── Modal ────────────────────────────────────────────────────

interface Props {
  isOpen: boolean
  onClose: () => void
}

const PRIORITY_MAP: Record<number, string> = { 1: 'urgent', 2: 'high', 3: 'medium' }

function GlobalQuickAddModal({ isOpen, onClose }: Props) {
  const [value, setValue] = useState('')
  const createTask = useCreateTask()
  const { showSuccess } = useToast()
  const { user } = useAuth()
  const fallbackAssignee = user?.email ? emailToSlug(user.email) : 'nick-ingraham'

  useEffect(() => {
    if (!isOpen) setValue('')
  }, [isOpen])

  const handleSubmit = useCallback(() => {
    const parsed = parseQuickAddInput(value)
    if (!parsed.title.trim()) return

    createTask.mutate({
      title: parsed.title,
      description: parsed.title,
      assignee: parsed.assigneeSlug ?? fallbackAssignee,
      ...(parsed.dueDate ? { due_date: parsed.dueDate } : {}),
      ...(parsed.projectSlug ? { project_id: parsed.projectSlug } : {}),
      ...(parsed.priority ? { priority: PRIORITY_MAP[parsed.priority] ?? 'medium' } : {}),
    }, {
      onSuccess: () => showSuccess('Task created'),
    })

    setValue('')
    onClose()
  }, [value, createTask, onClose, showSuccess, fallbackAssignee])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="gqa-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 'var(--z-modal)',
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
            }}
          />

          {/* Panel */}
          <motion.div
            key="gqa-panel"
            // N1.03: the centering offset must live in the motion values —
            // framer-motion's animated transform REPLACES style.transform, so
            // a style-level translateX(-50%) is silently dropped and the
            // panel's left edge pins to 50vw (overflowing right on phones).
            initial={{ opacity: 0, scale: 0.96, y: -10, x: '-50%' }}
            animate={{ opacity: 1, scale: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, scale: 0.96, y: -10, x: '-50%' }}
            transition={{ duration: 0.18, ease: [0.34, 1.1, 0.64, 1] }}
            style={{
              position: 'fixed',
              top: '22%',
              left: '50%',
              zIndex: 'var(--z-modal)',
              width: '100%',
              maxWidth: 'min(560px, calc(100vw - 32px))',
              padding: '0 var(--sp-lg)',
            }}
          >
            <div
              style={{
                background: 'var(--cream)',
                border: '1px solid rgba(201,168,76,0.28)',
                borderRadius: 'var(--radius-2xl)',
                boxShadow: 'var(--shadow-elevated)',
                overflow: 'hidden',
              }}
            >
              {/* Header bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 16px 10px',
                  borderBottom: '1px solid rgba(201,168,76,0.1)',
                }}
              >
                <Zap {...ICON_PROPS} size={15} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: '10px',
                    color: 'var(--slate)',
                    opacity: 'var(--ink-label)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    fontWeight: 600,
                  }}
                >
                  Quick Add Task
                </span>
                <div style={{ flex: 1 }} />
                <kbd
                  style={{
                    fontSize: '10px',
                    color: 'var(--slate)',
                    opacity: 0.75,
                    background: 'var(--ice)',
                    padding: '1px 5px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(201,168,76,0.15)',
                  }}
                >
                  esc
                </kbd>
                <button
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--slate)',
                    opacity: 0.75,
                    padding: '2px',
                    lineHeight: 1,
                    marginLeft: '4px',
                  }}
                  aria-label="Close quick add"
                >
                  <X {...ICON_PROPS} size={15} />
                </button>
              </div>

              {/* Input area */}
              <div style={{ padding: '14px 16px 10px' }}>
                <QuickAddTaskInput
                  value={value}
                  onChange={setValue}
                  onSubmit={handleSubmit}
                  autoFocus
                />
              </div>

              {/* Footer: token hints + submit */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 16px 14px',
                }}
              >
                <TokenHint prefix="@name"   desc="assignee" color="var(--gold)" />
                <TokenHint prefix="#project" desc="project"  color="var(--teal)" />
                <TokenHint prefix="p1-p3"   desc="priority" color="var(--maroon)" />
                <TokenHint prefix="Apr 15"  desc="due date" color="var(--teal)" />
                <div style={{ flex: 1 }} />
                <button
                  onClick={handleSubmit}
                  disabled={!parseQuickAddInput(value).title.trim()}
                  style={{
                    background: parseQuickAddInput(value).title.trim() ? 'var(--gold)' : 'rgba(201,168,76,0.3)',
                    color: parseQuickAddInput(value).title.trim() ? 'var(--ink)' : 'var(--slate)',
                    border: 'none',
                    borderRadius: 'var(--radius-lg)',
                    cursor: parseQuickAddInput(value).title.trim() ? 'pointer' : 'default',
                    padding: '6px 16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >
                  Add task ↵
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ── Shortcut + global opener ─────────────────────────────────
// S11: the documented capture shortcut is now `q` — a single, interceptable
// key (Cmd/Ctrl+N is browser-reserved and never fired). It only triggers when
// no text field is focused and no modifier is held, matching Ideas' `n`. Any
// surface can also open the canonical modal by dispatching the
// `mn-ccore:open-quick-add` window event (P2-10 — one capture primitive).

export const QUICK_ADD_EVENT = 'mn-ccore:open-quick-add'

/** Dispatch from anywhere to open the single canonical quick-add modal. */
export function openGlobalQuickAdd() {
  window.dispatchEvent(new Event(QUICK_ADD_EVENT))
}

export function useQuickAddShortcut(open: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ignore modified `q` (Cmd+Q quit, Ctrl+Q etc.) and IME composition
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return
      if (e.key !== 'q' && e.key !== 'Q') return
      const target = e.target as HTMLElement
      const tag = target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
      e.preventDefault()
      open()
    }
    document.addEventListener('keydown', handler)
    // P2-10: global event opener so QuickCaptureBar / Personal capture / any
    // future surface route into this one modal instead of forking capture.
    const onEvent = () => open()
    window.addEventListener(QUICK_ADD_EVENT, onEvent)
    return () => {
      document.removeEventListener('keydown', handler)
      window.removeEventListener(QUICK_ADD_EVENT, onEvent)
    }
  }, [open])
}

export default GlobalQuickAddModal
