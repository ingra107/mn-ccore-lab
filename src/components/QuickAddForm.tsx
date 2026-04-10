import { type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X } from 'lucide-react'

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
          <motion.button
            key="trigger"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onToggle}
            className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium quick-add-trigger"
            style={{
              background: 'var(--ice)',
              color: 'var(--slate)',
              border: '1px dashed rgba(201,168,76,0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--gold)'
              e.currentTarget.style.color = 'var(--ink)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(201,168,76,0.3)'
              e.currentTarget.style.color = 'var(--slate)'
            }}
          >
            <Plus size={14} />
            {triggerLabel}
          </motion.button>
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
                background: 'var(--cream)',
                border: '1px solid rgba(201,168,76,0.2)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              {children}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(201,168,76,0.1)' }}>
                <button
                  type="button"
                  onClick={onCancel}
                  className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: 'transparent',
                    color: 'var(--slate)',
                    border: '1px solid rgba(201,168,76,0.15)',
                  }}
                >
                  <X size={12} />
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
                  <Plus size={12} />
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
