// ActivityStream — the whole-picture project feed (Design C, v77; P2-A 2026-06-10).
//
// ONE data source: GET /api/projects/:slug/activity — project-level
// activity_entries AND task rows rolled up by project_id. The composers write
// activity_entries (postActivityEntry) and the legacy endpoints are
// projections over the same rows, so merging legacy sources here would render
// every entry twice (the P2-A removal). Meeting-linked tasks are the one
// remaining sidecar source, and since #112 they are folded into the same
// lifecycle rendering rather than carrying a card anatomy of their own.
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
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Activity as ActivityIcon,
} from 'lucide-react'
import { usePostProjectUpdate, useAddComment, useDeleteActivityEntry, useEditActivityEntry, useDismissThread } from '../../hooks/useMutations'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import { useToast } from '../../hooks/useToast'
import SmartCompose from '../SmartCompose'
import EmptyState from '../EmptyState'
import type { Project } from '../../data/types'
import { deriveRenderKind, filterMatchesKind, isRepliableKind } from '../../../shared/activityKinds'
import {
  ActivityEntryItem,
  type ActivityEntryItemRow,
} from '../activity/activityRender'
import { ActivityThread } from '../activity/ActivityThread'
import { ShowHiddenToggle } from '../activity/ShowHiddenToggle'
import { canDeleteActivityEntry } from '../activity/activityPermissions'
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
  /** #111 — open a task named in the feed WHERE THE VIEWER IS. Returns true when
   *  the surface actually opened it; false lets the link's href navigate. */
  onOpenTask?: (taskId: string) => boolean
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
//
// #112 (2026-08-05): the 'action' arm is gone too. It rendered its own card
// showing `task.description`, which for every meeting-extracted task is
// provenance boilerplate ("From the R01 Meet Follow Up Aim 3 meeting on July 24,
// 2026. Source: [[Context/Meetings/…]] [meeting:cal-…]") and NEVER the task's
// name — measured on all 9 rows of this project on prod. Nick: "very
// uninformative… aren't all action items associated with a task? If that's true,
// we should make it that way." They are (T19/#547 made action items tasks), so
// they now render through the SAME lifecycle line as "Created this task".
//
// With the 'action' arm gone every event is a unified entry, so this is a plain
// row type rather than a one-member discriminated union — the tag would be a
// constant that no branch can read.
interface StreamEvent { ts: string; id: string; row: UnifiedEntryRow }

// motion props shared across all animated stream items.
const itemMotion = {
  layout: true as const,
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.2 },
}

export default function ActivityStream({ project, filter, onOpenTask }: Props) {
  const slug = project.slug

  // ── Unified feed (Design C, v77) — whole-picture project activity ────────────
  // Includes project-level activity_entries AND task rows rolled up by project_id.
  // Task-originated rows are additive — no de-dupe needed (task_comments /
  // task_updates were backfilled but never appeared in the project stream before).
  // v102: "Show hidden" reveals dismissed threads (refetch with include_hidden).
  const [showHidden, setShowHidden] = useState(false)
  const { data: unified } = useQuery<{ entries: UnifiedEntryRow[]; hiddenCount: number }>({
    queryKey: ['project-activity', slug, showHidden],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${slug}/activity${showHidden ? '?include_hidden=1' : ''}`)
      if (!res.ok) return { entries: [], hiddenCount: 0 }
      const data = await res.json() as { data?: UnifiedEntryRow[]; hidden_count?: number }
      return {
        entries: (data.data || []).map((e) => ({ ...e, _renderKind: deriveRenderKind(e.entity_type, e.kind) })),
        hiddenCount: data.hidden_count || 0,
      }
    },
    staleTime: 30 * 1000,
    enabled: !!slug,
  })
  // Memoized: a fresh `?? []` every render made both downstream useMemos
  // recompute on every render (react-hooks/exhaustive-deps warned about it).
  const unifiedEntries = useMemo(() => unified?.entries ?? [], [unified])
  const hiddenCount = unified?.hiddenCount ?? 0

  const { isAuthenticated, user } = useAuth()
  const { showSuccess } = useToast()
  const postUpdate = usePostProjectUpdate(slug)
  const addComment = useAddComment(slug)
  // #112: the action-item card's own complete/reopen toggle went with the card.
  // Completing lives where the task does — the row's name now opens the task's
  // detail panel in place (#111), which is the canonical place to do it.

  // Manual delete (Nick 2026-07-06): own entries, or any entry for the PI.
  // Server re-enforces author-or-PI on POST /api/activity/:id/delete.
  const deleteEntry = useDeleteActivityEntry()
  const editEntry = useEditActivityEntry()
  const dismissThread = useDismissThread()

  // Note composer state (type pill)
  const [noteType, setNoteType] = useState('progress')

  // Which composer to show in the combined ('all') view: note or comment.
  const [composeKind, setComposeKind] = useState<'note' | 'comment'>('note')

  // The unified feed IS the project's activity (project rows + task rollup).
  // It used to be merged with a synthetic "Created this task" row fabricated
  // per meeting-linked task, because those tasks' real creation rows either did
  // not exist or carried the wrong project_id. Both were fixed at rest in #113
  // (37 rows backfilled, 43 re-pointed at the task's project), so there is one
  // source again. Do NOT reintroduce a client-side row here: a feed entry the
  // server cannot resolve cannot be deleted, edited or dismissed.
  const events = useMemo(() => {
    const out: StreamEvent[] = []
    for (const e of unifiedEntries) {
      out.push({ ts: e.created_at, id: `ue-${e.id}`, row: e })
    }
    return out.sort((a, b) => (a.ts > b.ts ? -1 : a.ts < b.ts ? 1 : 0))
  }, [unifiedEntries])

  // Apply the active filter via filterMatchesKind (shared/activityKinds.ts).
  const visible = useMemo(() => {
    if (filter === 'all') return events
    return events.filter((e) => filterMatchesKind(filter, e.row.entity_type, e.row.kind))
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
            // Enriches a typed @workon/@quickchat with this project's folder so
            // the launch actually opens a session here. Interception itself is
            // the default now (SmartCompose ownLaunchRouting) — before that, a
            // @workon typed in THIS composer posted its seed as a plain note.
            launchContext={{ projectSlug: slug, primaryFolder: project.primary_folder, taskId: null }}
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
            launchContext={{ projectSlug: slug, primaryFolder: project.primary_folder, taskId: null }}
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
                onOpenTask={onOpenTask}
                onDeleteEntry={
                  canDeleteActivityEntry(user, event.row.actor_slug)
                    ? () =>
                        deleteEntry.mutate({
                          id: event.row.id,
                          projectSlug: slug,
                          taskId: event.row.entity_type === 'task' ? event.row.entity_id : undefined,
                        })
                    : undefined
                }
                onEditEntry={
                  canDeleteActivityEntry(user, event.row.actor_slug)
                    ? (body) =>
                        editEntry.mutate({
                          id: event.row.id,
                          body,
                          projectSlug: slug,
                          taskId: event.row.entity_type === 'task' ? event.row.entity_id : undefined,
                        })
                    : undefined
                }
                onDismissEntry={
                  canDeleteActivityEntry(user, event.row.actor_slug)
                    ? () =>
                        dismissThread.mutate({
                          id: event.row.id,
                          hidden: !event.row.hidden_at,
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

      {/* "N dismissed — show / hide". Outside the empty-state branch so it stays
          reachable when every visible thread has been dismissed. */}
      <ShowHiddenToggle count={hiddenCount} showing={showHidden} onToggle={() => setShowHidden((v) => !v)} />
    </motion.div>
  )
}

// ── Per-event renderers ──────────────────────────────────────────────────

function StreamItem({ event, onOpenTask, onDeleteEntry, onEditEntry, onDismissEntry }: { event: StreamEvent; onOpenTask?: (taskId: string) => boolean; onDeleteEntry?: () => void; onEditEntry?: (body: string) => void; onDismissEntry?: () => void }) {
  // Project-stream anatomy: task-origin chip + reactions + animation.
  const itemProps = {
    showReactions: true,
    showTaskOriginBadge: true,
    taskOriginBorderWidth: 2,
    motionProps: itemMotion,
    onOpenTask,
  }
  // Lifecycle narration is not repliable (the API rejects it as a parent);
  // isRepliableKind is the single home for that rule, shared with the task
  // feed so the two surfaces cannot drift apart. This is also what keeps the
  // synthetic action-item rows (kind 'system', no activity_entries row behind
  // them) out of the reply path — a reply to one would have nothing to attach to.
  if (!isRepliableKind(event.row.kind)) {
    return <ActivityEntryItem {...itemProps} entry={event.row} onDelete={onDeleteEntry} />
  }
  // #98: a reply posted from the PROJECT feed still threads onto the entry's
  // own root — the reply endpoint takes only the parent id and inherits
  // entity identity from it, so replying to a task-origin row lands on that
  // TASK, not on the project. That is why no entity is passed here.
  return (
    <ActivityThread
      root={event.row}
      itemProps={itemProps}
      invalidateKeys={[['project-activity']]}
      onDelete={onDeleteEntry ? () => onDeleteEntry() : undefined}
      onEdit={onEditEntry ? (_e, body) => onEditEntry(body) : undefined}
      onDismiss={onDismissEntry ? () => onDismissEntry() : undefined}
    />
  )
}

