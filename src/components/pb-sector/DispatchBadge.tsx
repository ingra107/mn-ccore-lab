import { useState } from 'react'
import { Send, MessageSquare, ChevronDown, X, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface DispatchItem {
  id: string
  task_id: string | null
  task_title: string | null
  project_slug: string | null
  comment: string
  comment_type: 'action' | 'info'
  created_at: string
}

interface DispatchBadgeProps {
  items: DispatchItem[]
  count: number
  onSend: () => void
  isSending: boolean
}

export default function DispatchBadge({ items, count, onSend, isSending }: DispatchBadgeProps) {
  const [expanded, setExpanded] = useState(false)

  if (count === 0) return null

  return (
    <div className="relative">
      {/* Badge button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors"
        style={{
          background: 'rgba(201,168,76,0.1)',
          border: '1px solid rgba(201,168,76,0.2)',
          cursor: 'pointer',
        }}
      >
        <MessageSquare size={12} style={{ color: 'var(--gold)' }} />
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gold)' }}>
          {count}
        </span>
        <ChevronDown size={10} style={{ color: 'var(--gold)', opacity: 0.6, transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-50 w-80 rounded-lg shadow-lg overflow-hidden"
            style={{ background: 'var(--cream)', border: '1px solid rgba(201,168,76,0.2)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(201,168,76,0.1)' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--gold)' }}>
                Dispatch Queue
              </span>
              <button onClick={() => setExpanded(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <X size={12} style={{ color: 'var(--slate)', opacity: 0.5 }} />
              </button>
            </div>

            {/* Items */}
            <div className="max-h-48 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="px-3 py-2"
                  style={{ borderBottom: '1px solid rgba(201,168,76,0.04)' }}
                >
                  <div className="flex items-start gap-2">
                    <div
                      style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                        background: item.comment_type === 'action' ? 'var(--gold)' : 'var(--slate)',
                        opacity: item.comment_type === 'action' ? 1 : 0.4,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="block" style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ink)', lineHeight: 1.4 }}>
                        {item.comment}
                      </span>
                      {item.task_title && (
                        <span style={{ fontSize: '9px', color: 'var(--slate)', opacity: 0.6 }}>
                          {item.task_title}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Send button */}
            <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(201,168,76,0.1)' }}>
              <button
                onClick={() => { onSend(); setExpanded(false) }}
                disabled={isSending || count === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors"
                style={{
                  fontSize: '11px', fontWeight: 600,
                  background: 'var(--gold)', color: '#fff',
                  border: 'none', cursor: isSending ? 'wait' : 'pointer',
                  opacity: isSending ? 0.7 : 1,
                }}
              >
                {isSending ? (
                  <><Loader2 size={12} className="animate-spin" /> Dispatching...</>
                ) : (
                  <><Send size={12} /> Send to Claude</>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
