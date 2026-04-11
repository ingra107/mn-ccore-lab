import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, AlertTriangle, CheckCircle, HelpCircle, Terminal, MessageSquare, Circle } from 'lucide-react'
import { useTaskUpdates } from '../../../hooks/useApiData'
import type { TaskUpdateRow } from '../../../hooks/useApiData'
import { getPersonInfo } from '../../../data/team'
import { formatRelativeTime } from '../../../lib/dateUtils'
import Avatar from '../../Avatar'

const UPDATE_TYPE_CONFIG: Record<string, { icon: typeof TrendingUp; color: string; label: string }> = {
  progress: { icon: TrendingUp, color: 'var(--teal)', label: 'Progress' },
  blocker: { icon: AlertTriangle, color: 'var(--maroon)', label: 'Blocker' },
  result: { icon: CheckCircle, color: 'var(--green)', label: 'Result' },
  question: { icon: HelpCircle, color: 'var(--gold)', label: 'Question' },
  session: { icon: Terminal, color: 'var(--slate)', label: 'Session' },
}

interface TaskComment {
  id: string
  task_id: string
  author_slug: string
  content: string
  created_at: string
}

interface ActivityEntry {
  id: string
  description: string
  actor: string | null
  timestamp: string
}

type MergedItem =
  | { _type: 'update'; _ts: string; data: TaskUpdateRow }
  | { _type: 'comment'; _ts: string; data: TaskComment }
  | { _type: 'system'; _ts: string; data: ActivityEntry }

export function TaskActivityFeed({ taskId }: { taskId: string }) {
  const { data: updates = [] } = useTaskUpdates(taskId)

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

  const { data: activity = [] } = useQuery({
    queryKey: ['task-activity', taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/activity`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as ActivityEntry[]
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })

  const merged = useMemo<MergedItem[]>(() => {
    const items: MergedItem[] = [
      ...updates.map(u => ({ _type: 'update' as const, _ts: u.created_at, data: u })),
      ...comments.map(c => ({ _type: 'comment' as const, _ts: c.created_at, data: c })),
      ...activity.map(a => ({ _type: 'system' as const, _ts: a.timestamp, data: a })),
    ]
    return items.sort((a, b) => b._ts.localeCompare(a._ts))
  }, [updates, comments, activity])

  if (merged.length === 0) {
    return (
      <p className="text-xs text-center py-4" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)', margin: 0 }}>
        No activity yet
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {merged.map((item) => {
        if (item._type === 'update') return <UpdateItem key={`u-${item.data.id}`} update={item.data} />
        if (item._type === 'comment') return <CommentItem key={`c-${item.data.id}`} comment={item.data} />
        return <SystemItem key={`s-${item.data.id}`} entry={item.data} />
      })}
    </div>
  )
}

function UpdateItem({ update }: { update: TaskUpdateRow }) {
  const config = UPDATE_TYPE_CONFIG[update.update_type] || UPDATE_TYPE_CONFIG.progress
  const Icon = config.icon
  const person = getPersonInfo(update.author_slug)

  return (
    <div
      className="rounded-lg p-2.5"
      style={{
        background: 'var(--cream)',
        borderLeft: `3px solid ${config.color}`,
        opacity: update.update_type === 'session' ? 0.7 : 1,
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5" style={{ width: 20, height: 20 }}>
          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="xs" variant="ice" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span style={{ fontSize: 'var(--label-size)', fontWeight: 600, color: 'var(--ink)' }}>{person.name}</span>
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded"
              style={{ fontSize: '8px', background: `color-mix(in srgb, ${config.color} 10%, transparent)`, color: config.color }}>
              <Icon size={8} /> {config.label}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-hint)', marginLeft: 'auto' }}>
              {formatRelativeTime(update.created_at)}
            </span>
          </div>
          <p className="mt-0.5" style={{ fontSize: 'var(--label-size)', color: 'var(--ink)', lineHeight: 1.5, margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>
            {update.content}
          </p>
        </div>
      </div>
    </div>
  )
}

function CommentItem({ comment }: { comment: TaskComment }) {
  const person = getPersonInfo(comment.author_slug)

  return (
    <div
      className="rounded-lg p-2.5"
      style={{
        background: 'var(--cream)',
        borderLeft: '3px solid rgba(201, 168, 76, 0.4)',
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5" style={{ width: 20, height: 20 }}>
          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="xs" variant="ice" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span style={{ fontSize: 'var(--label-size)', fontWeight: 600, color: 'var(--ink)' }}>{person.name}</span>
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded"
              style={{ fontSize: '8px', background: 'var(--gold-active)', color: 'var(--gold)' }}>
              <MessageSquare size={8} /> Comment
            </span>
            <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-hint)', marginLeft: 'auto' }}>
              {formatRelativeTime(comment.created_at)}
            </span>
          </div>
          <p className="mt-0.5" style={{ fontSize: 'var(--label-size)', color: 'var(--ink)', lineHeight: 1.5, margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>
            {comment.content}
          </p>
        </div>
      </div>
    </div>
  )
}

function SystemItem({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="flex items-start gap-2 py-1 px-1">
      <Circle size={5} className="flex-shrink-0 mt-1.5" style={{ color: 'var(--teal)', opacity: 0.3, fill: 'var(--teal)' }} />
      <span className="text-[11px]" style={{ color: 'var(--slate)', opacity: 0.6, flex: 1 }}>
        {entry.description}
      </span>
      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--slate)', opacity: 0.3 }}>
        {formatRelativeTime(entry.timestamp)}
      </span>
    </div>
  )
}
