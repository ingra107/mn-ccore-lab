// activityRender.tsx — shared render metadata + primitives for the unified
// activity timeline (Design C, schema-v77). Both TaskActivityFeed (task detail)
// and ActivityStream (project detail) consume this so the update_type render
// map, the author-only badge, and the viewer-local timestamp can't drift
// between the two feeds.
//
// Scope note: ProjectUpdateFeed's legacy TYPE_CONFIG is deliberately NOT folded
// in here — that surface is retired in Phase 2.
//
// ActivityEntryItem (the per-row renderer) is now also exported from here.
// Props contract captures every intentional per-surface difference between the
// task feed and the project stream so the two callers diverge only at the prop
// boundary, not inside duplicated JSX.

import { type ReactNode } from 'react'
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  Circle,
  MessageSquare,
  HelpCircle,
  Terminal,
  Lock,
  ClipboardList,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { formatRelativeTime } from '../../lib/dateUtils'
import { parseDbUtc, formatDbLocal } from '../../lib/time'
import { getPersonInfo } from '../../data/team'
import Avatar from '../Avatar'
import LinkifiedText from '../LinkifiedText'
import HermesMark from '../HermesMark'
import HermesResponse from '../HermesResponse'
import HermesPending, { isHermesPending } from '../HermesPending'
import ReactionBar from '../ReactionBar'
import type { StoredKind, UpdateType } from '../../../shared/activityKinds'

// ── update_type render metadata ───────────────────────────────────────────────
//
// ONE superset map for kind='update' sub-kinds. Keys are typed from UPDATE_TYPES
// (shared/activityKinds.ts) so the render map can never drift from the enum.
// Callers read the fields they need (TaskActivityFeed uses borderColor for its
// left-bar treatment; ActivityStream uses icon/color/bg/label only).

export interface UpdateTypeRenderConfig {
  icon: typeof TrendingUp
  color: string
  bg: string
  borderColor: string
  label: string
}

export const UPDATE_TYPE_CONFIG: Record<UpdateType, UpdateTypeRenderConfig> = {
  progress: { icon: TrendingUp,    color: 'var(--teal)',   bg: 'var(--teal-active)',     borderColor: 'rgba(45,138,138,0.4)',   label: 'Progress' },
  blocker:  { icon: AlertTriangle, color: 'var(--maroon)', bg: 'rgba(122,0,25,0.1)',     borderColor: 'rgba(122,0,25,0.4)',     label: 'Blocker' },
  result:   { icon: CheckCircle,   color: 'var(--green)',  bg: 'rgba(34,197,94,0.1)',    borderColor: 'rgba(34,197,94,0.4)',    label: 'Result' },
  question: { icon: HelpCircle,    color: 'var(--gold)',   bg: 'var(--gold-active)',     borderColor: 'rgba(201,168,76,0.4)',   label: 'Question' },
  session:  { icon: Terminal,      color: 'var(--slate)',  bg: 'rgba(100,116,139,0.08)', borderColor: 'rgba(100,116,139,0.25)', label: 'Session' },
}

// ── Author-only visibility badge ──────────────────────────────────────────────
//
// Subtle 🔒 "only you" hint shown on author-only (@me) rows. PI/server callers
// see all rows; the gate is server-side, so this is purely a viewer affordance.

export function AuthorOnlyBadge() {
  return (
    <span
      title="Visible only to you"
      aria-label="Only visible to you"
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded"
      style={{
        fontSize: '9px',
        color: 'var(--slate)',
        background: 'rgba(100,116,139,0.1)',
        opacity: 0.85,
        flexShrink: 0,
      }}
    >
      <Lock size={7} aria-hidden="true" />
      only you
    </span>
  )
}

// ── Viewer-local timestamp ────────────────────────────────────────────────────
//
// Relative label, absolute viewer-local tooltip via the time.ts chokepoints
// (parseDbUtc + formatDbLocal). Don't render activity timestamps with a raw
// formatRelativeTime alone — the tooltip must resolve to the viewer's zone.

export function EntryTime({ ts, className }: { ts: string; className?: string }) {
  const d = parseDbUtc(ts)
  const abs = isNaN(d.getTime()) ? ts : formatDbLocal(ts, 'datetime')
  const rel = formatRelativeTime(ts)
  return (
    <span
      className={className}
      title={abs}
      style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)', flexShrink: 0 }}
    >
      {rel}
    </span>
  )
}

// ── Shared ActivityEntryItem row shape ────────────────────────────────────────
//
// Superset of ActivityEntryRow (task feed) and UnifiedEntryRow (project feed).
// All fields from both are included; task_title + _renderKind are project-only
// additions — callers that don't have them simply leave them undefined.

export interface ActivityEntryItemRow {
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
  // Project-feed additions (undefined in task-feed context):
  /** Joined server-side for task rows: COALESCE(short_title, title). */
  task_title?: string | null
  /** Derived at render from entity_type + kind. Never stored. */
  _renderKind?: string
}

// ── Per-surface prop contract ─────────────────────────────────────────────────
//
// Every intentional visual difference between the task feed and the project
// stream is captured here as a prop so the divergence is explicit and auditable.
// Adding a new surface difference means adding a prop, not forking JSX.

export interface ActivityEntryItemProps {
  entry: ActivityEntryItemRow

  /**
   * Avatar render size. Task feed uses 'xs' (20px); project stream uses
   * 'base-sm' (28px).
   */
  avatarSize?: 'xs' | 'base-sm'

  /**
   * Font-size token for the author name + body. Task feed uses '--label-size';
   * project stream uses '--value-size'.
   */
  textSize?: string

  /**
   * Gap between the avatar column and the text column. Task: gap-2. Project: gap-3.
   */
  avatarGap?: string

  /**
   * Whether to render a comment badge (MessageSquare + "Comment") on comment
   * rows. Task feed shows the badge; project stream omits it.
   */
  showCommentBadge?: boolean

  /**
   * Whether to render ReactionBar below the body of project-entity rows.
   * Task feed never shows reactions; project stream shows them on !isTask rows.
   */
  showReactions?: boolean

  /**
   * Whether to render a TaskOriginBadge (chip linking back to the originating
   * task via `?openTask=` deep-link) on task-entity rows. Project stream only.
   */
  showTaskOriginBadge?: boolean

  /**
   * motion.div animation props applied to the outer card. Undefined = no
   * animation wrapper (task feed). Project stream passes its itemMotion object.
   */
  motionProps?: object

  /**
   * Padding override for card rows. Task feed: '10px 12px'. Project stream uses
   * var(--sp-sm) var(--sp-md).
   */
  cardPadding?: string

  /**
   * Border-left width on the main card. Task feed: 3. Project stream applies 2
   * (with marginLeft: 4) on task-entity rows, 3 on project-entity rows.
   */
  taskOriginBorderWidth?: number
}

// ── TaskOriginBadge ───────────────────────────────────────────────────────────

/** Small chip linking back to the originating task in the project feed. */
function TaskOriginBadge({
  taskHref,
  entityId,
  label,
  inline,
}: {
  taskHref: string
  entityId: string
  label?: string | null
  inline?: boolean
}) {
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

// ── ActivityEntryItem ─────────────────────────────────────────────────────────
//
// Unified per-row renderer for both TaskActivityFeed and ActivityStream.
// All per-surface rendering differences are expressed through props (see
// ActivityEntryItemProps above) — NOT through forked branches inside this file.

export function ActivityEntryItem({
  entry,
  avatarSize = 'xs',
  textSize = 'var(--label-size)',
  avatarGap = 'gap-2',
  showCommentBadge = false,
  showReactions = false,
  showTaskOriginBadge = false,
  motionProps,
  cardPadding = '10px 12px',
  taskOriginBorderWidth = 3,
}: ActivityEntryItemProps) {
  const isTask = entry.entity_type === 'task'
  const isHermes = entry.actor_slug === 'claude-ai'
  const person = getPersonInfo(entry.actor_slug)

  // Deep-link back to the task in the My Tasks view (project-stream only).
  const taskHref = isTask ? `/portal/my-tasks?openTask=${encodeURIComponent(entry.entity_id)}` : null
  const taskLabel = entry.task_title || null

  // ── Wrapper: animated in project stream, plain div in task feed ──────────
  const Wrapper = ({ children, style, className }: { children: ReactNode; style?: React.CSSProperties; className?: string }) => {
    if (motionProps) {
      return (
        <motion.div {...(motionProps as object)} style={style} className={className}>
          {children}
        </motion.div>
      )
    }
    return <div style={style} className={className}>{children}</div>
  }

  // ── Completion: compact one-liner ─────────────────────────────────────────
  if (entry.kind === 'completion') {
    return (
      <Wrapper className="flex items-center gap-2 py-1 px-1">
        <CheckCircle2
          size={14}
          className="flex-shrink-0"
          style={{ color: 'var(--green)', opacity: 0.85, flexShrink: 0 }}
          aria-hidden="true"
        />
        <span style={{ fontSize: textSize, color: 'var(--ink)', flex: 1, minWidth: 0, lineHeight: 1.4 }}>
          <span style={{ fontWeight: 500 }}>{person.name}</span>
          {isTask && showTaskOriginBadge && taskHref ? (
            <>
              {' completed '}
              <a
                href={taskHref}
                onClick={(e) => e.stopPropagation()}
                style={{ color: 'var(--teal)', fontWeight: 500, textDecoration: 'none' }}
              >
                {taskLabel || 'a task'}
              </a>
            </>
          ) : (
            entry.body ? ` — ` : ' completed this task'
          )}
          {entry.body && !( isTask && showTaskOriginBadge && taskHref) ? (
            <LinkifiedText text={entry.body} />
          ) : isTask && showTaskOriginBadge && taskHref && entry.body ? (
            <> — <LinkifiedText text={entry.body} /></>
          ) : null}
        </span>
        {entry.visibility === 'author' && <AuthorOnlyBadge />}
        <EntryTime ts={entry.created_at} />
      </Wrapper>
    )
  }

  // ── Hermes: gold-ring card ────────────────────────────────────────────────
  if (isHermes) {
    return (
      <Wrapper
        style={{
          background: 'var(--gold-hover)',
          border: '1px solid rgba(201,168,76,0.15)',
          borderRadius: 'var(--radius-lg)',
          padding: cardPadding,
        }}
        className="detail-card"
      >
        {showTaskOriginBadge && isTask && taskHref && (
          <TaskOriginBadge taskHref={taskHref} entityId={entry.entity_id} label={taskLabel} />
        )}
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
        {showReactions && !isTask && <ReactionBar targetType="comment" targetId={entry.id} />}
      </Wrapper>
    )
  }

  // ── System: slim dot + text ───────────────────────────────────────────────
  if (entry.kind === 'system') {
    return (
      <Wrapper className="flex items-start gap-2 py-1 px-1">
        <Circle
          size={5}
          className="flex-shrink-0 mt-1.5"
          style={{ color: 'var(--teal)', opacity: 0.85, fill: 'var(--teal)', flexShrink: 0 }}
          aria-hidden="true"
        />
        {showTaskOriginBadge && isTask && taskHref && (
          <TaskOriginBadge taskHref={taskHref} entityId={entry.entity_id} label={taskLabel} inline />
        )}
        <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.85, flex: 1, lineHeight: 1.4 }}>
          <LinkifiedText text={entry.body} />
        </span>
        {entry.visibility === 'author' && <AuthorOnlyBadge />}
        <EntryTime ts={entry.created_at} />
      </Wrapper>
    )
  }

  // ── Update + Comment: left-bar card ──────────────────────────────────────
  let barColor = 'rgba(201,168,76,0.35)' // default: gold (comment)
  let badgeEl: ReactNode = null

  if (entry.kind === 'update') {
    const ut = entry.update_type || 'progress'
    const cfg = UPDATE_TYPE_CONFIG[ut] || UPDATE_TYPE_CONFIG.progress
    const Icon = cfg.icon
    barColor = cfg.color
    badgeEl = (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded"
        style={{ fontSize: 'var(--text-micro)', background: cfg.bg, color: cfg.color }}
      >
        <Icon size={9} aria-hidden="true" /> {cfg.label}
      </span>
    )
  } else if (entry.kind === 'comment' && showCommentBadge) {
    badgeEl = (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded"
        style={{ fontSize: 'var(--text-micro)', background: 'var(--gold-active)', color: 'var(--gold)' }}
      >
        <MessageSquare size={8} aria-hidden="true" /> Comment
      </span>
    )
  }

  // Task-origin rows get a subtle left-inset visual distinction (project only).
  const taskOriginStyle =
    showTaskOriginBadge && isTask
      ? { marginLeft: 4, borderLeftWidth: taskOriginBorderWidth }
      : {}

  const avatarDim = avatarSize === 'xs' ? 20 : 28

  return (
    <Wrapper
      style={{
        background: 'var(--cream)',
        borderRadius: 'var(--radius-lg)',
        padding: cardPadding,
        borderLeft: `3px solid ${barColor}`,
        ...taskOriginStyle,
      }}
      className="detail-card"
    >
      {showTaskOriginBadge && isTask && taskHref && (
        <TaskOriginBadge taskHref={taskHref} entityId={entry.entity_id} label={taskLabel} />
      )}
      <div className={`flex items-start ${avatarGap}`}>
        <div className="flex-shrink-0 mt-0.5" style={{ width: avatarDim, height: avatarDim }}>
          <Avatar
            name={person.name}
            initials={person.initials}
            photoUrl={person.photoUrl}
            size={avatarSize}
            variant="ice"
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span style={{ fontSize: textSize, fontWeight: 600, color: 'var(--ink)' }}>
              {person.name}
            </span>
            {badgeEl}
            {entry.visibility === 'author' && <AuthorOnlyBadge />}
            <EntryTime ts={entry.created_at} className="ml-auto" />
          </div>
          <p
            style={{
              fontSize: textSize,
              color: 'var(--ink)',
              lineHeight: 1.5,
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          >
            <LinkifiedText text={entry.body} />
          </p>
          {showReactions && !isTask && (
            <ReactionBar
              targetType={entry.kind === 'update' ? 'project_update' : 'comment'}
              targetId={entry.id}
            />
          )}
        </div>
      </div>
    </Wrapper>
  )
}
