import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Pencil, Check, X, MessageCircle } from 'lucide-react'
import { ROUND_PROMPTS, CATEGORY_LABELS, hashMeetingId } from '../data/roundPrompts'

const LS_KEY = (id: string) => `roundprompt:${id}`

interface PersistedState {
  shuffleIndex?: number
  custom?: string
}

function loadState(id: string): PersistedState {
  try {
    const raw = localStorage.getItem(LS_KEY(id))
    return raw ? (JSON.parse(raw) as PersistedState) : {}
  } catch {
    return {}
  }
}

function saveState(id: string, s: PersistedState) {
  localStorage.setItem(LS_KEY(id), JSON.stringify(s))
}

export default function RoundPrompt({ meetingId }: { meetingId: string }) {
  const baseIndex = hashMeetingId(meetingId, ROUND_PROMPTS.length)
  const [state, setState] = useState<PersistedState>(() => loadState(meetingId))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const activeIndex = state.shuffleIndex ?? baseIndex
  const isCustom = !!state.custom?.trim()
  const promptObj = ROUND_PROMPTS[activeIndex]
  const displayText = isCustom ? state.custom! : promptObj.text
  const categoryLabel = isCustom ? 'Custom' : CATEGORY_LABELS[promptObj.category]

  function update(patch: Partial<PersistedState>) {
    const next = { ...state, ...patch }
    setState(next)
    saveState(meetingId, next)
  }

  function shuffle() {
    let next = activeIndex
    let attempts = 0
    while (next === activeIndex && ROUND_PROMPTS.length > 1 && attempts < 30) {
      next = Math.floor(Math.random() * ROUND_PROMPTS.length)
      attempts++
    }
    update({ shuffleIndex: next, custom: '' })
  }

  function startEdit() {
    setDraft(displayText)
    setEditing(true)
  }

  function commitEdit() {
    const trimmed = draft.trim()
    if (trimmed) update({ custom: trimmed })
    setEditing(false)
  }

  function cancelEdit() {
    setEditing(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.08 }}
      style={{
        borderLeft: '3px solid var(--gold)',
        background: 'rgba(201, 168, 76, 0.06)',
        borderRadius: '0 12px 12px 0',
        padding: '14px 18px',
        marginTop: '1.5rem',
      }}
    >
      {/* Label row */}
      <div className="flex items-center gap-1.5 mb-2">
        <MessageCircle size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--gold)',
          textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
        }}>
          Opening Round
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>
          · {categoryLabel}
        </span>
      </div>

      {/* Prompt text or edit form */}
      {editing ? (
        <div className="flex items-start gap-2">
          <textarea
            autoFocus
            value={draft}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commitEdit()
              if (e.key === 'Escape') cancelEdit()
            }}
            style={{
              flex: 1, fontFamily: 'var(--font-sans)', fontSize: '15px', color: 'var(--ink)',
              background: 'var(--cream)', border: '1px solid rgba(201, 168, 76, 0.25)',
              borderRadius: '8px', padding: '8px 12px', outline: 'none',
              resize: 'vertical', lineHeight: 1.5,
            }}
          />
          <div className="flex flex-col gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={commitEdit}
              title="Save"
              style={{
                background: 'var(--gold)', border: 'none', borderRadius: '6px',
                padding: '7px', cursor: 'pointer', color: '#0f1923',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              title="Cancel"
              style={{
                background: 'transparent', border: '1px solid rgba(201, 168, 76, 0.2)',
                borderRadius: '6px', padding: '7px', cursor: 'pointer', color: 'var(--slate)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={13} />
            </button>
          </div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.p
            key={displayText}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.18 }}
            style={{
              fontFamily: 'var(--font-sans)', fontWeight: 600,
              fontSize: 'clamp(14px, 2.2vw, 16px)',
              color: 'var(--ink)', lineHeight: 1.45, margin: 0,
            }}
          >
            &ldquo;{displayText}&rdquo;
          </motion.p>
        </AnimatePresence>
      )}

      {/* Controls */}
      {!editing && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            type="button"
            onClick={shuffle}
            title="Try a different prompt"
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border transition-colors hover:bg-[rgba(201,168,76,0.08)]"
            style={{
              fontFamily: 'var(--font-mono)', color: 'var(--slate)',
              background: 'transparent', borderColor: 'rgba(201, 168, 76, 0.2)', cursor: 'pointer',
            }}
          >
            <RefreshCw size={11} /> Shuffle
          </button>

          <button
            type="button"
            onClick={isCustom ? startEdit : startEdit}
            title={isCustom ? 'Edit custom prompt' : 'Write a custom prompt'}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border transition-colors hover:bg-[rgba(201,168,76,0.08)]"
            style={{
              fontFamily: 'var(--font-mono)', color: 'var(--slate)',
              background: 'transparent', borderColor: 'rgba(201, 168, 76, 0.2)', cursor: 'pointer',
            }}
          >
            <Pencil size={11} /> {isCustom ? 'Edit' : 'Customize'}
          </button>

          {isCustom && (
            <button
              type="button"
              onClick={() => update({ custom: '' })}
              title="Restore generated prompt"
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border transition-colors hover:bg-[rgba(201,168,76,0.08)]"
              style={{
                fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.6,
                background: 'transparent', borderColor: 'rgba(201, 168, 76, 0.15)', cursor: 'pointer',
              }}
            >
              <X size={11} /> Reset
            </button>
          )}
        </div>
      )}
    </motion.div>
  )
}
