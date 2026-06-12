// TaskActivityFeed — Phase 1 (Design C, v77).
//
// ONE query: GET /api/tasks/:id/activity (unified activity_entries feed).
// The old 3-way client merge (task_updates + task_comments + legacy activity)
// is deleted. Server orders newest-first and applies the visibility gate
// (author-only @me rows visible only to their author), so this component
// just renders what arrives.
//
// Discipline map (one icon/label/placement per stored kind + update_type):
//   kind='comment'               → gold left-bar, MessageSquare badge, body + LinkifiedText
//   kind='update'  + update_type → teal/maroon/green/gold/slate left-bar per type
//   kind='completion'            → teal CheckCircle badge, system-style
//   kind='system'                → dot + slim text, no left-bar
//
// Special rows:
//   actor_slug='claude-ai'      → HermesMark treatment, gold ring, HermesPending / HermesResponse
//   visibility='author'         → subtle 🔒 "only you" hint (PI callers see all — server-gated)
//
// Timestamps: parseDbUtc → formatDbLocal (viewer-local via time.ts chokepoints).
// Body: LinkifiedText (keeps compact link-chip treatment Nick loves).

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ActivityEntryItem, type ActivityEntryItemRow } from '../../activity/activityRender'
import { filterMatchesKind, type TaskFeedFilter } from '../../../../shared/activityKinds'
import type { StoredKind, UpdateType } from '../../../../shared/activityKinds'

// ── Shape ────────────────────────────────────────────────────────────────────

export type { ActivityEntryItemRow as ActivityEntryRow }

// ActivityEntryRow alias for callers that import this type from here.
// Prefer ActivityEntryItemRow from activityRender.tsx for new code.
export interface ActivityEntryRowLegacy {
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
}

// ── Feed filter pills ─────────────────────────────────────────────────────────

const FILTER_LABELS: Record<TaskFeedFilter, string> = {
  all:        'All',
  discussion: 'Discussion',
  notes:      'Notes',
  system:     'System',
}

// ── Main component ────────────────────────────────────────────────────────────

interface TaskActivityFeedProps {
  taskId: string
  /** When set, render only the first N entries (Overview peek mode). */
  peekCount?: number
  /** When true, hide the filter pills (Overview peek mode). */
  hidePills?: boolean
  /** N4 — avatar render size forwarded to ActivityEntryItem ('xs' = 20px,
   *  used by the Overview peek for a tighter read). */
  avatarSize?: 'xs' | 'base-sm'
}

export function TaskActivityFeed({ taskId, peekCount, hidePills, avatarSize }: TaskActivityFeedProps) {
  const [filter, setFilter] = useState<TaskFeedFilter>('all')

  const { data: entries = [], isLoading } = useQuery<ActivityEntryItemRow[]>({
    queryKey: ['task-activity', taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/activity`)
      if (!res.ok) return []
      const data = await res.json() as { data?: ActivityEntryItemRow[] }
      return data.data || []
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })

  const filtered = useMemo(
    () =>
      filter === 'all'
        ? entries
        : entries.filter((e) => filterMatchesKind(filter, e.entity_type, e.kind)),
    [entries, filter],
  )

  const visible = peekCount ? filtered.slice(0, peekCount) : filtered

  return (
    <div className="flex flex-col gap-2">
      {/* Filter pills — hidden in peek mode */}
      {!hidePills && (
        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Activity filter">
          {(Object.keys(FILTER_LABELS) as TaskFeedFilter[]).map((f) => {
            const active = filter === f
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={active ? 'true' : 'false'}
                className="cursor-pointer inline-flex items-center px-2 py-0.5 rounded-full transition-colors"
                style={{
                  fontSize: '10px',
                  fontWeight: active ? 600 : 400,
                  background: active ? 'var(--teal-active)' : 'transparent',
                  color: active ? 'var(--teal)' : 'var(--slate)',
                  border: `1px solid ${active ? 'var(--teal)' : 'var(--border-subtle)'}`,
                  opacity: active ? 1 : 0.85,
                }}
              >
                {FILTER_LABELS[f]}
              </button>
            )
          })}
        </div>
      )}

      {/* Stream */}
      {isLoading ? (
        <p
          className="text-xs"
          style={{
            color: 'var(--slate)',
            opacity: 'var(--ink-hint)',
            margin: 0,
            padding: peekCount ? '2px 0' : '16px 0',
            textAlign: peekCount ? 'left' : 'center',
          }}
        >
          Loading activity…
        </p>
      ) : visible.length === 0 ? (
        <p
          className="text-xs"
          style={{
            color: 'var(--slate)',
            opacity: 'var(--ink-hint)',
            margin: 0,
            // Peek mode: one-line minimal hint. Full tab: generous centering.
            padding: peekCount ? '2px 0' : '16px 0',
            textAlign: peekCount ? 'left' : 'center',
          }}
        >
          {filter === 'all' ? 'No activity yet' : `No ${FILTER_LABELS[filter].toLowerCase()} entries`}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visible.map((entry) => (
            <ActivityEntryItem
              key={entry.id}
              entry={entry}
              avatarSize={avatarSize}
              // Task-feed: otherwise canonical defaults — showReactions=false
              // (default), showTaskOriginBadge=false (default). No animation
              // wrapper in the task feed.
            />
          ))}
        </div>
      )}
    </div>
  )
}
