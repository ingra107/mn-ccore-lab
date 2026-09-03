import { type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import { ICON_PROPS } from '../lib/iconProps'
import { ACCENT_GOLD, withAlpha } from '../lib/taskGrouping'

interface QuickAddFormProps {
  isOpen: boolean
  onToggle: () => void
  onSubmit: () => void
  onCancel: () => void
  children: ReactNode
  triggerLabel?: string
  submitLabel?: string
  className?: string
}

// The dashed-gold "+ Add …" pill. Exported so a sibling toggle in the same
// action row (Meetings "Log Decision", #118) is the same trigger, not a copy.
export function QuickAddTrigger({
  label,
  onClick,
  icon,
  active = false,
  ariaExpanded,
}: {
  label: string
  onClick: () => void
  /** Defaults to the Plus glyph. */
  icon?: ReactNode
  /** Tint the label gold while the thing it toggles is open. */
  active?: boolean
  ariaExpanded?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={ariaExpanded}
      className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium quick-add-trigger hov-border hov-color"
      style={{
        background: 'var(--ice)',
        color: active ? 'var(--gold)' : 'var(--slate)',
        border: `1px dashed ${withAlpha(ACCENT_GOLD, 30)}`,
        transition: 'all 0.2s ease',
        '--hov-border': 'var(--gold)',
        '--hov-color': 'var(--ink)',
      } as React.CSSProperties}
    >
      {icon ?? <Plus {...ICON_PROPS} size={14} />}
      {label}
    </button>
  )
}

export default function QuickAddForm({
  isOpen,
  onToggle,
  onSubmit,
  onCancel,
  children,
  triggerLabel = 'Add',
  submitLabel = 'Add',
  className = '',
}: QuickAddFormProps) {
  return (
    <div className={className}>
      {/* Toggle trigger */}
      <AnimatePresence mode="wait">
        {!isOpen && (
          <motion.div
            key="trigger"
            className="inline-flex"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <QuickAddTrigger label={triggerLabel} onClick={onToggle} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-down form */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="quick-add-form-container p-4 rounded-xl mt-2"
              style={{
                // Recipe A: lift above the dark page bg (gold border + shadow = edge).
                background: 'var(--surface-2)',
                border: `1px solid ${withAlpha(ACCENT_GOLD, 20)}`,
                boxShadow: 'var(--shadow-card)',
              }}
            >
              {children}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${withAlpha(ACCENT_GOLD, 10)}` }}>
                <button
                  type="button"
                  onClick={onCancel}
                  className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: 'transparent',
                    color: 'var(--slate)',
                    border: `1px solid ${withAlpha(ACCENT_GOLD, 15)}`,
                  }}
                >
                  <X {...ICON_PROPS} size={12} />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSubmit}
                  className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: 'var(--gold)',
                    color: '#0f1923',
                    border: 'none',
                  }}
                >
                  <Plus {...ICON_PROPS} size={12} />
                  {submitLabel}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
