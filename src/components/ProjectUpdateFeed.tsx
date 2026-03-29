import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, AlertTriangle, CheckCircle, HelpCircle, TrendingUp, Send, ThumbsUp, Eye, Heart } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useProjectUpdates } from '../hooks/useApiData'
import type { ProjectUpdateRow } from '../hooks/useApiData'
import { usePostProjectUpdate } from '../hooks/useMutations'
import { useAuth } from '../hooks/useAuth'
import { getPersonInfo } from '../data/team'
import { formatRelativeTime } from '../lib/dateUtils'
import Avatar from './Avatar'
import MentionInput from './MentionInput'

// Available reaction emojis
const REACTION_OPTIONS = [
  { emoji: '👍', icon: ThumbsUp, label: 'Thumbs up' },
  { emoji: '👀', icon: Eye, label: 'Seen' },
  { emoji: '❤️', icon: Heart, label: 'Love' },
] as const

const TYPE_CONFIG: Record<string, { icon: typeof TrendingUp; color: string; bg: string; borderBg: string; label: string }> = {
  progress: { icon: TrendingUp, color: 'var(--teal)', bg: 'rgba(45, 138, 138, 0.1)', borderBg: 'rgba(45, 138, 138, 0.25)', label: 'Progress' },
  blocker: { icon: AlertTriangle, color: 'var(--maroon)', bg: 'rgba(122, 0, 25, 0.1)', borderBg: 'rgba(122, 0, 25, 0.25)', label: 'Blocker' },
  result: { icon: CheckCircle, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', borderBg: 'rgba(34, 197, 94, 0.25)', label: 'Result' },
  question: { icon: HelpCircle, color: 'var(--gold)', bg: 'rgba(201, 168, 76, 0.1)', borderBg: 'rgba(201, 168, 76, 0.25)', label: 'Question' },
}

interface Props {
  projectSlug: string
}

export default function ProjectUpdateFeed({ projectSlug }: Props) {
  const { data: updates = [] } = useProjectUpdates(projectSlug)
  const postUpdate = usePostProjectUpdate(projectSlug)
  const { isAuthenticated } = useAuth()
  const [text, setText] = useState('')
  const [updateType, setUpdateType] = useState<string>('progress')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    postUpdate.mutate({ content: text.trim(), update_type: updateType })
    setText('')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.18 }}
      style={{ marginBottom: '2.5rem' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle size={16} style={{ color: 'var(--teal)' }} />
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
          Project Updates
        </h2>
        {updates.length > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
            {updates.length}
          </span>
        )}
      </div>

      <div style={{ background: 'var(--ice)', borderRadius: '12px', padding: '16px 20px' }} className="detail-card">
        {/* Post update form */}
        <form onSubmit={handleSubmit} style={{ marginBottom: updates.length > 0 ? '16px' : 0 }}>
          {/* Type selector */}
          <div className="flex gap-1.5 mb-2">
            {Object.entries(TYPE_CONFIG).map(([key, config]) => {
              const Icon = config.icon
              const isActive = updateType === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setUpdateType(key)}
                  className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    background: isActive ? config.bg : 'transparent',
                    color: isActive ? config.color : 'var(--slate)',
                    border: isActive ? `1px solid ${config.borderBg}` : '1px solid transparent',
                    opacity: isActive ? 1 : 0.5,
                    minHeight: '32px',
                  }}
                >
                  <Icon size={10} />
                  {config.label}
                </button>
              )
            })}
          </div>

          <div className="flex gap-2 items-end">
            <MentionInput
              value={text}
              onChange={setText}
              placeholder={isAuthenticated ? 'Post a project update... (use @mention to tag team)' : 'Sign in to post updates'}
              disabled={!isAuthenticated && import.meta.env.PROD}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)',
                background: 'var(--cream)', border: '1px solid rgba(201, 168, 76, 0.15)',
                borderRadius: '8px', padding: '10px 12px', resize: 'none', outline: 'none',
                lineHeight: 1.5, transition: 'border-color 0.2s', width: '100%',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--gold)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(201, 168, 76, 0.15)')}
            />
            {text.trim() && (
              <motion.button type="submit" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                className="cursor-pointer flex-shrink-0 p-2.5 rounded-lg"
                style={{ background: 'var(--gold)', color: '#0f1923', border: 'none' }}>
                <Send size={16} />
              </motion.button>
            )}
          </div>
        </form>

        {/* Updates list */}
        {updates.length > 0 ? (
          <div className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
              {updates.map((update) => (
                <UpdateCard key={update.id} update={update} />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--slate)', opacity: 0.4, textAlign: 'center', padding: '12px 0', margin: 0 }}>
            No updates yet — post the first one to keep the team informed
          </p>
        )}
      </div>
    </motion.div>
  )
}

function UpdateCard({ update }: { update: ProjectUpdateRow }) {
  const config = TYPE_CONFIG[update.update_type] || TYPE_CONFIG.progress
  const Icon = config.icon
  const person = getPersonInfo(update.author)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      style={{
        background: 'var(--cream)',
        borderRadius: '8px',
        padding: '12px',
        borderLeft: `3px solid ${config.color}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5" style={{ width: 28, height: 28 }}>
          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-7 !h-7 !min-w-0 !min-h-0" />
        </div>
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
              {person.name}
            </span>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', background: config.bg, color: config.color }}>
              <Icon size={9} /> {config.label}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>
              {formatRelativeTime(update.created_at)}
            </span>
          </div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
            {update.content}
          </p>

          {/* Reactions */}
          <ReactionBar targetType="project_update" targetId={update.id} />
        </div>
      </div>
    </motion.div>
  )
}

// ── Reaction Bar ──────────────────────────────────────────────
interface Reaction {
  id: string
  target_type: string
  target_id: string
  user_slug: string
  emoji: string
}

function ReactionBar({ targetType, targetId }: { targetType: string; targetId: string }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const currentSlug = user?.email?.split('@')[0]?.toLowerCase() || ''
  const [showPicker, setShowPicker] = useState(false)

  const { data: reactions = [] } = useQuery({
    queryKey: ['reactions', targetType, targetId],
    queryFn: async () => {
      const res = await fetch(`/api/reactions?target_type=${targetType}&target_id=${targetId}`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as Reaction[]
    },
    staleTime: 30 * 1000,
  })

  const toggle = useMutation({
    mutationFn: async (emoji: string) => {
      const res = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, emoji }),
      })
      return res.json()
    },
    onMutate: async (emoji) => {
      await queryClient.cancelQueries({ queryKey: ['reactions', targetType, targetId] })
      const prev = queryClient.getQueryData<Reaction[]>(['reactions', targetType, targetId]) || []
      const existing = prev.find(r => r.user_slug === currentSlug && r.emoji === emoji)
      const next = existing
        ? prev.filter(r => r.id !== existing.id)
        : [...prev, { id: 'optimistic', target_type: targetType, target_id: targetId, user_slug: currentSlug, emoji }]
      queryClient.setQueryData(['reactions', targetType, targetId], next)
      return { prev }
    },
    onError: (_err, _emoji, context) => {
      if (context?.prev) queryClient.setQueryData(['reactions', targetType, targetId], context.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reactions', targetType, targetId] })
    },
  })

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

  return (
    <div className="flex items-center gap-1 mt-2 flex-wrap">
      {/* Existing reactions */}
      {[...grouped.entries()].map(([emoji, { count, userReacted, users }]) => (
        <button
          key={emoji}
          onClick={() => toggle.mutate(emoji)}
          title={users.map(s => getPersonInfo(s).name).join(', ')}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            background: userReacted ? 'rgba(45,138,138,0.1)' : 'rgba(0,0,0,0.03)',
            color: userReacted ? 'var(--teal)' : 'var(--slate)',
            border: `1px solid ${userReacted ? 'rgba(45,138,138,0.3)' : 'transparent'}`,
            cursor: 'pointer',
          }}
        >
          <span>{emoji}</span>
          <span>{count}</span>
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors"
          style={{
            background: 'transparent',
            border: '1px dashed var(--border-light)',
            cursor: 'pointer',
            color: 'var(--slate)',
            opacity: 0.4,
            fontSize: '12px',
          }}
          title="Add reaction"
        >
          +
        </button>

        {showPicker && (
          <div
            className="absolute bottom-full left-0 mb-1 flex items-center gap-1 px-2 py-1.5 rounded-lg border shadow-md z-50"
            style={{ backgroundColor: 'var(--card-bg, #fff)', borderColor: 'var(--border-light)' }}
          >
            {REACTION_OPTIONS.map(({ emoji, label }) => (
              <button
                key={emoji}
                onClick={() => { toggle.mutate(emoji); setShowPicker(false) }}
                title={label}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                style={{ fontSize: '14px', cursor: 'pointer', border: 'none', background: 'none' }}
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
