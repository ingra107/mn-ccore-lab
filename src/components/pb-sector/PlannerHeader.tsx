import { useState, useRef } from 'react'
import { Star, Clock, CheckCircle2, Sun } from 'lucide-react'

interface PlannerHeaderProps {
  greeting: string
  mode: string
  today: string
  stats: { totalOpen: number; overdue: number; completedRecently: number }
  intention: string | null
  gratitude: string | null
  onSaveIntention: (text: string) => void
  onSaveGratitude: (text: string) => void
  dispatchSlot?: React.ReactNode
}

const modeConfig: Record<string, { label: string; color: string; bg: string }> = {
  plan: { label: 'PLANNING', color: 'var(--gold)', bg: 'rgba(201,168,76,0.1)' },
  execute: { label: 'EXECUTING', color: 'var(--teal)', bg: 'rgba(45,138,138,0.1)' },
  review: { label: 'REVIEWING', color: 'var(--maroon)', bg: 'rgba(122,0,25,0.08)' },
  capture: { label: 'CAPTURE', color: 'var(--slate)', bg: 'rgba(100,116,139,0.08)' },
}

function EditableField({ value, placeholder, onSave, icon: Icon }: {
  value: string | null
  placeholder: string
  onSave: (text: string) => void
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value || '')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSave = () => {
    setEditing(false)
    if (text.trim() !== (value || '')) onSave(text.trim())
  }

  return (
    <div className="flex items-center gap-2" style={{ minHeight: 28 }}>
      <Icon size={13} style={{ color: 'var(--gold)', opacity: 0.5, flexShrink: 0 }} />
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setText(value || ''); setEditing(false) } }}
          autoFocus
          className="flex-1"
          style={{
            fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)',
            background: 'transparent', border: 'none', borderBottom: '1px solid var(--gold)',
            outline: 'none', padding: '2px 0',
          }}
          placeholder={placeholder}
        />
      ) : (
        <button
          onClick={() => { setEditing(true); setText(value || '') }}
          className="flex-1 text-left"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
            fontFamily: 'var(--font-body)', fontSize: '13px',
            color: value ? 'var(--ink)' : 'var(--slate)',
            opacity: value ? 1 : 0.4,
            fontStyle: value ? 'normal' : 'italic',
          }}
        >
          {value || placeholder}
        </button>
      )}
    </div>
  )
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function PlannerHeader({ greeting, mode, today, stats, intention, gratitude, onSaveIntention, onSaveGratitude, dispatchSlot }: PlannerHeaderProps) {
  const mc = modeConfig[mode] || modeConfig.plan

  return (
    <div className="mb-6">
      {/* Date + Greeting + Mode */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--slate)', marginBottom: 2 }}>
            {formatDate(today)}
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.75rem', color: 'var(--ink)', margin: 0, lineHeight: 1.2 }}>
            {greeting}, Nick
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {dispatchSlot}
          <span
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '1px',
              color: mc.color, background: mc.bg,
              padding: '3px 10px', borderRadius: 9999,
            }}
          >
            {mc.label}
          </span>
          <div className="flex items-center gap-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--slate)' }}>
            <span className="flex items-center gap-1">
              <Clock size={11} /> {stats.totalOpen} open
            </span>
            {stats.overdue > 0 && (
              <span className="flex items-center gap-1" style={{ color: 'var(--maroon)' }}>
                {stats.overdue} overdue
              </span>
            )}
            {stats.completedRecently > 0 && (
              <span className="flex items-center gap-1" style={{ color: 'var(--teal)' }}>
                <CheckCircle2 size={11} /> {stats.completedRecently}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Intention + Gratitude (Monk Manual inspired) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-1">
        <EditableField value={intention} placeholder="Today's intention..." onSave={onSaveIntention} icon={Star} />
        <EditableField value={gratitude} placeholder="I'm grateful for..." onSave={onSaveGratitude} icon={Sun} />
      </div>
    </div>
  )
}
