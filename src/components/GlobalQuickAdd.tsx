/**
 * Global quick-add modal — open from anywhere via Cmd+N / Ctrl+N.
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

// ── Token hint pill ──────────────────────────────────────────

function TokenHint({ prefix, desc, color }: { prefix: string; desc: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '10px',
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

  useEffect(() => {
    if (!isOpen) setValue('')
  }, [isOpen])

  const handleSubmit = useCallback(() => {
    const parsed = parseQuickAddInput(value)
    if (!parsed.title.trim()) return

    createTask.mutate({
      title: parsed.title,
      description: parsed.title,
      assignee: parsed.assigneeSlug ?? 'nick-ingraham',
      ...(parsed.dueDate ? { due_date: parsed.dueDate } : {}),
      ...(parsed.projectSlug ? { project_id: parsed.projectSlug } : {}),
      ...(parsed.priority ? { priority: PRIORITY_MAP[parsed.priority] ?? 'medium' } : {}),
    }, {
      onSuccess: () => showSuccess('Task created'),
    })

    setValue('')
    onClose()
  }, [value, createTask, onClose, showSuccess])

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
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.18, ease: [0.34, 1.1, 0.64, 1] }}
            style={{
              position: 'fixed',
              top: '22%',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 'var(--z-modal)',
              width: '100%',
              maxWidth: '560px',
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
                <Zap size={15} style={{ color: 'var(--gold)', flexShrink: 0 }} />
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
                  <X size={15} />
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

// ── Hook: Cmd+N / Ctrl+N shortcut ───────────────────────────

export function useQuickAddShortcut(open: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const modKey = isMac ? e.metaKey : e.ctrlKey
      if (modKey && e.key === 'n') {
        const target = e.target as HTMLElement
        const tag = target.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
        e.preventDefault()
        open()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])
}

export default GlobalQuickAddModal
