import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Inbox, X, Send } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useProjects } from '../hooks/useApiData'
import { useUndoToast } from './UndoToast'

type InboxTag = 'note' | 'idea' | 'decision' | 'follow-up' | 'meeting-note'

const TAGS: { value: InboxTag; label: string }[] = [
  { value: 'note', label: 'Note' },
  { value: 'idea', label: 'Idea' },
  { value: 'decision', label: 'Decision' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'meeting-note', label: 'Meeting note' },
]

/**
 * Universal Quick Capture → Peripheral Brain inbox.
 *
 * Floating action button on every portal page. Click (or Ctrl/Cmd+I) to open
 * a sheet that captures freeform text with a tag + optional project association
 * and files it to the `inbox` table. The Peripheral Brain pull script turns
 * each row into a markdown file in `Peripheral-Brain/Inbox/` overnight.
 */
export default function QuickCaptureInbox() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [tag, setTag] = useState<InboxTag>('note')
  const [projectId, setProjectId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const { user } = useAuth()
  const { data: projects } = useProjects(undefined, { enabled: open })
  const { showSuccess } = useUndoToast()

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  // Global open: Ctrl+I / Cmd+I + custom event
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
        const target = e.target as HTMLElement | null
        // Allow Ctrl+I even in inputs — it's a global capture shortcut.
        // But skip if user is mid-IME composition.
        if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type === 'password') return
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    const onEvent = () => setOpen((prev) => !prev)
    document.addEventListener('keydown', onKey)
    window.addEventListener('mn-ccore:open-inbox', onEvent)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('mn-ccore:open-inbox', onEvent)
    }
  }, [])

  // Focus trap + Escape + auto-focus textarea on open
  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement
    const focusId = setTimeout(() => textareaRef.current?.focus(), 30)

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      clearTimeout(focusId)
      document.removeEventListener('keydown', handler)
      previousFocusRef.current?.focus?.()
    }
  }, [open, close])

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 300)}px`
  }, [text, open])

  const submit = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/inbox', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          tag,
          project_id: projectId || null,
          author: user?.email || undefined,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setText('')
      setProjectId('')
      showSuccess('Captured → Inbox')
      setTimeout(() => {
        setSubmitting(false)
        close()
      }, 400)
    } catch {
      setSubmitting(false)
      showSuccess('Failed to save — retry')
    }
  }, [text, tag, projectId, user?.email, submitting, showSuccess, close])

  const onTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  const sheet = open ? (
    <div
      className="quick-capture-inbox-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal-backdrop)' as unknown as number,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 'var(--sp-md)',
        animation: 'qci-fade-in 150ms ease-out',
      }}
      onClick={close}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qci-heading"
        onClick={(e) => e.stopPropagation()}
        style={{
          zIndex: 'var(--z-modal)' as unknown as number,
          width: '100%',
          maxWidth: 480,
          background: 'var(--cream)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-elevated, 0 10px 40px rgba(0,0,0,0.3))',
          padding: 'var(--sp-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-md)',
          animation: 'qci-slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2
            id="qci-heading"
            style={{
              margin: 0,
              fontSize: 'var(--text-base)',
              fontWeight: 500,
              color: 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-sm)',
            }}
          >
            <Inbox size={16} style={{ color: 'var(--teal)', opacity: 0.85 }} />
            Quick capture
            <span
              style={{
                fontSize: 'var(--text-micro)',
                fontWeight: 400,
                color: 'var(--ink-label, var(--slate))',
                opacity: 0.7,
                marginLeft: 'var(--sp-xs)',
              }}
            >
              → Peripheral Brain
            </span>
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 'var(--sp-xs)',
              cursor: 'pointer',
              color: 'var(--ink-muted, var(--slate))',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onTextareaKeyDown}
          placeholder="What's on your mind? (Ctrl+Enter to save)"
          rows={3}
          style={{
            width: '100%',
            minHeight: 72,
            maxHeight: 300,
            padding: 'var(--sp-sm) var(--sp-md)',
            background: 'var(--surface-1, transparent)',
            border: '1px solid var(--border-default, var(--border-subtle))',
            borderRadius: 'var(--radius-md)',
            color: 'var(--ink)',
            fontSize: 'var(--text-base)',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            outline: 'none',
            resize: 'none',
            transition: 'border-color 150ms ease',
          }}
        />

        {/* Tag pills */}
        <div
          role="radiogroup"
          aria-label="Entry type"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--sp-xs)',
          }}
        >
          {TAGS.map((t) => {
            const active = tag === t.value
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTag(t.value)}
                style={{
                  padding: '4px 10px',
                  minHeight: 44,
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid',
                  borderColor: active ? 'var(--teal)' : 'var(--border-subtle)',
                  background: active
                    ? 'var(--teal-hover, rgba(45,138,138,0.12))'
                    : 'transparent',
                  color: active ? 'var(--teal)' : 'var(--ink-muted, var(--slate))',
                  fontSize: 'var(--text-label, 11px)',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Project selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            htmlFor="qci-project"
            style={{
              fontSize: 'var(--text-micro, 10px)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--ink-label, var(--slate))',
              opacity: 0.7,
              fontWeight: 500,
            }}
          >
            Project (optional)
          </label>
          <select
            id="qci-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            style={{
              width: '100%',
              padding: 'var(--sp-xs) var(--sp-sm)',
              background: 'var(--surface-1, transparent)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--ink)',
              fontSize: 'var(--text-small, 12px)',
              fontFamily: 'inherit',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">No project</option>
            {(projects || []).map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--sp-sm)',
            marginTop: 'var(--sp-xs)',
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-micro, 10px)',
              color: 'var(--ink-hint, var(--slate))',
              opacity: 0.55,
            }}
          >
            Ctrl+Enter to save · Esc to cancel
          </span>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
            <button
              type="button"
              onClick={close}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--ink-muted, var(--slate))',
                fontSize: 'var(--text-small, 12px)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim() || submitting}
              style={{
                padding: '6px 14px',
                background: 'var(--teal-solid)',
                border: '1px solid var(--teal)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--ink-bright, #fff)',
                fontSize: 'var(--text-small, 12px)',
                fontWeight: 500,
                cursor: !text.trim() || submitting ? 'not-allowed' : 'pointer',
                opacity: !text.trim() || submitting ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'opacity 150ms ease',
              }}
            >
              <Send size={12} />
              Capture
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes qci-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes qci-slide-up {
          from { transform: translateY(16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @media (min-width: 640px) {
          .quick-capture-inbox-root {
            align-items: center !important;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .quick-capture-inbox-root,
          .quick-capture-inbox-root > div {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  ) : null

  return (
    <>
      {/* FAB: positioned above the existing quick-add FAB (bottom: ~36px) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick capture to inbox (Ctrl+I)"
        title="Quick capture to inbox (Ctrl+I)"
        data-testid="fab-quick-capture-inbox"
        className="fixed right-5 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        style={{
          bottom: 'var(--fab-stack-2)',
          width: 44,
          height: 44,
          borderRadius: 'var(--radius-full)',
          background: 'var(--cream)',
          color: 'var(--teal)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-card, 0 2px 8px rgba(0,0,0,0.15))',
          cursor: 'pointer',
          zIndex: 'var(--z-sticky)' as unknown as number,
          opacity: 0.9,
        }}
      >
        <Inbox size={18} strokeWidth={2} />
      </button>

      {typeof document !== 'undefined' && sheet
        ? createPortal(sheet, document.body)
        : null}
    </>
  )
}
