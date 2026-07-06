// ActivityStream — the whole-picture project feed (Design C, v77; P2-A 2026-06-10).
//
// ONE data source: GET /api/projects/:slug/activity — project-level
// activity_entries AND task rows rolled up by project_id. The composers write
// activity_entries (postActivityEntry) and the legacy endpoints are
// projections over the same rows, so merging legacy sources here would render
// every entry twice (the P2-A removal). Action items remain the only sidecar.
//
// Filter pills map to derived kinds:
//   'all' — everything · 'notes' — kind='update' (project entity) ·
//   'comments' — kind='comment' (project entity) · 'task-activity' — task-* rows
//
// Design ref: docs/superpowers/specs/2026-06-10-activity-entries-unified-timeline-design.md

import { useMemo, useState } from 'react'
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
} from 'lucide-react'
import {
  useActionItems,
  type ActionItemRow,
} from '../../hooks/useApiData'
import { usePostProjectUpdate, useAddComment, useToggleActionItem, useDeleteActivityEntry } from '../../hooks/useMutations'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import { getPersonInfo } from '../../data/team'
import { formatRelativeTime } from '../../lib/dateUtils'
import { useToast } from '../../hooks/useToast'
import { useUndoToast } from '../UndoToast'
import SmartCompose from '../SmartCompose'
import EmptyState from '../EmptyState'
import type { Project } from '../../data/types'
import { deriveRenderKind, filterMatchesKind } from '../../../shared/activityKinds'
import {
  ActivityEntryItem,
  canDeleteActivityEntry,
  type ActivityEntryItemRow,
} from '../activity/activityRender'
import { ICON_PROPS } from '../../lib/iconProps'
import { ACCENT_GOLD, withAlpha } from '../../lib/taskGrouping'

// ── Unified feed row shape (activity_entries) ─────────────────────────────────

// All fields from ActivityEntryItemRow; no additions needed.
type UnifiedEntryRow = ActivityEntryItemRow

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
  question: { icon: HelpCircle,    color: 'var(--gold)',        bg: 'var(--gold-active)',        borderBg: withAlpha(ACCENT_GOLD, 25),  label: 'Question' },
}

// Discriminated union of every event kind the stream carries.
// P2-A (2026-06-10): the legacy 'note'/'comment' arms are GONE — the project
// composers write activity_entries now and the old endpoints are projections
// over the same rows, so merging both sources would render every entry twice.
type StreamEvent =
  | { kind: 'action';        ts: string; id: string; row: ActionItemRow }
  | { kind: 'unified-entry'; ts: string; id: string; row: UnifiedEntryRow }

// motion props shared across all animated stream items.
const itemMotion = {
  layout: true as const,
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.2 },
}

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

  // Manual delete (Nick 2026-07-06): own entries, or any entry for the PI.
  // Server re-enforces author-or-PI on POST /api/activity/:id/delete.
  const deleteEntry = useDeleteActivityEntry()

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

  // Apply the active filter via filterMatchesKind (shared/activityKinds.ts).
  const visible = useMemo(() => {
    if (filter === 'all') return events
    return events.filter(
      (e) =>
        e.kind === 'unified-entry' &&
        filterMatchesKind(filter, e.row.entity_type, e.row.kind),
    )
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
            {/* N1b: was a --surface-2 tray with solid teal/gold active fills.
                De-boxed to ghost pills — active = tint + semantic text color
                (teal=note, gold=comment), resting transparent. */}
            <div style={{ display: 'inline-flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => setComposeKind('note')}
                style={{
                  fontSize: '10px', fontWeight: composeKind === 'note' ? 600 : 500, padding: '4px 12px',
                  borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                  background: composeKind === 'note' ? 'var(--teal-active)' : 'transparent',
                  color: composeKind === 'note' ? 'var(--teal)' : 'var(--slate)',
                }}
              >
                Note
              </button>
              <button
                type="button"
                onClick={() => setComposeKind('comment')}
                style={{
                  fontSize: '10px', fontWeight: composeKind === 'comment' ? 600 : 500, padding: '4px 12px',
                  borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
                  background: composeKind === 'comment' ? 'var(--gold-active)' : 'transparent',
                  color: composeKind === 'comment' ? 'var(--gold-on-emphasis)' : 'var(--slate)',
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
                  <Icon {...ICON_PROPS} size={10} />
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
              <StreamItem
                key={event.id}
                event={event}
                onToggleAction={(id) => {
                  toggleAction.mutate(id)
                  showUndo('Action item toggled', () => toggleAction.mutate(id))
                }}
                onDeleteEntry={
                  event.kind === 'unified-entry' && canDeleteActivityEntry(user, event.row.actor_slug)
                    ? () =>
                        deleteEntry.mutate({
                          id: event.row.id,
                          projectSlug: slug,
                          taskId: event.row.entity_type === 'task' ? event.row.entity_id : undefined,
                        })
                    : undefined
                }
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  )
}

// ── Per-event renderers ──────────────────────────────────────────────────

function StreamItem({ event, onToggleAction, onDeleteEntry }: { event: StreamEvent; onToggleAction: (id: string) => void; onDeleteEntry?: () => void }) {
  switch (event.kind) {
    case 'action':
      return <ActionItemRowView action={event.row} onToggle={onToggleAction} />
    case 'unified-entry':
      return (
        <ActivityEntryItem
          entry={event.row}
          // Project-stream: task-origin chip + reactions + animation.
          showReactions={true}
          showTaskOriginBadge={true}
          taskOriginBorderWidth={2}
          motionProps={itemMotion}
          onDelete={onDeleteEntry}
        />
      )
  }
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
          {completed ? <CheckCircle2 {...ICON_PROPS} size={18} /> : <Circle {...ICON_PROPS} size={18} />}
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
