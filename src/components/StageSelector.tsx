import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

const STAGES = ['Idea', 'Data Collection', 'Analysis', 'Writing', 'Review', 'Published'] as const
type Stage = (typeof STAGES)[number]

interface StageSelectorProps {
  currentStage: Stage
  onChange: (stage: Stage) => void
  mode?: 'compact' | 'full'
}

export default function StageSelector({ currentStage, onChange, mode = 'compact' }: StageSelectorProps) {
  if (mode === 'full') {
    return <StageSelectorFull currentStage={currentStage} onChange={onChange} />
  }
  return <StageSelectorCompact currentStage={currentStage} onChange={onChange} />
}

function StageSelectorFull({ currentStage, onChange }: { currentStage: Stage; onChange: (stage: Stage) => void }) {
  const currentIndex = STAGES.indexOf(currentStage)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STAGES.map((stage, i) => {
        const isCurrent = stage === currentStage
        const isPast = i < currentIndex

        return (
          <motion.button
            key={stage}
            type="button"
            onClick={() => onChange(stage)}
            className="cursor-pointer inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium stage-pill"
            style={{
              fontSize: 'var(--label-size)',
              background: isCurrent
                ? 'var(--gold)'
                : isPast
                  ? 'rgba(201,168,76,0.15)'
                  : 'var(--ice)',
              color: isCurrent
                ? '#0f1923'
                : isPast
                  ? 'var(--gold)'
                  : 'var(--slate)',
              border: isCurrent
                ? '1px solid var(--gold)'
                : isPast
                  ? '1px solid rgba(201,168,76,0.3)'
                  : '1px solid rgba(201,168,76,0.1)',
              transition: 'all 0.2s ease',
            }}
            whileTap={{ scale: 0.95 }}
          >
            {stage}
          </motion.button>
        )
      })}
    </div>
  )
}

function StageSelectorCompact({ currentStage, onChange }: { currentStage: Stage; onChange: (stage: Stage) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs stage-move-button"
        style={{
          fontSize: '10px',
          background: 'rgba(201,168,76,0.1)',
          color: 'var(--gold)',
          border: '1px solid rgba(201,168,76,0.2)',
          transition: 'all 0.2s ease',
        }}
        whileTap={{ scale: 0.95 }}
        title="Move to stage"
      >
        <ChevronRight size={12} />
        Move
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="stage-dropdown"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              background: 'var(--cream)',
              border: '1px solid rgba(201,168,76,0.3)',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              zIndex: 50,
              minWidth: '140px',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {STAGES.map((stage) => {
              const isCurrent = stage === currentStage
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!isCurrent) {
                      onChange(stage)
                    }
                    setIsOpen(false)
                  }}
                  className="cursor-pointer w-full text-left px-3 py-2 text-xs stage-dropdown-item"
                  style={{
                    fontSize: 'var(--label-size)',
                    background: isCurrent ? 'rgba(201,168,76,0.15)' : 'transparent',
                    color: isCurrent ? 'var(--gold)' : 'var(--ink)',
                    border: 'none',
                    borderBottom: '1px solid rgba(201,168,76,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = 'rgba(201,168,76,0.08)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isCurrent ? 'rgba(201,168,76,0.15)' : 'transparent'
                  }}
                  disabled={isCurrent}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: isCurrent ? 'var(--gold)' : 'rgba(201,168,76,0.3)',
                      flexShrink: 0,
                    }}
                  />
                  {stage}
                  {isCurrent && (
                    <span style={{ marginLeft: 'auto', opacity: 'var(--ink-label)', fontSize: '9px' }}>current</span>
                  )}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export { STAGES }
export type { Stage }
