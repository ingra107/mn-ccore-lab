import { useState, useRef, useMemo } from 'react'
import { Star, Clock, CheckCircle2, Sun, ChevronLeft, ChevronRight } from 'lucide-react'

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
  quote?: { text: string; author: string } | null
  selectedDate: string
  onDateChange: (date: string) => void
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
            fontSize: 'var(--value-size)', color: 'var(--ink)',
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
            fontSize: 'var(--value-size)',
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

export default function PlannerHeader({ greeting, mode, today, stats, intention, gratitude, onSaveIntention, onSaveGratitude, dispatchSlot, quote, selectedDate, onDateChange }: PlannerHeaderProps) {
  const mc = modeConfig[mode] || modeConfig.plan

  const isToday = selectedDate === today
  const isTomorrow = useMemo(() => {
    const t = new Date(today + 'T12:00:00')
    t.setDate(t.getDate() + 1)
    return selectedDate === t.toISOString().split('T')[0]
  }, [selectedDate, today])

  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    onDateChange(d.toISOString().split('T')[0])
  }
  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    onDateChange(d.toISOString().split('T')[0])
  }
  const handleToday = () => onDateChange(today)
  const handleTomorrow = () => {
    const t = new Date(today + 'T12:00:00')
    t.setDate(t.getDate() + 1)
    onDateChange(t.toISOString().split('T')[0])
  }

  return (
    <div className="mb-6">
      {/* Date + Greeting + Mode */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <button onClick={handlePrevDay} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.4 }} className="hover:opacity-80">
              <ChevronLeft size={14} style={{ color: 'var(--slate)' }} />
            </button>
            <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', margin: 0 }}>
              {formatDate(selectedDate)}
              {!isToday && (
                <span style={{ marginLeft: 6, color: 'var(--gold)', fontWeight: 600 }}>
                  {isTomorrow ? 'TOMORROW' : selectedDate < today ? 'PAST' : 'FUTURE'}
                </span>
              )}
            </p>
            <button onClick={handleNextDay} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.4 }} className="hover:opacity-80">
              <ChevronRight size={14} style={{ color: 'var(--slate)' }} />
            </button>
            {/* Quick toggles */}
            <div className="flex gap-1 ml-2">
              <button
                onClick={handleToday}
                style={{
                  fontSize: '10px', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                  color: isToday ? 'var(--cream)' : 'var(--slate)',
                  background: isToday ? 'var(--gold)' : 'rgba(201,168,76,0.08)',
                  border: 'none', borderRadius: 'var(--radius-sm)', padding: '2px 8px', cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Today
              </button>
              <button
                onClick={handleTomorrow}
                style={{
                  fontSize: '10px', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                  color: isTomorrow ? 'var(--cream)' : 'var(--slate)',
                  background: isTomorrow ? 'var(--gold)' : 'rgba(201,168,76,0.08)',
                  border: 'none', borderRadius: 'var(--radius-sm)', padding: '2px 8px', cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Tomorrow
              </button>
            </div>
          </div>
          <h1 style={{ fontWeight: 700, fontSize: '1.75rem', color: 'var(--ink)', margin: 0, lineHeight: 1.2 }}>
            {greeting}, Nick
          </h1>
          {quote && (
            <p style={{
              fontSize: '12.5px', fontStyle: 'italic',
              color: 'var(--slate)', opacity: 0.6, margin: 'var(--sp-xs) 0 0 0', lineHeight: 1.4,
            }}>
              "{quote.text}" — {quote.author}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {dispatchSlot}
          <span
            style={{
              fontSize: '10px', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '1px',
              color: mc.color, background: mc.bg,
              padding: '3px 10px', borderRadius: 'var(--radius-full)',
            }}
          >
            {mc.label}
          </span>
          <div className="flex items-center gap-3" style={{ fontSize: 'var(--label-size)', color: 'var(--slate)' }}>
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
