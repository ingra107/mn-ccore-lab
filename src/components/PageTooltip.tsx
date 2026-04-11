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

export default function PageTooltip({ id, text, delay = 1500 }: PageTooltipProps) {
  const [visible, setVisible] = useState(false)
  const storageKey = STORAGE_PREFIX + id

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey)) return
    } catch { return }

    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [storageKey, delay])

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
          className="flex items-center gap-2"
          style={{
            padding: '6px 12px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--ink)',
            color: 'var(--cream)',
            fontSize: 11,
            fontWeight: 400,
            boxShadow: 'var(--shadow-elevated)',
            whiteSpace: 'nowrap',
          }}
        >
          <span>{text}</span>
          <button
            onClick={dismiss}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream)', opacity: 0.5, padding: 0, display: 'flex' }}
          >
            <X size={10} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
