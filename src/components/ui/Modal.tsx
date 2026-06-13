import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useIsMobile } from '../../hooks/useIsMobile'
import { ICON_PROPS } from '../../lib/iconProps'

const MAX_WIDTHS: Record<'sm' | 'md' | 'lg', number> = {
  sm: 420,
  md: 520,
  lg: 640,
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  maxWidth?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  footer?: React.ReactNode
  /**
   * P2-4 responsive shell rule (defined ONCE here):
   *   'responsive' (default) — bottom-sheet < 768px, centered modal >= 768px.
   *   'modal'                — always centered (opt out of the sheet behavior).
   */
  variant?: 'responsive' | 'modal'
}

export default function Modal({ open, onClose, title, maxWidth = 'md', children, footer, variant = 'responsive' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const asSheet = variant === 'responsive' && isMobile

  // Focus panel on open
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus()
    }
  }, [open])

  // Escape key + focus trap
  useEffect(() => {
    if (!open || !panelRef.current) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const all = panelRef.current!.querySelectorAll<HTMLElement>(
        'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
      )
      const focusable = Array.from(all).filter((el) => {
        if (el.hasAttribute('disabled')) return false
        if (el.getAttribute('aria-hidden') === 'true') return false
        const style = window.getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        return true
      })
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (active && !panelRef.current!.contains(active)) {
        e.preventDefault()
        first.focus()
        return
      }
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const maxWidthPx = MAX_WIDTHS[maxWidth]

  const node = (
    /* Backdrop */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: asSheet ? 'flex-end' : 'center',
        justifyContent: 'center',
        zIndex: 'var(--z-modal-backdrop)' as unknown as number,
      }}
      onClick={onClose}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          background: 'var(--cream)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-elevated)',
          zIndex: 'var(--z-modal)' as unknown as number,
          display: 'flex',
          flexDirection: 'column',
          outline: 'none',
          ...(asSheet
            ? {
                // Bottom-sheet: full-width, anchored to the bottom edge, rounded
                // top corners, safe-area padding for the home indicator.
                width: '100%',
                maxWidth: '100%',
                margin: 0,
                borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
                borderBottom: 'none',
                maxHeight: '90vh',
                paddingBottom: 'env(safe-area-inset-bottom)',
                overflow: 'hidden',
              }
            : {
                // Centered modal (desktop / tablet).
                borderRadius: 'var(--radius-xl)',
                width: '90vw',
                maxWidth: `${maxWidthPx}px`,
                margin: '0 var(--sp-lg)',
                maxHeight: '88vh',
                overflow: 'hidden',
              }),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--sp-md) var(--sp-lg)',
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontSize: 'var(--text-body)',
              fontWeight: 'var(--weight-heading)' as unknown as number,
              color: 'var(--ink)',
              margin: 0,
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--slate)',
              padding: 'var(--sp-xs)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X {...ICON_PROPS} size={16} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: 'var(--sp-lg)',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 'var(--sp-sm)',
              padding: 'var(--sp-md) var(--sp-lg)',
              borderTop: '1px solid var(--border-subtle)',
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
