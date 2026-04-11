import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, AlertTriangle, CheckCircle, HelpCircle, TrendingUp, Send } from 'lucide-react'
import { useProjectUpdates } from '../hooks/useApiData'
import type { ProjectUpdateRow } from '../hooks/useApiData'
import { usePostProjectUpdate } from '../hooks/useMutations'
import { useAuth } from '../hooks/useAuth'
import { getPersonInfo } from '../data/team'
import { formatRelativeTime } from '../lib/dateUtils'
import Avatar from './Avatar'
import MentionInput from './MentionInput'
import ReactionBar from './ReactionBar'
import { useToast } from '../hooks/useToast'

const TYPE_CONFIG: Record<string, { icon: typeof TrendingUp; color: string; bg: string; borderBg: string; label: string }> = {
  progress: { icon: TrendingUp, color: 'var(--teal)', bg: 'var(--teal-active)', borderBg: 'rgba(45, 138, 138, 0.25)', label: 'Progress' },
  blocker: { icon: AlertTriangle, color: 'var(--maroon)', bg: 'rgba(122, 0, 25, 0.1)', borderBg: 'rgba(122, 0, 25, 0.25)', label: 'Blocker' },
  result: { icon: CheckCircle, color: 'var(--green-light)', bg: 'rgba(34, 197, 94, 0.1)', borderBg: 'rgba(34, 197, 94, 0.25)', label: 'Result' },
  question: { icon: HelpCircle, color: 'var(--gold)', bg: 'var(--gold-active)', borderBg: 'rgba(201, 168, 76, 0.25)', label: 'Question' },
}

interface Props {
  projectSlug: string
}

export default function ProjectUpdateFeed({ projectSlug }: Props) {
  const { data: updates = [] } = useProjectUpdates(projectSlug)
  const postUpdate = usePostProjectUpdate(projectSlug)
  const { isAuthenticated } = useAuth()
  const { showSuccess } = useToast()
  const [text, setText] = useState('')
  const [updateType, setUpdateType] = useState<string>('progress')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    postUpdate.mutate({ content: text.trim(), update_type: updateType }, {
      onSuccess: () => showSuccess('Update posted'),
    })
    setText('')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.18 }}
      style={{ marginBottom: '2.5rem' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle size={16} style={{ color: 'var(--teal)' }} />
        <h2 style={{ fontWeight: 'var(--label-weight)', fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
          Project Updates
        </h2>
        {updates.length > 0 && (
          <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.6 }}>
            {updates.length}
          </span>
        )}
      </div>

      <div style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: '16px 20px' }} className="detail-card">
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
                fontSize: 'var(--value-size)', color: 'var(--ink)',
                background: 'var(--cream)', border: '1px solid rgba(201, 168, 76, 0.15)',
                borderRadius: 'var(--radius-lg)', padding: '10px 12px', resize: 'none', outline: 'none',
                lineHeight: 1.5, transition: 'border-color 0.2s', width: '100%',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--gold)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--gold-emphasis)')}
            />
            {text.trim() && (
              <motion.button type="submit" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                className="cursor-pointer flex-shrink-0 p-2.5 rounded-lg"
                style={{ background: 'var(--gold)', color: '#0f1923', border: 'none' }}>
                <Send size={16} />
              </motion.button>
            )}
          </div>
          {!isAuthenticated && import.meta.env.PROD && (
            <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.6, marginTop: '4px', display: 'inline-block' }}>
              <a href="/api/auth/login" style={{ color: 'var(--teal)', fontWeight: 'var(--weight-ui)' as any, textDecoration: 'underline' }}>Sign in</a> to post updates
            </span>
          )}
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
          <p style={{ fontSize: '12px', color: 'var(--slate)', opacity: 'var(--ink-hint)', textAlign: 'center', padding: 'var(--sp-md) 0', margin: 0 }}>
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
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--sp-md)',
        borderLeft: `3px solid ${config.color}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5" style={{ width: 28, height: 28 }}>
          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-7 !h-7 !min-w-0 !min-h-0" />
        </div>
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontSize: 'var(--value-size)', fontWeight: 600, color: 'var(--ink)' }}>
              {person.name}
            </span>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs"
              style={{ fontSize: '10px', background: config.bg, color: config.color }}>
              <Icon size={9} /> {config.label}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              {formatRelativeTime(update.created_at)}
            </span>
          </div>
          <p style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
            {update.content}
          </p>

          {/* Reactions */}
          <ReactionBar targetType="project_update" targetId={update.id} />
        </div>
      </div>
    </motion.div>
  )
}

