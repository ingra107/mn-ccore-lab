import { useState, useMemo, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useReactions } from '../hooks/useApiData'
import type { Reaction } from '../hooks/useApiData'
import { useToggleReaction } from '../hooks/useMutations'
import { useAuth } from '../hooks/useAuth'
import { getPersonInfo } from '../data/team'

const EMOJI_OPTIONS = [
  { emoji: '\u{1F44D}', label: 'Thumbs up' },
  { emoji: '\u2764\uFE0F', label: 'Love' },
  { emoji: '\u{1F389}', label: 'Celebrate' },
  { emoji: '\u{1F440}', label: 'Eyes' },
  { emoji: '\u{1F525}', label: 'Fire' },
  { emoji: '\u{1F4A1}', label: 'Idea' },
] as const

interface ReactionBarProps {
  targetType: string
  targetId: string
  compact?: boolean
}

export default function ReactionBar({ targetType, targetId, compact }: ReactionBarProps) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const currentSlug = user?.email?.split('@')[0]?.toLowerCase() || ''
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const { data: reactions = [] } = useReactions(targetType, targetId)

  const toggle = useToggleReaction()

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  function handleToggle(emoji: string) {
    // Optimistic update
    const prev = queryClient.getQueryData<Reaction[]>(['reactions', targetType, targetId]) || []
    const existing = prev.find((r) => r.user_slug === currentSlug && r.emoji === emoji)
    const next = existing
      ? prev.filter((r) => r.id !== existing.id)
      : [...prev, { id: `optimistic-${Date.now()}`, target_type: targetType, target_id: targetId, user_slug: currentSlug, emoji, created_at: new Date().toISOString() }]
    queryClient.setQueryData(['reactions', targetType, targetId], next)

    toggle.mutate({ target_type: targetType, target_id: targetId, emoji })
  }

  // Group reactions by emoji
  const grouped = useMemo(() => {
    const map = new Map<string, { count: number; userReacted: boolean; users: string[] }>()
    for (const r of reactions) {
      const entry = map.get(r.emoji) || { count: 0, userReacted: false, users: [] }
      entry.count++
      entry.users.push(r.user_slug)
      if (r.user_slug === currentSlug) entry.userReacted = true
      map.set(r.emoji, entry)
    }
    return map
  }, [reactions, currentSlug])

  const pillHeight = compact ? 20 : 24

  return (
    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
      {/* Existing reaction pills */}
      {[...grouped.entries()].map(([emoji, { count, userReacted, users }]) => (
        <button
          key={emoji}
          onClick={() => handleToggle(emoji)}
          title={users.map((s) => getPersonInfo(s).name).join(', ')}
          className="inline-flex items-center gap-1 rounded-full transition-all"
          style={{
            height: pillHeight,
            padding: '0 8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            lineHeight: 1,
            background: userReacted ? 'rgba(45,138,138,0.08)' : 'transparent',
            color: userReacted ? 'var(--teal)' : 'var(--slate)',
            border: userReacted
              ? '1px solid rgba(45,138,138,0.35)'
              : '1px solid var(--border-light, rgba(0,0,0,0.08))',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '13px', lineHeight: 1 }}>{emoji}</span>
          <span>{count}</span>
        </button>
      ))}

      {/* Add reaction button + picker */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="inline-flex items-center justify-center rounded-full transition-all"
          style={{
            width: pillHeight,
            height: pillHeight,
            background: 'transparent',
            border: '1px dashed var(--border-light, rgba(0,0,0,0.08))',
            cursor: 'pointer',
            color: 'var(--slate)',
            opacity: showPicker ? 0.8 : 0.35,
            fontSize: '12px',
            lineHeight: 1,
          }}
          title="Add reaction"
        >
          +
        </button>

        {showPicker && (
          <div
            className="absolute bottom-full left-0 mb-1 flex items-center gap-0.5 px-1.5 py-1 rounded-lg shadow-lg z-50"
            style={{
              backgroundColor: 'var(--cream, #fff)',
              border: '1px solid var(--border-light, rgba(0,0,0,0.08))',
            }}
          >
            {EMOJI_OPTIONS.map(({ emoji, label }) => (
              <button
                key={emoji}
                onClick={() => {
                  handleToggle(emoji)
                  setShowPicker(false)
                }}
                title={label}
                className="flex items-center justify-center rounded transition-colors"
                style={{
                  width: 28,
                  height: 28,
                  fontSize: '15px',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
