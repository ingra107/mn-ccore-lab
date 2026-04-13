import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useOnboarding } from '../hooks/useOnboarding'
import { spring } from '../lib/animations'
import { formatBrandName } from './BrandName'

export default function WelcomeBanner() {
  const { dismissed, allComplete, dismiss } = useOnboarding()

  if (dismissed || allComplete) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        transition={spring.default}
        className="mb-4"
        style={{
          minHeight: 44,
          padding: 'var(--sp-sm) var(--sp-lg)',
          backgroundColor: 'var(--surface-1)',
          borderLeft: '3px solid var(--teal-subtle)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--sp-sm)',
        }}
      >
        <span style={{ fontSize: 'var(--text-small)', color: 'var(--ink)' }}>
          Welcome to {formatBrandName('MN-CCORE Lab Hub')} — explore tasks, meetings, and research.
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexShrink: 0 }}>
          <Link
            to="/personal"
            className="portal-footer-link"
            style={{
              fontSize: 'var(--text-small)',
              color: 'var(--teal)',
              textDecoration: 'none',
            }}
          >
            Get started →
          </Link>
          <button
            onClick={dismiss}
            aria-label="Dismiss welcome banner"
            className="p-1 rounded transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--ink-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
