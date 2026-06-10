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
import {
  CheckCircle2,
  MessageSquare,
  Circle,
} from 'lucide-react'
import { getPersonInfo } from '../../../data/team'
import Avatar from '../../Avatar'
import LinkifiedText from '../../LinkifiedText'
import HermesMark from '../../HermesMark'
import HermesResponse from '../../HermesResponse'
import HermesPending, { isHermesPending } from '../../HermesPending'
import { UPDATE_TYPE_CONFIG, AuthorOnlyBadge, EntryTime } from '../../activity/activityRender'
import type { StoredKind, UpdateType } from '../../../../shared/activityKinds'

// ── Shape ────────────────────────────────────────────────────────────────────

export interface ActivityEntryRow {
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

type FeedFilter = 'all' | 'discussion' | 'notes' | 'system'

const FILTER_LABELS: Record<FeedFilter, string> = {
  all:        'All',
  discussion: 'Discussion',
  notes:      'Notes',
  system:     'System',
}

function matchesFilter(entry: ActivityEntryRow, filter: FeedFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'discussion') return entry.kind === 'comment'
  if (filter === 'notes') return entry.kind === 'update'
  if (filter === 'system') return entry.kind === 'completion' || entry.kind === 'system'
  return true
}

// ── Main component ────────────────────────────────────────────────────────────

export function TaskActivityFeed({ taskId }: { taskId: string }) {
  const [filter, setFilter] = useState<FeedFilter>('all')

  const { data: entries = [], isLoading } = useQuery<ActivityEntryRow[]>({
    queryKey: ['task-activity', taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/activity`)
      if (!res.ok) return []
      const data = await res.json() as { data?: ActivityEntryRow[] }
      return data.data || []
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })

  const visible = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => matchesFilter(e, filter))),
    [entries, filter],
  )

  return (
    <div className="flex flex-col gap-2">
      {/* Filter pills */}
      <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Activity filter">
        {(Object.keys(FILTER_LABELS) as FeedFilter[]).map((f) => {
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

      {/* Stream */}
      {isLoading ? (
        <p className="text-xs text-center py-4" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)', margin: 0 }}>
          Loading activity…
        </p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-center py-4" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)', margin: 0 }}>
          {filter === 'all' ? 'No activity yet' : `No ${FILTER_LABELS[filter].toLowerCase()} entries`}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visible.map((entry) => (
            <ActivityEntryItem key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Per-entry router ──────────────────────────────────────────────────────────

function ActivityEntryItem({ entry }: { entry: ActivityEntryRow }) {
  const isHermes = entry.actor_slug === 'claude-ai'

  if (entry.kind === 'update') {
    return <UpdateEntry entry={entry} />
  }
  if (entry.kind === 'comment') {
    if (isHermes) return <HermesEntry entry={entry} />
    return <CommentEntry entry={entry} />
  }
  if (entry.kind === 'completion') {
    return <CompletionEntry entry={entry} />
  }
  // kind='system'
  return <SystemEntry entry={entry} />
}

// ── Update entry (kind='update') ──────────────────────────────────────────────

function UpdateEntry({ entry }: { entry: ActivityEntryRow }) {
  const ut = entry.update_type || 'progress'
  const config = UPDATE_TYPE_CONFIG[ut] || UPDATE_TYPE_CONFIG.progress
  const Icon = config.icon
  const person = getPersonInfo(entry.actor_slug)
  const isSession = ut === 'session'

  return (
    <div
      className="rounded-lg"
      style={{
        background: 'var(--cream)',
        borderLeft: `3px solid ${config.color}`,
        padding: '10px 12px',
        opacity: isSession ? 0.85 : 1,
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5" style={{ width: 20, height: 20 }}>
          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="xs" variant="ice" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span style={{ fontSize: 'var(--label-size)', fontWeight: 600, color: 'var(--ink)' }}>
              {person.name}
            </span>
            <span
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded"
              style={{ fontSize: 'var(--text-micro)', background: config.bg, color: config.color }}
            >
              <Icon size={8} aria-hidden="true" /> {config.label}
            </span>
            {entry.visibility === 'author' && <AuthorOnlyBadge />}
            <EntryTime ts={entry.created_at} className="ml-auto" />
          </div>
          <p
            className="mt-0.5"
            style={{ fontSize: 'var(--label-size)', color: 'var(--ink)', lineHeight: 1.5, margin: '2px 0 0', whiteSpace: 'pre-wrap' }}
          >
            <LinkifiedText text={entry.body} />
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Comment entry (kind='comment', non-Hermes) ────────────────────────────────

function CommentEntry({ entry }: { entry: ActivityEntryRow }) {
  const person = getPersonInfo(entry.actor_slug)

  return (
    <div
      className="rounded-lg"
      style={{
        background: 'var(--cream)',
        borderLeft: '3px solid rgba(201,168,76,0.4)',
        padding: '10px 12px',
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5" style={{ width: 20, height: 20 }}>
          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="xs" variant="ice" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span style={{ fontSize: 'var(--label-size)', fontWeight: 600, color: 'var(--ink)' }}>
              {person.name}
            </span>
            <span
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded"
              style={{ fontSize: 'var(--text-micro)', background: 'var(--gold-active)', color: 'var(--gold)' }}
            >
              <MessageSquare size={8} aria-hidden="true" /> Comment
            </span>
            {entry.visibility === 'author' && <AuthorOnlyBadge />}
            <EntryTime ts={entry.created_at} className="ml-auto" />
          </div>
          <p
            className="mt-0.5"
            style={{ fontSize: 'var(--label-size)', color: 'var(--ink)', lineHeight: 1.5, margin: '2px 0 0', whiteSpace: 'pre-wrap' }}
          >
            <LinkifiedText text={entry.body} />
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Hermes entry (actor_slug='claude-ai') ─────────────────────────────────────

function HermesEntry({ entry }: { entry: ActivityEntryRow }) {
  return (
    <div
      className="rounded-lg"
      style={{
        background: 'var(--gold-hover)',
        border: '1px solid rgba(201,168,76,0.15)',
        padding: '10px 12px',
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <HermesMark size={14} variant="avatar" />
        <span style={{ fontSize: '10px', color: 'var(--gold)', fontWeight: 500 }}>Hermes</span>
        {entry.visibility === 'author' && <AuthorOnlyBadge />}
        <EntryTime ts={entry.created_at} className="ml-auto" />
      </div>
      {isHermesPending(entry.body) ? (
        <HermesPending askedAt={entry.created_at} />
      ) : (
        <HermesResponse content={entry.body} />
      )}
    </div>
  )
}

// ── Completion entry (kind='completion') ──────────────────────────────────────

function CompletionEntry({ entry }: { entry: ActivityEntryRow }) {
  const person = getPersonInfo(entry.actor_slug)
  return (
    <div className="flex items-center gap-2 py-1 px-1">
      <CheckCircle2
        size={14}
        className="flex-shrink-0"
        style={{ color: 'var(--green)', opacity: 0.85, flexShrink: 0 }}
        aria-hidden="true"
      />
      <span style={{ fontSize: 'var(--label-size)', color: 'var(--ink)', flex: 1 }}>
        <span style={{ fontWeight: 500 }}>{person.name}</span>
        {entry.body ? ` — ` : ' completed this task'}
        {entry.body ? <LinkifiedText text={entry.body} /> : null}
      </span>
      {entry.visibility === 'author' && <AuthorOnlyBadge />}
      <EntryTime ts={entry.created_at} />
    </div>
  )
}

// ── System entry (kind='system') ──────────────────────────────────────────────

function SystemEntry({ entry }: { entry: ActivityEntryRow }) {
  return (
    <div className="flex items-start gap-2 py-1 px-1">
      <Circle
        size={5}
        className="flex-shrink-0 mt-1.5"
        style={{ color: 'var(--teal)', opacity: 0.85, fill: 'var(--teal)', flexShrink: 0 }}
        aria-hidden="true"
      />
      <span
        style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.85, flex: 1, lineHeight: 1.4 }}
      >
        <LinkifiedText text={entry.body} />
      </span>
      {entry.visibility === 'author' && <AuthorOnlyBadge />}
      <EntryTime ts={entry.created_at} />
    </div>
  )
}
