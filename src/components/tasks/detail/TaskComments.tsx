import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquare, Send, Scale,
} from 'lucide-react'
import Avatar from '../../Avatar'
import ReactionBar from '../../ReactionBar'
import { getPersonInfo } from '../../../data/team'
import { useDecisions } from '../../../hooks/useApiData'
import type { DecisionRow } from '../../../hooks/useApiData'
import { formatRelativeTime } from '../../../lib/dateUtils'

// ── Task Comments ────────────────────────────────────────────

interface TaskComment {
  id: string
  task_id: string
  author_slug: string
  content: string
  created_at: string
}

export function TaskComments({ taskId, taskTitle, projectSlug }: { taskId: string; taskTitle?: string; projectSlug?: string | null }) {
  const queryClient = useQueryClient()
  const [newComment, setNewComment] = useState('')
  const [forClaude, setForClaude] = useState(false)

  const { data: comments = [] } = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/comments`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as TaskComment[]
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return
    addComment.mutate(newComment.trim())
    // Also add to dispatch queue if @claude toggle is on
    if (forClaude) {
      fetch('/api/pb/dispatch/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          task_title: taskTitle || null,
          project_slug: projectSlug || null,
          comment: newComment.trim(),
          comment_type: 'action',
        }),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['dispatch-pending'] })
      }).catch(() => {})
    }
    setNewComment('')
    setForClaude(false)
  }

  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
        <MessageSquare size={10} />
        Comments ({comments.length})
      </label>

      {/* Comment list */}
      <div className="flex flex-col gap-2 mb-3">
        {comments.map((c) => {
          const person = getPersonInfo(c.author_slug)
          return (
            <div key={c.id} className="flex gap-2">
              <div style={{ width: 24, height: 24, flexShrink: 0 }}>
                <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-6 !h-6 !min-w-0 !min-h-0 !text-[7px]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>{person.name}</span>
                  <span className="text-[9px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.4 }}>{formatRelativeTime(c.created_at)}</span>
                </div>
                <p className="text-sm mt-0.5" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{c.content}</p>
                <ReactionBar targetType="task_comment" targetId={c.id} compact />
              </div>
            </div>
          )
        })}
      </div>

      {/* Add comment */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 rounded-md border px-3 py-1.5 text-sm outline-none"
            style={{ fontFamily: 'var(--font-sans)', borderColor: 'var(--border-light)', backgroundColor: 'var(--cream)', color: 'var(--ink)' }}
          />
          {newComment.trim() && (
            <button type="submit" className="p-1.5 rounded-md" style={{ backgroundColor: forClaude ? 'var(--gold)' : 'var(--teal)', color: 'white', border: 'none', cursor: 'pointer', transition: 'background-color 0.15s' }}>
              <Send size={14} />
            </button>
          )}
        </div>
        {newComment.trim() && (
          <button
            type="button"
            onClick={() => setForClaude(!forClaude)}
            className="flex items-center gap-1.5 self-start px-2 py-0.5 rounded-full transition-colors"
            style={{
              fontFamily: 'var(--font-sans)', fontSize: '9px', fontWeight: 600,
              background: forClaude ? 'rgba(201,168,76,0.15)' : 'rgba(100,116,139,0.06)',
              color: forClaude ? 'var(--gold)' : 'var(--slate)',
              border: `1px solid ${forClaude ? 'rgba(201,168,76,0.3)' : 'rgba(100,116,139,0.1)'}`,
              cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.3px',
            }}
          >
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: forClaude ? 'var(--gold)' : 'var(--slate)',
              opacity: forClaude ? 1 : 0.3,
            }} />
            {forClaude ? 'For Claude' : '@ Claude'}
          </button>
        )}
      </form>
    </div>
  )
}

// ── Task Activity Log ────────────────────────────────────────

export function TaskActivity({ taskId }: { taskId: string }) {
  const { data: activity = [] } = useQuery({
    queryKey: ['task-activity', taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/activity`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as { id: string; description: string; actor: string | null; timestamp: string }[]
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })

  if (activity.length === 0) return null

  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider mb-2 block" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
        Activity
      </label>
      <div className="flex flex-col gap-1">
        {activity.slice(0, 8).map((a) => (
          <div key={a.id} className="flex items-start gap-2 py-0.5">
            <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--teal)', opacity: 0.3 }} />
            <span className="text-[11px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.6 }}>{a.description}</span>
            <span className="text-[9px] ml-auto flex-shrink-0" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.3 }}>{formatRelativeTime(a.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Project Decisions Section ────────────────────────────────

const SENTIMENT_BADGE: Record<string, { color: string; bg: string }> = {
  positive: { color: 'var(--teal)', bg: 'rgba(45,138,138,0.08)' },
  negative: { color: 'var(--maroon)', bg: 'rgba(128,0,0,0.08)' },
  neutral: { color: 'var(--slate)', bg: 'rgba(100,116,139,0.08)' },
  pending: { color: 'var(--gold)', bg: 'rgba(201,168,76,0.08)' },
}

export function ProjectDecisionsSection({ projectSlug }: { projectSlug: string }) {
  const { data: decisions = [] } = useDecisions(projectSlug)

  if (decisions.length === 0) {
    return (
      <p className="text-xs" style={{ fontFamily: 'var(--font-body)', color: 'var(--slate)', opacity: 0.4 }}>
        No decisions linked to this project.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {decisions.slice(0, 5).map((d: DecisionRow) => {
        const sentiment = d.outcome_sentiment || 'pending'
        const badge = SENTIMENT_BADGE[sentiment] || SENTIMENT_BADGE.pending
        const tags = d.tags ? d.tags.split(',').map(t => t.trim()).filter(Boolean) : []

        return (
          <div
            key={d.id}
            className="p-2.5 rounded-lg"
            style={{ background: 'rgba(201,168,76,0.03)', border: '1px solid rgba(201,168,76,0.1)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Scale size={11} style={{ color: 'var(--gold)', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '12px', color: 'var(--ink)' }}>
                {d.title}
              </span>
              <span
                className="text-[9px] px-1 py-0.5 rounded-full ml-auto"
                style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, color: badge.color, backgroundColor: badge.bg }}
              >
                {sentiment}
              </span>
            </div>
            {d.outcome && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--teal)', margin: '2px 0 0 0' }}>
                {d.outcome}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '9px', color: 'var(--slate)', opacity: 0.4 }}>
                {formatRelativeTime(d.created_at)}
              </span>
              {tags.map(tag => (
                <span
                  key={tag}
                  className="text-[9px] px-1 py-0.5 rounded-full"
                  style={{ fontFamily: 'var(--font-sans)', color: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.06)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )
      })}
      {decisions.length > 5 && (
        <p className="text-[10px]" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.4, textAlign: 'center' }}>
          + {decisions.length - 5} more decisions
        </p>
      )}
    </div>
  )
}
