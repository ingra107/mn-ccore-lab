import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, AlertTriangle, CheckCircle, HelpCircle, TrendingUp, Send } from 'lucide-react'
import { useProjectUpdates } from '../hooks/useApiData'
import type { ProjectUpdateRow } from '../hooks/useApiData'
import { useAuth } from '../hooks/useAuth'
import Avatar from './Avatar'
import { directors, getAllMembers } from '../data/team'

function getPersonInfo(slug: string) {
  const director = directors.find((d) => d.slug === slug)
  if (director) return { name: director.name, initials: director.initials, photoUrl: director.photoUrl }
  const member = getAllMembers().find((m) => m.slug === slug)
  if (member) return { name: member.name, initials: member.initials, photoUrl: member.photoUrl }
  // Handle email addresses
  const name = slug.includes('@') ? slug.split('@')[0] : slug
  return { name, initials: name.slice(0, 2).toUpperCase(), photoUrl: undefined }
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const TYPE_CONFIG: Record<string, { icon: typeof TrendingUp; color: string; label: string }> = {
  progress: { icon: TrendingUp, color: 'var(--teal)', label: 'Progress' },
  blocker: { icon: AlertTriangle, color: 'var(--maroon)', label: 'Blocker' },
  result: { icon: CheckCircle, color: '#22c55e', label: 'Result' },
  question: { icon: HelpCircle, color: 'var(--gold)', label: 'Question' },
}

interface Props {
  projectSlug: string
}

export default function ProjectUpdateFeed({ projectSlug }: Props) {
  const { data: updates = [] } = useProjectUpdates(projectSlug)
  const { isAuthenticated } = useAuth()
  const [text, setText] = useState('')
  const [updateType, setUpdateType] = useState<string>('progress')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    // Would call mutation — for now just show the form works
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
                    background: isActive ? `${config.color}18` : 'transparent',
                    color: isActive ? config.color : 'var(--slate)',
                    border: isActive ? `1px solid ${config.color}40` : '1px solid transparent',
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
              placeholder={isAuthenticated ? 'Post a project update...' : 'Sign in to post updates'}
              disabled={!isAuthenticated && import.meta.env.PROD}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              style={{
                flex: 1, fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)',
                background: 'var(--cream)', border: '1px solid rgba(201, 168, 76, 0.15)',
                borderRadius: '8px', padding: '10px 12px', resize: 'none', outline: 'none',
                lineHeight: 1.5, transition: 'border-color 0.2s',
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
              style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', background: `${config.color}12`, color: config.color }}>
              <Icon size={9} /> {config.label}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>
              {formatRelativeTime(update.created_at)}
            </span>
          </div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
            {update.content}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
