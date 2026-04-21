import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { spring } from '../lib/animations'

interface PageTooltipProps {
  /** Unique key for localStorage persistence */
  id: string
  /** Tooltip text */
  text: string
  /** Delay before showing (ms) */
  delay?: number
}

const STORAGE_PREFIX = 'mnccore-tooltip-seen-'
const DISMISS_EVENT = 'mnccore-tooltip-dismiss'

/** Imperatively dismiss a PageTooltip from anywhere — e.g. the first time
 *  a user clicks the surface the hint pointed at. Persists across reloads. */
export function dismissPageTooltip(id: string): void {
  try { localStorage.setItem(STORAGE_PREFIX + id, '1') } catch { /* ok */ }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DISMISS_EVENT, { detail: { id } }))
  }
}

export default function PageTooltip({ id, text, delay = 1500 }: PageTooltipProps) {
  const [visible, setVisible] = useState(false)
  const storageKey = STORAGE_PREFIX + id

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey)) return
    } catch { return }

    const showTimer = setTimeout(() => setVisible(true), delay)
    // Auto-dismiss after 10s of being shown so multi-page nudges don't pile
    // up on the screen. P2-R2-13.
    const autoDismissTimer = setTimeout(() => {
      try { localStorage.setItem(storageKey, '1') } catch { /* ok */ }
      setVisible(false)
    }, delay + 10_000)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(autoDismissTimer)
    }
  }, [storageKey, delay])

  useEffect(() => {
    function onDismiss(e: Event) {
      const detail = (e as CustomEvent<{ id: string }>).detail
      if (detail?.id === id) setVisible(false)
    }
    window.addEventListener(DISMISS_EVENT, onDismiss)
    return () => window.removeEventListener(DISMISS_EVENT, onDismiss)
  }, [id])

  const dismiss = () => {
    setVisible(false)
    try { localStorage.setItem(storageKey, '1') } catch { /* ok */ }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.97 }}
          transition={spring.snappy}
          className="flex items-center gap-2 page-tooltip"
          style={{
            padding: '6px 12px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--ink)',
            color: 'var(--cream)',
            fontSize: 11,
            fontWeight: 400,
            boxShadow: 'var(--shadow-elevated)',
            maxWidth: 'min(92vw, 480px)',
          }}
        >
          <span style={{ minWidth: 0 }}>{text}</span>
          <button
            onClick={dismiss}
            aria-label="Dismiss tooltip"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream)', opacity: 0.7, padding: 4, display: 'flex', minWidth: 24, minHeight: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
