// ActivityStream — P2-5 (Nick decision #6, 2026-06-09) + Phase-1 unified feed (Design C, v77).
//
// Phase 1 adds a fourth source alongside the legacy three: GET /api/projects/:slug/activity
// returns the whole-picture project feed — project-level rows AND task rows rolled up
// by project_id, all from activity_entries. Task-originated rows are rendered with a
// distinct task glyph + task entity link so users can see task chatter in context.
//
// Legacy sources (project_updates / comments / action_items) are KEPT as-is — project
// composers still write those tables in Phase 1 (their retarget is Phase 2). The unified
// feed rows are ADDITIVE. De-duplication against the legacy rows is not needed: only
// task_comments + task_updates were backfilled and those never appeared in the project
// stream before.
//
// Filter pills are extended to cover unified-feed derived kinds:
//   'all'          — everything
//   'notes'        — legacy project updates + unified kind='update' (project entity)
//   'comments'     — legacy comments + unified kind='comment' (project entity)
//   'task-activity' — task-originated unified rows (kind='task-comment', 'task-update', etc.)
//
// Design ref: docs/superpowers/specs/2026-06-10-activity-entries-unified-timeline-design.md

import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  Circle,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Activity as ActivityIcon,
  ClipboardList,
} from 'lucide-react'
import {
  useActionItems,
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
import LinkifiedText from '../LinkifiedText'
import EmptyState from '../EmptyState'
import type { Project } from '../../data/types'
import type { StoredKind, UpdateType } from '../../../shared/activityKinds'
import { deriveRenderKind } from '../../../shared/activityKinds'
import { UPDATE_TYPE_CONFIG, AuthorOnlyBadge, EntryTime } from '../activity/activityRender'

// ── Unified feed row shape (activity_entries) ─────────────────────────────────

interface UnifiedEntryRow {
  id: string
  entity_type: string
  entity_id: string
  project_id: string | null
  kind: StoredKind
  visibility: 'team' | 'author'
  actor_slug: string
  body: string
  mentions_json: string | null
  update_type: UpdateType | null
  metadata_json: string | null
  created_at: string
  /** Joined server-side for task-entity rows: COALESCE(short_title, title). */
  task_title?: string | null
  // derived at render — not stored
  _renderKind?: string
}

// ── Filter taxonomy ───────────────────────────────────────────────────────────

export type StreamFilter = 'all' | 'notes' | 'comments' | 'task-activity'

interface Props {
  project: Project
  filter: StreamFilter
}

// Note-type pills (mirrors ProjectUpdateFeed TYPE_CONFIG).
const NOTE_TYPE_CONFIG: Record<string, { icon: typeof TrendingUp; color: string; bg: string; borderBg: string; label: string }> = {
  progress: { icon: TrendingUp,    color: 'var(--teal)',        bg: 'var(--teal-active)',       borderBg: 'rgba(45,138,138,0.25)',   label: 'Progress' },
  blocker:  { icon: AlertTriangle, color: 'var(--maroon)',      bg: 'rgba(122,0,25,0.1)',       borderBg: 'rgba(122,0,25,0.25)',     label: 'Blocker' },
  result:   { icon: CheckCircle,   color: 'var(--green-light)', bg: 'rgba(34,197,94,0.1)',      borderBg: 'rgba(34,197,94,0.25)',    label: 'Result' },
  question: { icon: HelpCircle,    color: 'var(--gold)',        bg: 'var(--gold-active)',        borderBg: 'rgba(201,168,76,0.25)',  label: 'Question' },
}

// Discriminated union of every event kind the stream carries.
// P2-A (2026-06-10): the legacy 'note'/'comment' arms are GONE — the project
// composers write activity_entries now and the old endpoints are projections
// over the same rows, so merging both sources would render every entry twice.
type StreamEvent =
  | { kind: 'action';        ts: string; id: string; row: ActionItemRow }
  | { kind: 'unified-entry'; ts: string; id: string; row: UnifiedEntryRow }

export default function ActivityStream({ project, filter }: Props) {
  const slug = project.slug

  const { data: actionRows = [] } = useActionItems()

  // ── Unified feed (Design C, v77) — whole-picture project activity ────────────
  // Includes project-level activity_entries AND task rows rolled up by project_id.
  // Task-originated rows are additive — no de-dupe needed (task_comments /
  // task_updates were backfilled but never appeared in the project stream before).
  const { data: unifiedEntries = [] } = useQuery<UnifiedEntryRow[]>({
    queryKey: ['project-activity', slug],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${slug}/activity`)
      if (!res.ok) return []
      const data = await res.json() as { data?: UnifiedEntryRow[] }
      return (data.data || []).map((e) => ({
        ...e,
        _renderKind: deriveRenderKind(e.entity_type, e.kind),
      }))
    },
    staleTime: 30 * 1000,
    enabled: !!slug,
  })

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

  // Merge sources into one time-ordered list, newest first. The unified feed
  // IS the project's activity (project rows + task rollup); action items are
  // the only remaining sidecar source.
  const events = useMemo(() => {
    const out: StreamEvent[] = []
    // Action items only appear in the unfiltered ('all') view.
    if (filter === 'all') {
      for (const a of relatedActions) out.push({ kind: 'action', ts: a.created_at, id: `act-${a.id}`, row: a })
    }
    for (const e of unifiedEntries) {
      out.push({ kind: 'unified-entry', ts: e.created_at, id: `ue-${e.id}`, row: e })
    }
    return out.sort((a, b) => (a.ts > b.ts ? -1 : a.ts < b.ts ? 1 : 0))
  }, [relatedActions, unifiedEntries, filter])

  // Apply the active filter.
  const visible = useMemo(() => {
    if (filter === 'notes') {
      return events.filter((e) => e.kind === 'unified-entry' && (e.row._renderKind ?? '') === 'update')
    }
    if (filter === 'comments') {
      return events.filter((e) => e.kind === 'unified-entry' && (e.row._renderKind ?? '') === 'comment')
    }
    if (filter === 'task-activity') {
      return events.filter((e) => e.kind === 'unified-entry' && (e.row._renderKind ?? '').startsWith('task-'))
    }
    // 'all'
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
  // task-activity filter has no composer (task activity is authored on the task itself).
  const activeComposeKind =
    filter === 'all' ? composeKind :
    filter === 'comments' ? 'comment' :
    filter === 'task-activity' ? null :
    'note'

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

        {activeComposeKind === null ? (
          <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.85 }}>
            Task activity originates on individual tasks. Switch to Notes or Comments to post here.
          </span>
        ) : signedOut ? (
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
              filter === 'notes'         ? 'No notes yet' :
              filter === 'comments'      ? 'No comments yet' :
              filter === 'task-activity' ? 'No task activity yet' :
              'No activity yet'
            }
            subtitle={
              filter === 'comments'      ? 'Be the first to discuss this project.' :
              filter === 'task-activity' ? 'Task updates and comments will appear here.' :
              'Post a note above to keep the team informed.'
            }
            compact
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
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
    case 'action':
      return <ActionItemRowView action={event.row} onToggle={onToggleAction} />
    case 'unified-entry':
      return <UnifiedEntryItem entry={event.row} />
  }
}

const itemMotion = {
  layout: true as const,
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.2 },
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

// ── Unified entry renderer (Design C, v77 activity_entries rows) ─────────────
//
// Handles both project-level rows (entity_type='project') and task-originated
// rows (entity_type='task', _renderKind='task-comment'|'task-update' etc.).
// Task rows get a small task glyph + an entity link so you can navigate to the
// task that generated the chatter.

function UnifiedEntryItem({ entry }: { entry: UnifiedEntryRow }) {
  const isTask = entry.entity_type === 'task'
  const isHermes = entry.actor_slug === 'claude-ai'
  const person = getPersonInfo(entry.actor_slug)

  const taskHref = isTask ? `/portal/my-tasks?openTask=${encodeURIComponent(entry.entity_id)}` : null
  const taskLabel = entry.task_title || null

  // Left-bar color + badge logic mirrors TaskActivityFeed.
  let barColor = 'rgba(201,168,76,0.35)'   // default: gold (comment)
  let badgeEl: ReactNode = null

  if (entry.kind === 'update') {
    const ut = entry.update_type || 'progress'
    const cfg = UPDATE_TYPE_CONFIG[ut] || UPDATE_TYPE_CONFIG.progress
    const Icon = cfg.icon
    barColor = cfg.color
    badgeEl = (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded"
        style={{ fontSize: '10px', background: cfg.bg, color: cfg.color }}
      >
        <Icon size={9} aria-hidden="true" /> {cfg.label}
      </span>
    )
  } else if (entry.kind === 'comment') {
    barColor = 'rgba(201,168,76,0.35)'
    badgeEl = null // no badge for plain comments
  } else if (entry.kind === 'system') {
    barColor = 'var(--border-subtle)'
  }

  // Completions render as compact one-liners (like the task feed's
  // CompletionEntry) — a full card per checkmark made the feed needlessly tall
  // (Nick 2026-06-10). body, when present, is the completion note.
  if (entry.kind === 'completion') {
    return (
      <motion.div {...itemMotion} className="flex items-center gap-2 py-1 px-1">
        <CheckCircle size={14} className="flex-shrink-0" style={{ color: 'var(--green)', opacity: 0.85, flexShrink: 0 }} aria-hidden="true" />
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--ink)', flex: 1, minWidth: 0, lineHeight: 1.4 }}>
          <span style={{ fontWeight: 500 }}>{person.name}</span>
          {' completed '}
          {isTask && taskHref ? (
            <a
              href={taskHref}
              onClick={(e) => e.stopPropagation()}
              style={{ color: 'var(--teal)', fontWeight: 500, textDecoration: 'none' }}
            >
              {taskLabel || 'a task'}
            </a>
          ) : (
            taskLabel || 'a task'
          )}
          {entry.body ? <> — <LinkifiedText text={entry.body} /></> : null}
        </span>
        {entry.visibility === 'author' && <AuthorOnlyBadge />}
        <EntryTime ts={entry.created_at} />
      </motion.div>
    )
  }

  if (isHermes) {
    return (
      <motion.div
        {...itemMotion}
        style={{ background: 'var(--gold-hover)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-sm) var(--sp-md)' }}
        className="detail-card"
      >
        {isTask && taskHref && (
          <TaskOriginBadge taskHref={taskHref} entityId={entry.entity_id} label={taskLabel} />
        )}
        <div className="flex items-center gap-1.5 mb-1">
          <HermesMark size={14} variant="avatar" />
          <span style={{ fontSize: '10px', color: 'var(--gold)', fontWeight: 500 }}>Hermes</span>
          {entry.visibility === 'author' && <AuthorOnlyBadge />}
          <EntryTime ts={entry.created_at} />
        </div>
        {isHermesPending(entry.body) ? (
          <HermesPending askedAt={entry.created_at} />
        ) : (
          <HermesResponse content={entry.body} />
        )}
        {!isTask && <ReactionBar targetType="comment" targetId={entry.id} />}
      </motion.div>
    )
  }

  if (entry.kind === 'system') {
    return (
      <motion.div
        {...itemMotion}
        className="flex items-start gap-2 py-1 px-1"
      >
        <Circle size={5} className="flex-shrink-0 mt-1.5" style={{ color: 'var(--teal)', opacity: 0.85, fill: 'var(--teal)', flexShrink: 0 }} aria-hidden="true" />
        {isTask && taskHref && (
          <TaskOriginBadge taskHref={taskHref} entityId={entry.entity_id} label={taskLabel} inline />
        )}
        <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.85, flex: 1, lineHeight: 1.4 }}>
          <LinkifiedText text={entry.body} />
        </span>
        {entry.visibility === 'author' && <AuthorOnlyBadge />}
        <EntryTime ts={entry.created_at} />
      </motion.div>
    )
  }

  return (
    <motion.div
      {...itemMotion}
      style={{
        background: 'var(--cream)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--sp-sm) var(--sp-md)',
        borderLeft: `3px solid ${barColor}`,
        // Task-originated rows get a subtle left-inset visual distinction.
        ...(isTask ? { marginLeft: 4, borderLeftWidth: 2 } : {}),
      }}
      className="detail-card"
    >
      {isTask && taskHref && (
        <TaskOriginBadge taskHref={taskHref} entityId={entry.entity_id} label={taskLabel} />
      )}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5" style={{ width: 28, height: 28 }}>
          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="base-sm" variant="ice" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span style={{ fontSize: 'var(--value-size)', fontWeight: 600, color: 'var(--ink)' }}>{person.name}</span>
            {badgeEl}
            {entry.visibility === 'author' && <AuthorOnlyBadge />}
            <EntryTime ts={entry.created_at} />
          </div>
          <p style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
            <LinkifiedText text={entry.body} />
          </p>
          {/* Reactions on project-level notes/comments (target ids carry over —
              backfilled rows preserved their legacy ids). Task rows match the
              task feed, which has no reactions. */}
          {!isTask && (
            <ReactionBar
              targetType={entry.kind === 'update' ? 'project_update' : 'comment'}
              targetId={entry.id}
            />
          )}
        </div>
      </div>
    </motion.div>
  )
}

/** Small badge linking back to the originating task in the project feed.
 *  Shows the task's display title (short_title || title, joined server-side)
 *  so the feed names the task instead of a bare "task" chip. */
function TaskOriginBadge({ taskHref, entityId, label, inline }: { taskHref: string; entityId: string; label?: string | null; inline?: boolean }) {
  return (
    <a
      href={taskHref}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Go to task ${label || entityId}`}
      className="inline-flex items-center gap-1"
      style={{
        fontSize: '9px',
        color: 'var(--teal)',
        background: 'var(--teal-active)',
        borderRadius: 'var(--radius-sm)',
        padding: '1px 5px',
        textDecoration: 'none',
        marginBottom: inline ? 0 : 4,
        marginRight: inline ? 4 : 0,
        flexShrink: 0,
        display: 'inline-flex',
        maxWidth: 260,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      <ClipboardList size={9} aria-hidden="true" style={{ flexShrink: 0 }} />
      {label || 'task'}
    </a>
  )
}

function MetaTime({ ts }: { ts: string }) {
  return (
    <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
      {formatRelativeTime(ts)}
    </span>
  )
}
