// ActivityStream — P2-5 (Nick decision #6, 2026-06-09).
//
// ONE chronological activity stream for a project. The old ProjectDetail
// tabs (Notes / Comments / Activity) split the same content across three
// panels and ProjectActivity re-embedded notes + comments a SECOND time —
// the same rows rendered twice. This collapses all of it into a single
// merged, time-ordered feed; the tab strip's Notes / Comments / All become
// FILTERS over this one stream, not duplicate renderers.
//
// Sources merged client-side (no new backend — every source already carries
// created_at): project updates ("notes"), comments, and meeting action items.
// The note + comment composers (MentionInput via SmartCompose — Rule 7) post
// into the stream; the action-item toggle stays as an inline affordance.
//
// Decisions + Dependencies keep their own dedicated sections in ProjectDetail
// (they each have a distinct management UI and link out, and were NOT the
// duplicated content — the duplication this fixes is notes/comments that
// rendered in both their own tab AND the Activity tab). Rendering them once
// in their section avoids the "same content twice" the ticket targets.
//
// Notes remain a team-visible informal progress log (S18 copy) — the notes
// data architecture is unchanged; M5 owns the notes/description privacy split.

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  Circle,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Activity as ActivityIcon,
} from 'lucide-react'
import {
  useProjectUpdates,
  useComments,
  useActionItems,
  type ProjectUpdateRow,
  type Comment,
  type ActionItemRow,
} from '../../hooks/useApiData'
import { usePostProjectUpdate, useAddComment, useToggleActionItem } from '../../hooks/useMutations'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import { getPersonInfo } from '../../data/team'
import { formatRelativeTime } from '../../lib/dateUtils'
import { useToast } from '../../hooks/useToast'
import { useUndoToast } from '../UndoToast'
import Avatar from '../Avatar'
import SmartCompose from '../SmartCompose'
import ReactionBar from '../ReactionBar'
import HermesMark from '../HermesMark'
import HermesResponse from '../HermesResponse'
import HermesPending, { isHermesPending } from '../HermesPending'
import EmptyState from '../EmptyState'
import type { Project } from '../../data/types'

export type StreamFilter = 'all' | 'notes' | 'comments'

interface Props {
  project: Project
  filter: StreamFilter
}

// Note-type pills (mirrors ProjectUpdateFeed TYPE_CONFIG).
const NOTE_TYPE_CONFIG: Record<string, { icon: typeof TrendingUp; color: string; bg: string; borderBg: string; label: string }> = {
  progress: { icon: TrendingUp, color: 'var(--teal)', bg: 'var(--teal-active)', borderBg: 'rgba(45, 138, 138, 0.25)', label: 'Progress' },
  blocker: { icon: AlertTriangle, color: 'var(--maroon)', bg: 'rgba(122, 0, 25, 0.1)', borderBg: 'rgba(122, 0, 25, 0.25)', label: 'Blocker' },
  result: { icon: CheckCircle, color: 'var(--green-light)', bg: 'rgba(34, 197, 94, 0.1)', borderBg: 'rgba(34, 197, 94, 0.25)', label: 'Result' },
  question: { icon: HelpCircle, color: 'var(--gold)', bg: 'var(--gold-active)', borderBg: 'rgba(201, 168, 76, 0.25)', label: 'Question' },
}

// Discriminated union of every event kind the stream carries.
type StreamEvent =
  | { kind: 'note'; ts: string; id: string; row: ProjectUpdateRow }
  | { kind: 'comment'; ts: string; id: string; row: Comment }
  | { kind: 'action'; ts: string; id: string; row: ActionItemRow }

export default function ActivityStream({ project, filter }: Props) {
  const slug = project.slug
  const { data: updates = [] } = useProjectUpdates(slug)
  const { data: comments = [] } = useComments(slug)
  const { data: actionRows = [] } = useActionItems()

  const { isAuthenticated, user } = useAuth()
  const { showSuccess } = useToast()
  const { showUndo } = useUndoToast()
  const postUpdate = usePostProjectUpdate(slug)
  const addComment = useAddComment(slug)
  const toggleAction = useToggleActionItem()

  // Note composer state (type pill)
  const [noteType, setNoteType] = useState('progress')

  // Which composer to show in the combined ('all') view: note or comment.
  const [composeKind, setComposeKind] = useState<'note' | 'comment'>('note')

  const relatedActions = useMemo(
    () =>
      actionRows.filter(
        (ai) => ai.project_id === project.slug || ai.project_id === project.title,
      ),
    [actionRows, project.slug, project.title],
  )

  // Merge every source into one time-ordered list, newest first.
  const events = useMemo(() => {
    const out: StreamEvent[] = []
    for (const u of updates) out.push({ kind: 'note', ts: u.created_at, id: `note-${u.id}`, row: u })
    for (const c of comments) out.push({ kind: 'comment', ts: c.created_at, id: `comment-${c.id}`, row: c })
    // Action items only appear in the unfiltered ('all') view — Notes/Comments
    // filters carry only their own kind.
    if (filter === 'all') {
      for (const a of relatedActions) out.push({ kind: 'action', ts: a.created_at, id: `act-${a.id}`, row: a })
    }
    return out.sort((a, b) => (a.ts > b.ts ? -1 : a.ts < b.ts ? 1 : 0))
  }, [updates, comments, relatedActions, filter])

  // Apply the active filter (notes / comments / all).
  const visible = useMemo(() => {
    if (filter === 'notes') return events.filter((e) => e.kind === 'note')
    if (filter === 'comments') return events.filter((e) => e.kind === 'comment')
    return events
  }, [events, filter])

  const handlePostNote = (content: string) =>
    new Promise<void>((resolve) => {
      postUpdate.mutate({ content, update_type: noteType }, {
        onSuccess: () => { showSuccess('Note posted'); resolve() },
        onError: () => resolve(),
      })
    })

  const handlePostComment = (content: string) =>
    new Promise<void>((resolve) => {
      addComment.mutate({ content, author: emailToSlug(user?.email) || 'anonymous' }, {
        onSuccess: () => { showSuccess('Comment posted'); resolve() },
        onError: () => resolve(),
      })
    })

  // In 'all' the composer toggles note/comment; in a single filter it is fixed.
  const activeComposeKind = filter === 'all' ? composeKind : filter === 'comments' ? 'comment' : 'note'

  const signedOut = !isAuthenticated && import.meta.env.PROD

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ marginBottom: '2.5rem' }}
    >
      {/* ── Composer ── */}
      <div
        style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: '16px 20px', marginBottom: '1.5rem' }}
        className="detail-card"
      >
        {/* Note / Comment toggle (only in 'all'; the filtered views are fixed) */}
        {filter === 'all' && (
          <div className="flex items-center gap-2 mb-2">
            <div style={{ display: 'inline-flex', gap: 4, padding: 2, borderRadius: 'var(--radius-full)', background: 'var(--surface-2)' }}>
              <button
                type="button"
                onClick={() => setComposeKind('note')}
                style={{
                  fontSize: '10px', fontWeight: 500, padding: '4px 12px',
                  borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                  background: composeKind === 'note' ? 'var(--teal-solid)' : 'transparent',
                  color: composeKind === 'note' ? 'var(--ink-bright, #fff)' : 'var(--slate)',
                }}
              >
                Note
              </button>
              <button
                type="button"
                onClick={() => setComposeKind('comment')}
                style={{
                  fontSize: '10px', fontWeight: 500, padding: '4px 12px',
                  borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                  background: composeKind === 'comment' ? 'var(--gold)' : 'transparent',
                  color: composeKind === 'comment' ? '#0f1923' : 'var(--slate)',
                }}
              >
                Comment
              </button>
            </div>
          </div>
        )}

        {/* Note-type pills (only when composing a note) */}
        {activeComposeKind === 'note' && (
          <div className="flex gap-1.5 mb-2">
            {Object.entries(NOTE_TYPE_CONFIG).map(([key, config]) => {
              const Icon = config.icon
              const isActive = noteType === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setNoteType(key)}
                  className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all"
                  style={{
                    fontSize: '10px',
                    background: isActive ? config.bg : 'transparent',
                    color: isActive ? config.color : 'var(--slate)',
                    border: isActive ? `1px solid ${config.borderBg}` : '1px solid transparent',
                    opacity: isActive ? 1 : 0.85,
                    minHeight: '32px',
                  }}
                >
                  <Icon size={10} />
                  {config.label}
                </button>
              )
            })}
          </div>
        )}

        {signedOut ? (
          <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.85 }}>
            <a href="/api/auth/login" style={{ color: 'var(--teal)', fontWeight: 500, textDecoration: 'underline' }}>Sign in</a>
            {activeComposeKind === 'note' ? ' to post notes' : ' to comment'}
          </span>
        ) : activeComposeKind === 'note' ? (
          <SmartCompose
            key="note-composer"
            theme="light"
            bare
            onSubmit={handlePostNote}
            submitting={postUpdate.isPending}
            uploadContext={{ type: 'project', id: slug }}
            placeholder="Post a note — informal progress log, visible to the team (use @mention to tag)"
            rows={2}
            alwaysShowToolbar
            submitLabel="Post note"
          />
        ) : (
          <SmartCompose
            key="comment-composer"
            theme="light"
            bare
            onSubmit={handlePostComment}
            submitting={addComment.isPending}
            uploadContext={{ type: 'project', id: slug }}
            placeholder="Add a comment — team discussion (use @mention to tag)"
            rows={2}
            alwaysShowToolbar
            submitLabel="Comment"
          />
        )}
      </div>

      {/* ── Stream ── */}
      {visible.length === 0 ? (
        <div style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)' }} className="detail-card">
          <EmptyState
            icon={<ActivityIcon size={28} />}
            title={
              filter === 'notes'
                ? 'No notes yet'
                : filter === 'comments'
                  ? 'No comments yet'
                  : 'No activity yet'
            }
            subtitle={
              filter === 'comments'
                ? 'Be the first to discuss this project.'
                : 'Post a note above to keep the team informed.'
            }
            compact
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {visible.map((event) => (
              <StreamItem key={event.id} event={event} onToggleAction={(id) => {
                toggleAction.mutate(id)
                showUndo('Action item toggled', () => toggleAction.mutate(id))
              }} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  )
}

// ── Per-event renderers ──────────────────────────────────────────────────

function StreamItem({ event, onToggleAction }: { event: StreamEvent; onToggleAction: (id: string) => void }) {
  switch (event.kind) {
    case 'note':
      return <NoteItem update={event.row} />
    case 'comment':
      return <CommentItem comment={event.row} />
    case 'action':
      return <ActionItemRowView action={event.row} onToggle={onToggleAction} />
  }
}

const itemMotion = {
  layout: true as const,
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.2 },
}

function NoteItem({ update }: { update: ProjectUpdateRow }) {
  const config = NOTE_TYPE_CONFIG[update.update_type] || NOTE_TYPE_CONFIG.progress
  const Icon = config.icon
  const person = getPersonInfo(update.author)
  return (
    <motion.div
      {...itemMotion}
      style={{ background: 'var(--cream)', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-md)', borderLeft: `3px solid ${config.color}` }}
      className="detail-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5" style={{ width: 28, height: 28 }}>
          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="base-sm" variant="ice" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span style={{ fontSize: 'var(--value-size)', fontWeight: 600, color: 'var(--ink)' }}>{person.name}</span>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded"
              style={{ fontSize: '10px', background: config.bg, color: config.color }}>
              <Icon size={9} /> {config.label}
            </span>
            <MetaTime ts={update.created_at} />
          </div>
          <p style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
            {update.content}
          </p>
          <ReactionBar targetType="project_update" targetId={update.id} />
        </div>
      </div>
    </motion.div>
  )
}

function CommentItem({ comment }: { comment: Comment }) {
  const isAI = comment.author_slug === 'claude-ai'
  if (isAI) {
    return (
      <motion.div {...itemMotion} className="flex gap-3">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: 'var(--gold-hover)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-sm) var(--sp-md)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <HermesMark size={14} variant="avatar" />
              <span style={{ fontSize: '10px', color: 'var(--gold)', fontWeight: 500 }}>Hermes</span>
              <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)', marginLeft: 'auto' }}>
                {formatRelativeTime(comment.created_at)}
              </span>
            </div>
            {isHermesPending(comment.content) ? (
              <HermesPending askedAt={comment.created_at} />
            ) : (
              <HermesResponse content={comment.content} />
            )}
            <ReactionBar targetType="comment" targetId={comment.id} />
          </div>
        </div>
      </motion.div>
    )
  }
  const info = comment.author_slug ? getPersonInfo(comment.author_slug) : null
  const isKnown = info && info.name !== 'Unknown'
  const displayName = isKnown ? info!.name : (comment.author_name || 'Team Member')
  const initials = isKnown
    ? info!.initials
    : (comment.author_name || 'U').split(' ').map((n) => n[0]).join('').toUpperCase()
  return (
    <motion.div {...itemMotion} className="flex gap-3">
      <div className="flex-shrink-0 mt-0.5" style={{ width: 28, height: 28 }}>
        <Avatar name={displayName} initials={initials} variant="ice" size="base-sm" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span style={{ fontSize: 'var(--value-size)', fontWeight: 600, color: 'var(--ink)' }}>{displayName}</span>
          <MetaTime ts={comment.created_at} />
        </div>
        <p style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', lineHeight: 1.5, margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>
          {comment.content}
        </p>
        <ReactionBar targetType="comment" targetId={comment.id} />
      </div>
    </motion.div>
  )
}

function ActionItemRowView({ action, onToggle }: { action: ActionItemRow; onToggle: (id: string) => void }) {
  const completed = action.completed === 1
  return (
    <motion.div
      {...itemMotion}
      style={{ background: 'var(--cream)', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-md)', borderLeft: '3px solid var(--slate)' }}
      className="detail-card"
    >
      <div className="flex items-start gap-3">
        <motion.button
          type="button"
          onClick={() => onToggle(action.id)}
          className="cursor-pointer flex-shrink-0 mt-0.5"
          style={{ background: 'none', border: 'none', padding: 0, color: completed ? 'var(--teal)' : 'var(--slate)' }}
          whileTap={{ scale: 0.85 }}
          aria-label={completed ? 'Mark action item incomplete' : 'Mark action item complete'}
        >
          {completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </motion.button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span style={{ fontSize: '10px', color: 'var(--slate)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Action item</span>
            <MetaTime ts={action.created_at} />
          </div>
          <p style={{
            fontSize: 'var(--value-size)', color: 'var(--ink)', margin: 0, lineHeight: 1.4,
            textDecoration: completed ? 'line-through' : 'none', opacity: completed ? 0.85 : 1,
          }}>
            {action.description}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              {getPersonInfo(action.assignee).name}
            </span>
            {action.meeting_title && (
              <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>
                from {action.meeting_title}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function MetaTime({ ts }: { ts: string }) {
  return (
    <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
      {formatRelativeTime(ts)}
    </span>
  )
}
