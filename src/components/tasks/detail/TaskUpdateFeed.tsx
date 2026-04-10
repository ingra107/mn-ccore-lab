import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, AlertTriangle, CheckCircle, HelpCircle, Terminal, Send } from 'lucide-react'
import { useTaskUpdates } from '../../../hooks/useApiData'
import type { TaskUpdateRow } from '../../../hooks/useApiData'
import { usePostTaskUpdate } from '../../../hooks/useMutations'
import { getPersonInfo } from '../../../data/team'
import { formatRelativeTime } from '../../../lib/dateUtils'
import Avatar from '../../Avatar'
import ReactionBar from '../../ReactionBar'
import { useToast } from '../../../hooks/useToast'

const TYPE_CONFIG: Record<string, { icon: typeof TrendingUp; color: string; bg: string; borderColor: string; label: string }> = {
  progress: { icon: TrendingUp, color: 'var(--teal)', bg: 'rgba(45, 138, 138, 0.1)', borderColor: 'rgba(45, 138, 138, 0.4)', label: 'Progress' },
  blocker: { icon: AlertTriangle, color: 'var(--maroon)', bg: 'rgba(122, 0, 25, 0.1)', borderColor: 'rgba(122, 0, 25, 0.4)', label: 'Blocker' },
  result: { icon: CheckCircle, color: 'var(--green)', bg: 'rgba(34, 197, 94, 0.1)', borderColor: 'rgba(34, 197, 94, 0.4)', label: 'Result' },
  question: { icon: HelpCircle, color: 'var(--gold)', bg: 'rgba(201, 168, 76, 0.1)', borderColor: 'rgba(201, 168, 76, 0.4)', label: 'Question' },
  session: { icon: Terminal, color: 'var(--slate)', bg: 'rgba(100, 116, 139, 0.08)', borderColor: 'rgba(100, 116, 139, 0.25)', label: 'Session' },
}

export function TaskUpdateFeed({ taskId }: { taskId: string }) {
  const { data: updates = [] } = useTaskUpdates(taskId)
  const postUpdate = usePostTaskUpdate(taskId)
  const { showSuccess } = useToast()
  const [text, setText] = useState('')
  const [updateType, setUpdateType] = useState<string>('progress')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    postUpdate.mutate({ content: text.trim(), update_type: updateType }, {
      onSuccess: () => showSuccess('Note added'),
    })
    setText('')
  }

  return (
    <div>
      {/* Post note form */}
      <form onSubmit={handleSubmit} className="mb-3">
        {/* Type selector */}
        <div className="flex gap-1 mb-2 flex-wrap">
          {Object.entries(TYPE_CONFIG).filter(([key]) => key !== 'session').map(([key, config]) => {
            const Icon = config.icon
            const isActive = updateType === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setUpdateType(key)}
                className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all"
                style={{
                  fontSize: '10px',
                  background: isActive ? config.bg : 'transparent',
                  color: isActive ? config.color : 'var(--slate)',
                  border: isActive ? `1px solid ${config.borderColor}` : '1px solid transparent',
                  opacity: isActive ? 1 : 0.5,
                }}
              >
                <Icon size={10} />
                {config.label}
              </button>
            )
          })}
        </div>

        <div className="flex gap-2 items-end">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a note..."
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            className="flex-1 rounded-md border text-sm outline-none resize-none"
            style={{
              fontSize: 'var(--value-size)', color: 'var(--ink)',
              background: 'var(--cream)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)', padding: '8px 10px',
              lineHeight: 1.5, transition: 'border-color 0.15s',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--teal)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
          />
          {text.trim() && (
            <motion.button
              type="submit"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="cursor-pointer flex-shrink-0 p-2 rounded-lg"
              style={{ background: 'var(--teal)', color: 'white', border: 'none' }}
            >
              <Send size={14} />
            </motion.button>
          )}
        </div>
      </form>

      {/* Updates list */}
      {updates.length > 0 ? (
        <div className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {updates.map((update) => (
              <NoteCard key={update.id} update={update} />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <p className="text-xs text-center py-3" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)', margin: 0 }}>
          No notes yet — add one above
        </p>
      )}
    </div>
  )
}

function NoteCard({ update }: { update: TaskUpdateRow }) {
  const config = TYPE_CONFIG[update.update_type] || TYPE_CONFIG.progress
  const Icon = config.icon
  const person = getPersonInfo(update.author_slug)
  const isSession = update.update_type === 'session'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.2 }}
      style={{
        background: 'var(--cream)',
        borderRadius: 'var(--radius-lg)',
        padding: '10px 12px',
        borderLeft: `3px solid ${config.color}`,
        opacity: isSession ? 0.7 : 1,
      }}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex-shrink-0 mt-0.5" style={{ width: 24, height: 24 }}>
          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-6 !h-6 !min-w-0 !min-h-0 !text-[7px]" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>
              {person.name}
            </span>
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-xs"
              style={{ fontSize: '9px', background: config.bg, color: config.color }}>
              <Icon size={9} /> {config.label}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              {formatRelativeTime(update.created_at)}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
            {update.content}
          </p>
          <ReactionBar targetType="task_update" targetId={update.id} compact />
        </div>
      </div>
    </motion.div>
  )
}
