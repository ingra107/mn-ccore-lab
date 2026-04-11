import { useState, useEffect } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface ReflectionPanelProps {
  reflection: {
    highlight: string | null
    learned: string | null
    energy_rating: number | null
    focus_rating: number | null
    notes: string | null
  } | null
  onSave: (data: { highlight?: string; learned?: string; energy_rating?: number; focus_rating?: number; notes?: string }) => void
}

function RatingDots({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.6, width: 50, flexShrink: 0 }}>
        {label}
      </span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            style={{
              width: 18, height: 18, borderRadius: 'var(--radius-circle)',
              border: `1.5px solid ${n <= (value || 0) ? 'var(--gold)' : 'var(--slate)'}`,
              background: n <= (value || 0) ? 'var(--gold)' : 'transparent',
              opacity: n <= (value || 0) ? 1 : 0.2,
              cursor: 'pointer', padding: 0,
              transition: 'all 0.15s ease',
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default function ReflectionPanel({ reflection, onSave }: ReflectionPanelProps) {
  const hour = new Date().getHours()
  const [expanded, setExpanded] = useState(hour >= 16)
  const [highlight, setHighlight] = useState(reflection?.highlight || '')
  const [learned, setLearned] = useState(reflection?.learned || '')
  const [energy, setEnergy] = useState(reflection?.energy_rating || 0)
  const [focus, setFocus] = useState(reflection?.focus_rating || 0)
  const [saved, setSaved] = useState(false)

  // Sync from prop changes
  useEffect(() => {
    if (reflection) {
      setHighlight(reflection.highlight || '')
      setLearned(reflection.learned || '')
      setEnergy(reflection.energy_rating || 0)
      setFocus(reflection.focus_rating || 0)
    }
  }, [reflection])

  const handleSave = () => {
    onSave({
      highlight: highlight || undefined,
      learned: learned || undefined,
      energy_rating: energy || undefined,
      focus_rating: focus || undefined,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const hasContent = highlight || learned || energy || focus

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(201,168,76,0.1)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        style={{ background: 'var(--gold-hover)', border: 'none', cursor: 'pointer' }}
      >
        <BookOpen size={14} style={{ color: 'var(--gold)', opacity: 0.6 }} />
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--gold)' }}>
          End of Day
        </span>
        {hour < 16 && (
          <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
            opens at 4pm
          </span>
        )}
        <div className="flex-1" />
        {expanded ? <ChevronDown size={14} style={{ color: 'var(--gold)', opacity: 0.5 }} /> : <ChevronRight size={14} style={{ color: 'var(--gold)', opacity: 0.5 }} />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-4 pb-4"
          >
            <div className="space-y-3 pt-2">
              {/* Highlight */}
              <div>
                <label style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.6, display: 'block', marginBottom: 'var(--sp-xs)' }}>
                  Highlight of the day
                </label>
                <input
                  type="text"
                  value={highlight}
                  onChange={(e) => setHighlight(e.target.value)}
                  placeholder="What went well?"
                  className="w-full"
                  style={{
                    fontSize: 'var(--value-size)', color: 'var(--ink)',
                    background: 'transparent', border: 'none', borderBottom: '1px solid rgba(201,168,76,0.15)',
                    outline: 'none', padding: 'var(--sp-xs) 0',
                  }}
                />
              </div>

              {/* Learned */}
              <div>
                <label style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.6, display: 'block', marginBottom: 'var(--sp-xs)' }}>
                  What did I learn?
                </label>
                <input
                  type="text"
                  value={learned}
                  onChange={(e) => setLearned(e.target.value)}
                  placeholder="One takeaway from today..."
                  className="w-full"
                  style={{
                    fontSize: 'var(--value-size)', color: 'var(--ink)',
                    background: 'transparent', border: 'none', borderBottom: '1px solid rgba(201,168,76,0.15)',
                    outline: 'none', padding: 'var(--sp-xs) 0',
                  }}
                />
              </div>

              {/* Ratings */}
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <RatingDots value={energy} onChange={setEnergy} label="Energy" />
                <RatingDots value={focus} onChange={setFocus} label="Focus" />
              </div>

              {/* Save */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={!hasContent}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                  style={{
                    fontSize: 'var(--label-size)', fontWeight: 600,
                    background: hasContent ? 'var(--gold)' : 'var(--gold-emphasis)',
                    color: hasContent ? 'var(--ink-bright, #fff)' : 'var(--slate)',
                    border: 'none', cursor: hasContent ? 'pointer' : 'default',
                    opacity: hasContent ? 1 : 0.5,
                  }}
                >
                  <BookOpen size={12} />
                  Close Day
                </button>
                <AnimatePresence>
                  {saved && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-1"
                      style={{ fontSize: 'var(--label-size)', color: 'var(--teal)' }}
                    >
                      <Sparkles size={12} /> Saved
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
