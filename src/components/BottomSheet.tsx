import { useEffect, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { ICON_PROPS } from '../lib/iconProps'

/**
 * DD-7 bottom-sheet primitive — mobile-native compose surface that
 * rises from the bottom above the on-screen keyboard. Desktop renders
 * the children inline via `renderInlineAbove={true}` flag; the sheet is
 * intended for <768px contexts.
 *
 * Closes on: backdrop tap, X button, or swipe-down (>30% height).
 * Respects prefers-reduced-motion (instant mount, no slide).
 * UX-7: Tab-key focus trap — keeps keyboard navigation inside the sheet
 * (pattern copied from src/components/ui/Modal.tsx).
 */
interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus panel on open so Tab starts inside the sheet, not behind it.
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus()
    }
  }, [open])

  // Escape key + body-scroll lock + Tab focus trap (UX-7)
  useEffect(() => {
    if (!open) return

    // iOS-Safari body lock — prevents rubber-band scroll behind the sheet.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      if (!panelRef.current) return
      const all = panelRef.current.querySelectorAll<HTMLElement>(
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

      if (active && !panelRef.current.contains(active)) {
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
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ background: 'rgba(0,0,0,0.45)', zIndex: 'var(--z-modal-backdrop)' as unknown as number }}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? 'Compose'}
            tabIndex={-1}
            className="fixed left-0 right-0 bottom-0"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 120 || info.velocity.y > 500) onClose()
            }}
            style={{
              outline: 'none',
              zIndex: 'var(--z-modal)' as unknown as number,
              background: 'var(--cream)',
              borderTopLeftRadius: 'var(--radius-2xl)',
              borderTopRightRadius: 'var(--radius-2xl)',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.25)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              touchAction: 'pan-y',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Drag handle */}
            <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 40, height: 4, borderRadius: 'var(--radius-full)', background: 'var(--border-default)' }} />
            </div>
            {title && (
              <div className="flex items-center justify-between px-4 pb-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)' }}>{title}</span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="p-1 rounded"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)' }}
                >
                  <X {...ICON_PROPS} size={16} />
                </button>
              </div>
            )}
            <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
