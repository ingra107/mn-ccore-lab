// activityRender.tsx — shared render metadata + primitives for the unified
// activity timeline (Design C, schema-v77). Both TaskActivityFeed (task detail)
// and ActivityStream (project detail) consume this so the update_type render
// map, the author-only badge, and the viewer-local timestamp can't drift
// between the two feeds.
//
// Scope note: ProjectUpdateFeed's legacy TYPE_CONFIG was retired in Phase 2 (P2-A);
// ProjectUpdateFeed.tsx was deleted post-P2-A (all project activity routes through ActivityStream).
//
// ActivityEntryItem (the per-row renderer) is exported from here.
// Props contract captures every intentional per-surface difference between the
// task feed and the project stream so the two callers diverge only at the prop
// boundary, not inside duplicated JSX.
//
// ── Slack-thread anatomy (every kind, every surface, every time) ──────────────
//
//   [avatar 28px]  Name  ·  timestamp  ·  [kind badge]
//                  body / content
//                  [reactions row if applicable]
//
// ALL seven cases (comment, update, completion, system, Hermes, @me-locked,
// task-origin-in-project-feed) use this same skeleton.  The kind badge + accent
// bar colour are the only per-kind visual differentiators; the structure is
// invariant so every entry reads as part of the same thread regardless of kind.

import { type ReactNode } from 'react'
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  HelpCircle,
  Terminal,
  Lock,
  ClipboardList,
  Settings2,
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

// ── Design constants ──────────────────────────────────────────────────────────
//
// These are the ONE place to change the anatomy tokens.  They apply to every
// kind, every surface.

/** Avatar size used for every entry, every surface (28 px / w-7 h-7). */
const AVATAR_SIZE = 'base-sm' as const

/** Gap class between the avatar column and the text column. */
const AVATAR_GAP = 'gap-3'

/** Padding inside each entry card (vertical block, horizontal inline). */
const CARD_PADDING = '10px 14px'

/** Font size for the author name line and body (12 px). */
const BODY_FONT_SIZE = 'var(--text-small)'

/** Font size for the timestamp and badges (10 px). */
const META_FONT_SIZE = 'var(--text-caption)'

// ── update_type render metadata ───────────────────────────────────────────────
//
// ONE superset map for kind='update' sub-kinds. Keys are typed from UPDATE_TYPES
// (shared/activityKinds.ts) so the render map can never drift from the enum.

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

// ── Hoisted static style objects (ROW 82) ────────────────────────────────────
//
// Style objects that are identical on every render are hoisted to module-level
// constants so React sees a stable reference and skips reconciler work.
// Only truly-static objects (no prop or runtime dependency) live here.

const STYLE_AUTHOR_BADGE: React.CSSProperties = {
  fontSize: META_FONT_SIZE,
  color: 'var(--slate)',
  background: 'rgba(100,116,139,0.1)',
  opacity: 0.85,
  flexShrink: 0,
}

const STYLE_TIME: React.CSSProperties = {
  fontSize: META_FONT_SIZE,
  color: 'var(--slate)',
  opacity: 'var(--ink-hint)' as unknown as number,
  flexShrink: 0,
}

const STYLE_TEXT_COL: React.CSSProperties = { flex: 1, minWidth: 0 }
const STYLE_NAME_ROW: React.CSSProperties = { marginBottom: 4 }
const STYLE_COMPLETION_ICON: React.CSSProperties = { color: 'var(--green)', flexShrink: 0 }
const STYLE_SYSTEM_BADGE: React.CSSProperties = {
  fontSize: META_FONT_SIZE,
  background: 'rgba(100,116,139,0.08)',
  color: 'var(--slate)',
  opacity: 0.85,
  flexShrink: 0,
}

// ── Per-kind accent bar colours ───────────────────────────────────────────────
//
// The left-bar is the ONLY per-kind structural difference.  Every kind gets a
// bar; the colour signals the kind.  Body padding + avatar + name line are
// identical across all kinds.

const KIND_BAR: Record<StoredKind, string> = {
  comment:    'rgba(201,168,76,0.4)',       // gold  — discussion
  update:     'rgba(45,138,138,0.4)',        // teal  — overridden per update_type below
  completion: 'rgba(110,232,154,0.5)',       // green — done
  system:     'rgba(100,116,139,0.25)',      // slate — automated
}

// ── Author-only visibility badge ──────────────────────────────────────────────
//
// Subtle 🔒 "only you" hint shown on author-only (@me) rows.  PI/server callers
// see all rows; the gate is server-side, so this is purely a viewer affordance.

export function AuthorOnlyBadge() {
  return (
    <span
      title="Visible only to you"
      aria-label="Only visible to you"
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded"
      style={STYLE_AUTHOR_BADGE}
    >
      <Lock size={8} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
      only you
    </span>
  )
}

// ── Viewer-local timestamp ────────────────────────────────────────────────────
//
// Relative label, absolute viewer-local tooltip via the time.ts chokepoints
// (parseDbUtc + formatDbLocal).  Always uses --ink-hint opacity (≥ 0.4 floor).

export function EntryTime({ ts, className }: { ts: string; className?: string }) {
  const d = parseDbUtc(ts)
  const abs = isNaN(d.getTime()) ? ts : formatDbLocal(ts, 'datetime')
  const rel = formatRelativeTime(ts)
  return (
    <time
      dateTime={ts}
      className={className}
      title={abs}
      style={STYLE_TIME}
    >
      {rel}
    </time>
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
//
// NOTE: avatarSize, textSize, avatarGap, cardPadding, taskOriginBorderWidth
// are preserved for callers that override them (e.g. compact peek mode) but the
// defaults now match the canonical Slack-thread anatomy above so both feeds
// converge without any caller change.

export interface ActivityEntryItemProps {
  entry: ActivityEntryItemRow

  /**
   * Avatar render size.  Defaults to 'base-sm' (28 px) for the canonical
   * Slack-thread anatomy.  Callers may pass 'xs' (20 px) for a compact peek.
   */
  avatarSize?: 'xs' | 'base-sm'

  /**
   * Font-size token for the author name + body.  Defaults to '--text-small'
   * (12 px) — the canonical body size.
   */
  textSize?: string

  /**
   * Gap between the avatar column and the text column.  Defaults to 'gap-3'.
   */
  avatarGap?: string

  /**
   * Whether to render a comment badge on comment rows.  Both feeds may
   * omit this if the kind distinction is already obvious from context.
   * Kept for backward compat but defaulted false — the gold bar signals
   * "discussion" without a redundant "Comment" badge.
   */
  showCommentBadge?: boolean

  /**
   * Whether to render ReactionBar below the body of project-entity rows.
   * Task feed never shows reactions; project stream shows them on !isTask rows.
   */
  showReactions?: boolean

  /**
   * Whether to render a TaskOriginBadge (chip linking back to the originating
   * task via `?openTask=` deep-link) on task-entity rows.  Project stream only.
   */
  showTaskOriginBadge?: boolean

  /**
   * motion.div animation props applied to the outer card.  Undefined = no
   * animation wrapper (task feed).  Project stream passes its itemMotion object.
   */
  motionProps?: object

  /**
   * Padding override for card rows.  Defaults to CARD_PADDING ('10px 14px').
   */
  cardPadding?: string

  /**
   * Border-left width on the main card.  Defaults to 3.  Project stream may
   * pass 2 for task-entity rows.
   */
  taskOriginBorderWidth?: number
}

// ── TaskOriginBadge ───────────────────────────────────────────────────────────

/** Small teal chip linking back to the originating task in the project feed.
 *  Rendered as a secondary line below the name, above the body. */
function TaskOriginBadge({
  taskHref,
  entityId,
  label,
}: {
  taskHref: string
  entityId: string
  label?: string | null
}) {
  return (
    <a
      href={taskHref}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Go to task: ${label || entityId}`}
      className="inline-flex items-center gap-1 self-start"
      style={{
        fontSize: META_FONT_SIZE,
        color: 'var(--teal)',
        background: 'var(--teal-active)',
        borderRadius: 'var(--radius-sm)',
        padding: '2px 6px',
        textDecoration: 'none',
        maxWidth: 280,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        marginBottom: 4,
      }}
    >
      <ClipboardList size={9} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" style={{ flexShrink: 0 }} />
      {label || 'task'}
    </a>
  )
}

// ── KindBadge — consistent pill for update sub-types ─────────────────────────
//
// Only rendered when the update_type adds information (i.e. kind='update').
// Comment / completion / system don't need a redundant "Comment" or "Completed"
// label — the accent bar and the verb in the body are sufficient.

function UpdateBadge({ updateType }: { updateType: UpdateType }) {
  const cfg = UPDATE_TYPE_CONFIG[updateType] || UPDATE_TYPE_CONFIG.progress
  const Icon = cfg.icon
  return (
    <span
      aria-label={`Note type: ${cfg.label}`}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded"
      style={{
        fontSize: META_FONT_SIZE,
        background: cfg.bg,
        color: cfg.color,
        flexShrink: 0,
      }}
    >
      <Icon size={9} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
      {cfg.label}
    </span>
  )
}

// ── ActivityEntryItem ─────────────────────────────────────────────────────────
//
// Unified per-row renderer for TaskActivityFeed, ActivityStream, ArtifactPage.
// ALL seven cases share the same Slack-thread skeleton:
//
//   [avatar]  Name · ts · [badge]
//             body / content
//             [reactions]
//
// Per-kind variation is confined to:
//   - The left accent bar colour (KIND_BAR, or update_type override)
//   - The badge in the name line (UpdateBadge for update, ✓ for completion,
//     ⚙ for system, 🔒 for @me)
//   - Hermes: gold-ring card wrapping the same structural skeleton
//
// Per-surface variation is confined to props (see ActivityEntryItemProps).

// Module-level so React sees a stable component type across renders.
// An inline definition inside ActivityEntryItem caused remounts on every
// parent re-render, replaying the Framer Motion initial:opacity-0 animation.
function ActivityEntryWrapper({
  motionProps,
  style,
  className,
  children,
}: {
  motionProps?: object
  style?: React.CSSProperties
  className?: string
  children: ReactNode
}) {
  if (motionProps) {
    return (
      <motion.div {...(motionProps as object)} style={style} className={className}>
        {children}
      </motion.div>
    )
  }
  return <div style={style} className={className}>{children}</div>
}

export function ActivityEntryItem({
  entry,
  avatarSize = AVATAR_SIZE,
  textSize = BODY_FONT_SIZE,
  avatarGap = AVATAR_GAP,
  showCommentBadge = false,
  showReactions = false,
  showTaskOriginBadge = false,
  motionProps,
  cardPadding = CARD_PADDING,
  taskOriginBorderWidth = 3,
}: ActivityEntryItemProps) {
  const isTask = entry.entity_type === 'task'
  const isHermes = entry.actor_slug === 'claude-ai'
  const person = getPersonInfo(entry.actor_slug)

  // Deep-link back to the task in the My Tasks view (project-stream only).
  const taskHref = isTask
    ? `/portal/my-tasks?openTask=${encodeURIComponent(entry.entity_id)}`
    : null
  const taskLabel = entry.task_title ?? null


  // ── Determine bar colour ──────────────────────────────────────────────────
  let barColor = KIND_BAR[entry.kind]
  if (entry.kind === 'update' && entry.update_type) {
    const ut = entry.update_type
    barColor = UPDATE_TYPE_CONFIG[ut]?.borderColor ?? barColor
  }
  if (isHermes) barColor = 'rgba(201,168,76,0.35)' // gold for Hermes

  // Task-origin rows in the project feed get a subtle left-inset.
  const taskOriginStyle =
    showTaskOriginBadge && isTask
      ? { marginLeft: 4, borderLeftWidth: taskOriginBorderWidth }
      : {}

  // ── Shared card shell ─────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: isHermes ? 'var(--gold-hover)' : 'var(--cream)',
    borderRadius: 'var(--radius-lg)',
    padding: cardPadding,
    borderLeft: `3px solid ${barColor}`,
    ...(isHermes
      ? { border: '1px solid rgba(201,168,76,0.15)', borderLeft: `3px solid ${barColor}` }
      : {}),
    ...taskOriginStyle,
  }

  // ── Avatar dimension (matches sizeConfig in Avatar.tsx) ──────────────────
  const avatarDim = avatarSize === 'xs' ? 20 : 28

  // ── Name-line badge slot ──────────────────────────────────────────────────
  // Only one badge per entry; priority: update_type pill > nothing (comment /
  // completion / system are self-evident from bar colour + body verb).
  // showCommentBadge is kept for callers that want the redundant label but we
  // do not render it by default.
  let nameBadge: ReactNode = null
  if (entry.kind === 'update' && entry.update_type) {
    nameBadge = <UpdateBadge updateType={entry.update_type} />
  } else if (entry.kind === 'completion') {
    nameBadge = (
      <span
        aria-label="Completed"
        title="Completed"
        className="inline-flex items-center"
        style={STYLE_COMPLETION_ICON}
      >
        <CheckCircle2 size={12} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
      </span>
    )
  } else if (entry.kind === 'system') {
    nameBadge = (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded"
        style={STYLE_SYSTEM_BADGE}
      >
        <Settings2 size={9} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
        System
      </span>
    )
  } else if (entry.kind === 'comment' && showCommentBadge) {
    // Retained for backward compat only — gold bar already signals discussion.
    nameBadge = null
  }

  // ── Body text for completion entries ─────────────────────────────────────
  // Completion rows express the action via the body.  If there is no body,
  // use a brief verb phrase so the entry is self-describing.
  const completionBody: ReactNode =
    entry.body ? (
      <LinkifiedText text={entry.body} />
    ) : isTask && showTaskOriginBadge && taskHref ? (
      <>
        {'Completed '}
        <a
          href={taskHref}
          onClick={(e) => e.stopPropagation()}
          style={{ color: 'var(--teal)', fontWeight: 500, textDecoration: 'none' }}
        >
          {taskLabel || 'this task'}
        </a>
      </>
    ) : (
      'Completed this task.'
    )

  // ── Hermes: same skeleton, gold-ring card ────────────────────────────────
  if (isHermes) {
    return (
      <ActivityEntryWrapper motionProps={motionProps} style={cardStyle} className="detail-card">
        {/* Task-origin chip above the thread (project-feed only) */}
        {showTaskOriginBadge && isTask && taskHref && (
          <TaskOriginBadge
            taskHref={taskHref}
            entityId={entry.entity_id}
            label={taskLabel}
          />
        )}
        {/* Name line */}
        <div className={`flex items-center ${AVATAR_GAP} mb-1.5`} style={{ minWidth: 0 }}>
          {/* Avatar slot — HermesMark via Avatar's slug prop */}
          <div className="flex-shrink-0" style={{ width: avatarDim, height: avatarDim }}>
            <Avatar
              name="Hermes"
              initials="H"
              size={avatarSize}
              variant="gold"
              slug="claude-ai"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap min-w-0" style={{ flex: 1 }}>
            <span
              style={{
                fontSize: textSize,
                fontWeight: 'var(--weight-ui)' as React.CSSProperties['fontWeight'],
                color: 'var(--gold)',
                flexShrink: 0,
              }}
            >
              Hermes
            </span>
            <HermesMark size={10} variant="icon" aria-hidden="true" />
            {entry.visibility === 'author' && <AuthorOnlyBadge />}
            <EntryTime ts={entry.created_at} className="ml-auto" />
          </div>
        </div>
        {/* Body */}
        {isHermesPending(entry.body) ? (
          <HermesPending askedAt={entry.created_at} />
        ) : (
          <HermesResponse content={entry.body} />
        )}
        {showReactions && !isTask && (
          <ReactionBar targetType="comment" targetId={entry.id} />
        )}
      </ActivityEntryWrapper>
    )
  }

  // ── All other kinds: comment, update, completion, system ─────────────────
  //
  // One unified skeleton.  The kind signals via barColor + nameBadge only.
  return (
    <ActivityEntryWrapper motionProps={motionProps} style={cardStyle} className="detail-card">
      {/* Task-origin chip above the thread (project-feed only) */}
      {showTaskOriginBadge && isTask && taskHref && (
        <TaskOriginBadge
          taskHref={taskHref}
          entityId={entry.entity_id}
          label={taskLabel}
        />
      )}

      {/* Avatar + name row + body */}
      <div className={`flex items-start ${avatarGap}`} style={{ minWidth: 0 }}>
        {/* Avatar column */}
        <div
          className="flex-shrink-0 mt-0.5"
          style={{ width: avatarDim, height: avatarDim }}
        >
          <Avatar
            name={person.name}
            initials={person.initials}
            photoUrl={person.photoUrl}
            size={avatarSize}
            variant="ice"
          />
        </div>

        {/* Text column */}
        <div style={STYLE_TEXT_COL}>
          {/* Line 1: Name · timestamp · badge */}
          <div
            className="flex items-center gap-1.5 flex-wrap"
            style={STYLE_NAME_ROW}
          >
            <span
              style={{
                fontSize: textSize,
                fontWeight: 'var(--weight-ui)' as React.CSSProperties['fontWeight'],
                color: 'var(--ink)',
                flexShrink: 0,
              }}
            >
              {person.name}
            </span>
            {nameBadge}
            {entry.visibility === 'author' && <AuthorOnlyBadge />}
            <EntryTime ts={entry.created_at} className="ml-auto" />
          </div>

          {/* Body */}
          <p
            style={{
              fontSize: textSize,
              color: 'var(--ink)',
              opacity: 'var(--ink-primary)',
              lineHeight: 1.55,
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          >
            {entry.kind === 'completion' ? (
              completionBody
            ) : (
              <LinkifiedText text={entry.body} />
            )}
          </p>

          {/* Reactions (project-entity rows only) */}
          {showReactions && !isTask && (
            <ReactionBar
              targetType={entry.kind === 'update' ? 'project_update' : 'comment'}
              targetId={entry.id}
            />
          )}
        </div>
      </div>
    </ActivityEntryWrapper>
  )
}
