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

import { type ReactNode, useEffect, useState } from 'react'
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Terminal,
  Lock,
  ClipboardList,
  Pencil,
  Trash2,
  ChevronRight,
  EyeOff,
  Eye,
} from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { motion } from 'framer-motion'
import { formatRelativeTime } from '../../lib/dateUtils'
import { parseDbUtc, formatDbLocal } from '../../lib/time'
import { getPersonInfo } from '../../data/team'
import Avatar from '../Avatar'
import LinkifiedText, { ImageChip } from '../LinkifiedText'
import HermesMark from '../HermesMark'
import HermesResponse from '../HermesResponse'
import HermesPending from '../HermesPending'
import { isHermesPending } from '../hermesPendingUtil'
import { LifecycleActivityLine } from './LifecycleActivityLine'
import ReactionBar from '../ReactionBar'
import type { StoredKind, UpdateType } from '../../../shared/activityKinds'
import { ACCENT_CORAL, ACCENT_GOLD, withAlpha } from '../../lib/taskGrouping'
// canDeleteActivityEntry moved to ./activityPermissions.ts (2026-07-16 lint
// burndown, #174) — this file's react-refresh contract is components-only;
// that predicate was the sole non-component export besides UPDATE_TYPE_CONFIG
// (now module-private below). Callers: ActivityStream.tsx, TaskActivityFeed.tsx.

// ── Body render: markdown-image pre-pass + LinkifiedText ─────────────────────
//
// The paste-to-upload composers (SmartCompose, OverviewQuickAdd) insert
// `![alt](url)` for image attachments. This is the ONLY place that markdown
// image syntax is recognized — deliberately scoped here rather than into
// LinkifiedText itself, so LinkifiedText's ~10 other callers (MarkdownView,
// HermesResponse, ArtifactPage, etc.) are untouched. `url` is restricted to
// same-origin /api/files/ or http(s) by the regex itself, so an <img src>
// can never point at something that isn't a real, fetchable image endpoint.
const IMG_MD_RE = /!\[([^\]]*)\]\(((?:\/api\/files\/|https?:\/\/)[^)\s]+)\)/g

function renderBodyWithImages(text: string): ReactNode {
  if (!text) return null
  const parts: ReactNode[] = []
  let lastIdx = 0
  let match: RegExpExecArray | null
  const re = new RegExp(IMG_MD_RE.source, IMG_MD_RE.flags) // fresh instance — see LinkifiedText's own note on shared /g regex state
  let key = 0

  while ((match = re.exec(text)) !== null) {
    const start = match.index
    if (start > lastIdx) {
      parts.push(<LinkifiedText key={`t-${key++}`} text={text.slice(lastIdx, start)} />)
    }
    parts.push(<ImageChip key={`img-${key++}`} src={match[2]} alt={match[1] || 'pasted image'} />)
    lastIdx = start + match[0].length
  }
  if (lastIdx < text.length) {
    parts.push(<LinkifiedText key={`t-${key++}`} text={text.slice(lastIdx)} />)
  }
  return <>{parts}</>
}

// ── Design constants ──────────────────────────────────────────────────────────
//
// These are the ONE place to change the anatomy tokens.  They apply to every
// kind, every surface.

/** Avatar size used for every entry, every surface (28 px / w-7 h-7). */
const AVATAR_SIZE = 'base-sm' as const

/** Gap class between the avatar column and the text column. */
const AVATAR_GAP = 'gap-3'

/** Padding inside each entry card (vertical block, horizontal inline). */
const CARD_PADDING = '8px 12px'

/** Font size for the author name line and body (12 px). */
const BODY_FONT_SIZE = 'var(--text-small)'

/** Font size for the timestamp and badges (10 px). */
const META_FONT_SIZE = 'var(--text-caption)'

// ── update_type render metadata ───────────────────────────────────────────────
//
// ONE superset map for kind='update' sub-kinds. Keys are typed from UPDATE_TYPES
// (shared/activityKinds.ts) so the render map can never drift from the enum.

interface UpdateTypeRenderConfig {
  icon: typeof TrendingUp
  color: string
  bg: string
  borderColor: string
  label: string
}

// Module-private — no external caller imports this (verified 2026-07-16);
// exporting it was the other non-component export tripping react-refresh.
const UPDATE_TYPE_CONFIG: Record<UpdateType, UpdateTypeRenderConfig> = {
  progress: { icon: TrendingUp,    color: 'var(--teal)',   bg: 'var(--teal-active)',     borderColor: 'rgba(45,138,138,0.4)',   label: 'Progress' },
  blocker:  { icon: AlertTriangle, color: 'var(--maroon)', bg: 'rgba(122,0,25,0.1)',     borderColor: 'rgba(122,0,25,0.4)',     label: 'Blocker' },
  result:   { icon: CheckCircle,   color: 'var(--green)',  bg: 'rgba(34,197,94,0.1)',    borderColor: 'rgba(34,197,94,0.4)',    label: 'Result' },
  question: { icon: HelpCircle,    color: 'var(--gold)',   bg: 'var(--gold-active)',     borderColor: withAlpha(ACCENT_GOLD, 40),   label: 'Question' },
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
const STYLE_NAME_ROW: React.CSSProperties = { marginBottom: 2 }

// ── Per-kind accent bar colours ───────────────────────────────────────────────
//
// The left-bar is the ONLY per-kind structural difference.  Every kind gets a
// bar; the colour signals the kind.  Body padding + avatar + name line are
// identical across all kinds.

const KIND_BAR: Record<StoredKind, string> = {
  comment:    withAlpha(ACCENT_GOLD, 40),       // gold  — discussion
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
  // Drop the trailing " ago" — the activity feed wants a tight, clean timestamp
  // column ("1h" / "54m" / "3d" / "Jun 24"), and lifecycle + comment rows share
  // this component so they stay identical (Nick 2026-07-09).
  const rel = formatRelativeTime(ts).replace(/ ago$/, '')
  return (
    <time
      dateTime={isNaN(d.getTime()) ? ts : d.toISOString()}
      className={`tip tip-end ${className ?? ''}`}
      data-tip={abs}
      aria-label={abs}
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
  /** #98: NULL on a thread root, the root's id on a reply (schema v100). */
  parent_id?: string | null
  /** #98: viewer-specific, computed per request — never stored. Roots only. */
  reply_count?: number
  /** v102: NULL = visible, a timestamp = dismissed. Present only when a feed was
   *  fetched with ?include_hidden=1 (else dismissed roots are filtered out). */
  hidden_at?: string | null
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

  /**
   * When set, renders a two-step-confirm trash button on the name row and
   * calls this on the confirming click. Callers pass it only on entries the
   * viewer may delete (own entries, or any entry for the PI) — the server
   * re-enforces author-or-PI regardless.
   */
  onDelete?: () => void

  /**
   * Author-or-PI edit handler for a comment/note body. When present, a
   * hover-revealed pencil opens an inline editor; Save calls this with the new
   * body. Gated by the caller (same canDeleteActivityEntry rule). Only wired for
   * comment/update rows — lifecycle + Hermes rows don't receive it.
   */
  onEdit?: (newBody: string) => void

  // ── #98 threading ───────────────────────────────────────────────────────────
  // Passed only by ActivityThread. A card that receives none of these renders
  // exactly as before, so every existing call site is unaffected.

  /** Opens the inline reply composer for this root. Absent on replies (one level). */
  onReply?: () => void
  /** Viewer-specific count from the server. 0/undefined renders no chip. */
  replyCount?: number
  /** Whether this root's thread is currently expanded. */
  threadExpanded?: boolean
  /** Toggles the thread open/closed. Present only when replyCount > 0. */
  onToggleThread?: () => void
  /** True when this card IS a reply — suppresses its own reply affordance. */
  isReply?: boolean

  // ── v102 dismiss (root only) ─────────────────────────────────────────────────
  /** Dismiss (hide) or restore this thread. Passed by ActivityThread only, and
   *  only to entries the viewer may dismiss (author-or-PI). Reversible, so unlike
   *  delete it is a single click, not a two-step confirm. */
  onDismiss?: () => void
  /** True when this root is currently dismissed — flips the label to "Restore"
   *  and dims the card. Only meaningful while a feed shows hidden (include_hidden). */
  isHidden?: boolean

  /**
   * #111 — open the originating task WHERE THE VIEWER IS instead of navigating
   * to My Tasks. Return true when the task was actually opened; return false to
   * let the link's href navigate as before. Passed by surfaces that mount a
   * TaskDetailPanel of their own (ProjectDetail via ActivityStream).
   */
  onOpenTask?: (taskId: string) => boolean
}

// ── DeleteEntryButton ─────────────────────────────────────────────────────────
// Two-step inline confirm: first click arms, second click deletes. No browser
// dialog. Rendered only when a caller passes onDelete; the API re-enforces
// author-or-PI server-side.
//
// #120 (Nick 2026-09-01: "i tried to delete entry and i don't think it
// worked"): the armed state used to be a 3s colour change on an 11px glyph —
// and on a lifecycle row the glyph is hover-only, so the moment the pointer
// left the 22px row the armed control vanished. A first click looked like a
// no-op. Now the armed state says so in words ("Delete?"), stays visible
// off-hover via [data-armed] (index.css), and holds for 5s.
const DELETE_ARM_WINDOW_MS = 5000

export function DeleteEntryButton({ onDelete }: { onDelete: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), DELETE_ARM_WINDOW_MS)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (armed) {
          setArmed(false)
          onDelete()
        } else {
          setArmed(true)
        }
      }}
      data-armed={armed ? 'true' : undefined}
      title={armed ? 'Click again to delete permanently' : 'Delete entry'}
      aria-label={armed ? 'Click again to delete permanently' : 'Delete entry'}
      className="inline-flex items-center justify-center cursor-pointer hov-color ae-delete"
      style={{
        minWidth: 18,
        height: 18,
        flexShrink: 0,
        gap: 3,
        background: armed ? withAlpha(ACCENT_CORAL, 12) : 'transparent',
        border: armed ? `1px solid ${withAlpha(ACCENT_CORAL, 55)}` : 'none',
        borderRadius: 'var(--radius-sm)',
        color: armed ? ACCENT_CORAL : 'var(--slate)',
        opacity: armed ? 1 : 0.45,
        padding: armed ? '0 6px 0 4px' : 0,
        fontSize: 10,
        fontWeight: 600,
        fontStyle: 'normal',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        '--hov-color': ACCENT_CORAL,
      } as React.CSSProperties}
    >
      <Trash2 size={11} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
      {armed && <span>Delete?</span>}
    </button>
  )
}

// Quiet "dismissed" tag shown on a shown-hidden root (feed opened with
// include_hidden) so it reads as retained-but-hidden, not live.
function DismissedTag() {
  return (
    <span
      aria-label="Dismissed — hidden from the feed"
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded"
      style={{ fontSize: META_FONT_SIZE, color: 'var(--slate)', background: 'rgba(100,116,139,0.1)', opacity: 0.85, flexShrink: 0 }}
    >
      <EyeOff size={8} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
      dismissed
    </span>
  )
}

// Hover-revealed dismiss / restore toggle (thread ROOT only). Dismiss hides the
// whole thread from feeds but RETAINS the rows; it is reversible ("Show hidden" →
// Restore), so — unlike delete — it is a single click with no two-step confirm.
function DismissEntryButton({ isHidden, onClick }: { isHidden?: boolean; onClick: () => void }) {
  const label = isHidden ? 'Restore to feed' : 'Dismiss thread'
  const Icon = isHidden ? Eye : EyeOff
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center cursor-pointer hov-color ae-dismiss"
      style={{
        width: 18, height: 18, flexShrink: 0, background: 'transparent', border: 'none',
        borderRadius: 'var(--radius-sm)', color: 'var(--slate)',
        // A restored-state eye stays visible (it's the affordance to re-hide a
        // shown-hidden row); a dismiss eye is a quiet hover action like edit.
        opacity: isHidden ? 0.85 : 0.45, padding: 0,
        '--hov-color': 'var(--teal)',
      } as React.CSSProperties}
    >
      <Icon size={11} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
    </button>
  )
}

// Hover-revealed pencil that opens the inline editor (comments/notes only).
function EditEntryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title="Edit"
      aria-label="Edit comment"
      className="inline-flex items-center justify-center cursor-pointer hov-color ae-edit"
      style={{
        width: 18, height: 18, flexShrink: 0, background: 'transparent', border: 'none',
        borderRadius: 'var(--radius-sm)', color: 'var(--slate)', opacity: 0.45, padding: 0,
        '--hov-color': 'var(--teal)',
      } as React.CSSProperties}
    >
      <Pencil size={11} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
    </button>
  )
}

// Inline comment editor: textarea prefilled with the current body + Save/Cancel.
// ⌘/Ctrl+Enter saves, Esc cancels. Closes on save (the mutation's invalidation
// refetches the edited body).
function InlineCommentEditor({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(initial)
  const rows = Math.min(10, Math.max(2, initial.split('\n').length + 1))
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        autoFocus
        rows={rows}
        className="w-full"
        style={{
          fontSize: BODY_FONT_SIZE, color: 'var(--ink)', background: 'var(--surface-1)',
          border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
          padding: '6px 8px', lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && val.trim()) { e.preventDefault(); onSave(val.trim()) }
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { if (val.trim()) onSave(val.trim()) }}
          disabled={!val.trim()}
          className="cursor-pointer"
          style={{ fontSize: META_FONT_SIZE, fontWeight: 'var(--weight-ui)' as React.CSSProperties['fontWeight'], color: '#fff', background: 'var(--teal-solid)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '3px 12px' }}
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className="cursor-pointer" style={{ fontSize: META_FONT_SIZE, color: 'var(--slate)', background: 'transparent', border: 'none', padding: '3px 6px' }}>
          Cancel
        </button>
        <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>⌘↵ save · Esc cancel</span>
      </div>
    </div>
  )
}

// ── TaskOriginBadge ───────────────────────────────────────────────────────────

/** Small teal chip linking back to the originating task in the project feed.
 *  Rendered as a secondary line below the name, above the body. */
function TaskOriginBadge({
  taskHref,
  entityId,
  label,
  onClick,
}: {
  taskHref: string
  entityId: string
  label?: string | null
  onClick?: (e: React.MouseEvent) => void
}) {
  return (
    <a
      href={taskHref}
      onClick={onClick ?? ((e) => e.stopPropagation())}
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

// ── Task-link click: open where you are, don't navigate away (#111) ──────────
//
// A task link in the PROJECT feed used to be a plain <a> to
// /portal/my-tasks?openTask=<id>, so clicking "Clustering -> hierarchical
// language" threw you off the project onto the My Tasks page (Nick: "it should
// show me that task, not take me to the task page").
//
// The href stays — it is what makes middle-click, ⌘-click and copy-link work,
// and it is the fallback when the surface can't open the task itself. A surface
// that CAN (ProjectDetail already mounts TaskDetailPanel and consumes
// ?openTask=) passes onOpenTask; it returns true when it actually opened the
// task, and only then do we suppress the navigation. A miss — task not in this
// project's loaded rows — falls through to the href rather than doing nothing.
//
// Modified clicks are never intercepted: open-in-new-tab must keep working.
function taskLinkClickHandler(entityId: string, onOpenTask?: (taskId: string) => boolean) {
  return (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onOpenTask) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    if (onOpenTask(entityId)) e.preventDefault()
  }
}

// ── KindBadge — consistent pill for update sub-types ─────────────────────────
//
// Only rendered when the update_type adds information (i.e. kind='update').
// Comment / completion / system don't need a redundant "Comment" or "Completed"
// label — the accent bar and the verb in the body are sufficient.

function UpdateBadge({ updateType }: { updateType: UpdateType }) {
  const cfg = UPDATE_TYPE_CONFIG[updateType] || UPDATE_TYPE_CONFIG.progress
  const Icon = cfg.icon
  // Whisper, not a pill (Nick 2026-07-09): the saturated filled badge was the
  // one loud colored element in the feed and kept snagging the eye. No fill, no
  // border, muted text — the type is still legible, and the left accent bar
  // already carries the type COLOUR. "Premium = refined restraint."
  return (
    <span
      aria-label={`Note type: ${cfg.label}`}
      className="inline-flex items-center gap-0.5"
      style={{
        fontSize: META_FONT_SIZE,
        color: 'var(--muted)',
        opacity: 0.75,
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
  onClick,
  children,
}: {
  motionProps?: object
  style?: React.CSSProperties
  className?: string
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void
  children: ReactNode
}) {
  if (motionProps) {
    return (
      <motion.div {...(motionProps as object)} style={style} className={className} onClick={onClick}>
        {children}
      </motion.div>
    )
  }
  return <div style={style} className={className} onClick={onClick}>{children}</div>
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
  onDelete,
  onEdit,
  onReply,
  replyCount,
  threadExpanded,
  onToggleThread,
  isReply,
  onDismiss,
  isHidden,
  onOpenTask,
}: ActivityEntryItemProps) {
  const isTask = entry.entity_type === 'task'
  const isHermes = entry.actor_slug === 'claude-ai'
  const person = getPersonInfo(entry.actor_slug)
  const [editing, setEditing] = useState(false)
  // "(edited)" marker — set by handleEditActivityEntry in metadata_json.edited.
  const wasEdited = (() => {
    try { return !!(entry.metadata_json && JSON.parse(entry.metadata_json).edited) } catch { return false }
  })()

  // Deep-link back to the task in the My Tasks view (project-stream only).
  const taskHref = isTask
    ? `/portal/my-tasks?openTask=${encodeURIComponent(entry.entity_id)}`
    : null
  const taskLabel = entry.task_title ?? null
  const onTaskLinkClick = isTask ? taskLinkClickHandler(entry.entity_id, onOpenTask) : undefined

  // Lifecycle rows (created / completed / changed) render as a quiet minimal
  // line, NOT a comment card — overriding the (previously unused-in-prod) card
  // treatment for these kinds. Hermes rows are always kind='comment', so this
  // never catches them. See LifecycleActivityLine + the 2026-07-09 spec (#93).
  //
  // In a CROSS-ENTITY feed (the project stream — showTaskOriginBadge), a task
  // lifecycle body is context-free on its own: "Completed" never says WHAT was
  // completed (#94). Pass the joined task title + deep-link so the line names
  // its subject. Task-detail feeds stay bare — there the subject IS the page.
  if (entry.kind === 'system' || entry.kind === 'completion') {
    return (
      <ActivityEntryWrapper motionProps={motionProps}>
        <LifecycleActivityLine
          entry={entry}
          onDelete={onDelete}
          {...(showTaskOriginBadge && isTask && taskHref
            ? { taskLabel, taskHref, onTaskLinkClick }
            : {})}
        />
      </ActivityEntryWrapper>
    )
  }


  // ── Determine bar colour ──────────────────────────────────────────────────
  let barColor = KIND_BAR[entry.kind]
  if (entry.kind === 'update' && entry.update_type) {
    const ut = entry.update_type
    barColor = UPDATE_TYPE_CONFIG[ut]?.borderColor ?? barColor
  }
  if (isHermes) barColor = withAlpha(ACCENT_GOLD, 35) // gold for Hermes

  // Task-origin rows in the project feed get a subtle left-inset.
  const taskOriginStyle =
    showTaskOriginBadge && isTask
      ? { marginLeft: 4, borderLeftWidth: taskOriginBorderWidth }
      : {}

  // ── Shared card shell ─────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    // Comment/update cards LIFT above the page (--surface-2) with a hairline edge
    // (--card-hairline) so they read as distinct blocks — restoring the
    // figure/ground separation that near-black-on-near-black (--cream == page bg
    // in dark mode) had erased. This is what makes the feed scannable before
    // reading (Nick 2026-07-09). Hermes keeps its gold-ring treatment.
    background: isHermes ? 'var(--gold-hover)' : 'var(--surface-2)',
    borderRadius: 'var(--radius-lg)',
    padding: cardPadding,
    ...(isHermes
      ? { border: `1px solid ${withAlpha(ACCENT_GOLD, 15)}`, borderLeft: `3px solid ${barColor}` }
      : { borderLeft: `3px solid ${barColor}`, boxShadow: '0 0 0 1px color-mix(in srgb, var(--slate) 15%, transparent)' }),
    // Dismissed (shown-hidden) roots read as "not in the live feed" via a DASHED
    // muted spine — NOT a whole-card opacity dim, which would compound with the
    // colored child spans and fail AA (CLAUDE.md compound-opacity rule).
    ...(isHidden ? { borderLeft: '3px dashed var(--border-subtle)' } : {}),
    ...taskOriginStyle,
    // §9.5.2 whole-card click affordance — only when there's a thread to open.
    cursor: onToggleThread ? 'pointer' : undefined,
    ...(onToggleThread ? ({ '--hov-bg': 'var(--hover-subtle)' } as React.CSSProperties) : {}),
  }

  // ── Whole-card click toggles the thread (§9.5.2 progressive disclosure) ──
  // onToggleThread is passed by ActivityThread ONLY on the root, and ONLY
  // when replyCount > 0 — gating on its presence alone already gives us
  // "root only" + "nothing to toggle when there are no replies" for free;
  // no separate isReply/replyCount check needed. Reuses the SAME toggle
  // (setExpanded) the "N replies" chevron already drives — one function,
  // two triggers, not a forked handler.
  const handleCardClick = onToggleThread
    ? (e: React.MouseEvent<HTMLDivElement>) => {
        // Bail on any interactive descendant — links, the Reply/edit/delete/
        // dismiss buttons, reaction pills, the inline editor's textarea, etc.
        // — so they keep working exactly as before. Read against the actual
        // render tree here (activityRender.tsx + LinkifiedText, ReactionBar,
        // HermesResponse): every interactive element in this card is a
        // <button>, <a> (incl. react-router <Link>, which renders <a>), or
        // (inside InlineCommentEditor) a <textarea>/<button> — no mention
        // chips or custom role="button" elements exist in this tree today.
        if ((e.target as HTMLElement).closest('button, a, input, textarea, select, [role="button"], [contenteditable]')) return
        onToggleThread()
      }
    : undefined

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
  } else if (entry.kind === 'comment' && showCommentBadge) {
    // Retained for backward compat only — gold bar already signals discussion.
    nameBadge = null
  }

  // ── Hermes: same skeleton, gold-ring card ────────────────────────────────
  if (isHermes) {
    return (
      <ActivityEntryWrapper
        motionProps={motionProps}
        style={cardStyle}
        className={onToggleThread ? 'detail-card hov-bg' : 'detail-card'}
        onClick={handleCardClick}
      >
        {/* Task-origin chip above the thread (project-feed only) */}
        {showTaskOriginBadge && isTask && taskHref && (
          <TaskOriginBadge
            taskHref={taskHref}
            entityId={entry.entity_id}
            label={taskLabel}
            onClick={onTaskLinkClick}
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
            {isHidden && <DismissedTag />}
            <EntryTime ts={entry.created_at} className="ml-auto" />
            {onDismiss && <DismissEntryButton isHidden={isHidden} onClick={onDismiss} />}
            {onDelete && <DeleteEntryButton onDelete={onDelete} />}
          </div>
        </div>
        {/* Body */}
        {isHermesPending(entry.body) ? (
          <HermesPending askedAt={entry.created_at} />
        ) : (
          <HermesResponse content={entry.body} />
        )}
        {showReactions && !isTask && (
          <div style={{ marginTop: 6 }}>
            <ReactionBar targetType="comment" targetId={entry.id} />
          </div>
        )}
      </ActivityEntryWrapper>
    )
  }

  // ── All other kinds: comment, update, completion, system ─────────────────
  //
  // One unified skeleton.  The kind signals via barColor + nameBadge only.
  return (
    <ActivityEntryWrapper
      motionProps={motionProps}
      style={cardStyle}
      className={onToggleThread ? 'detail-card hov-bg' : 'detail-card'}
      onClick={handleCardClick}
    >
      {/* Task-origin chip above the thread (project-feed only) */}
      {showTaskOriginBadge && isTask && taskHref && (
        <TaskOriginBadge
          taskHref={taskHref}
          entityId={entry.entity_id}
          label={taskLabel}
          onClick={onTaskLinkClick}
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
                fontWeight: 'var(--weight-heading)' as React.CSSProperties['fontWeight'],
                color: 'var(--ink)',
                flexShrink: 0,
              }}
            >
              {person.name}
            </span>
            {nameBadge}
            {entry.visibility === 'author' && <AuthorOnlyBadge />}
            {isHidden && <DismissedTag />}
            <EntryTime ts={entry.created_at} className="ml-auto" />
            {onEdit && !editing && <EditEntryButton onClick={() => setEditing(true)} />}
            {onDismiss && <DismissEntryButton isHidden={isHidden} onClick={onDismiss} />}
            {onDelete && <DeleteEntryButton onDelete={onDelete} />}
          </div>

          {/* Body — inline editor while editing, else the rendered body + (edited) tag */}
          {editing && onEdit ? (
            <InlineCommentEditor
              initial={entry.body}
              onSave={(v) => { onEdit(v); setEditing(false) }}
              onCancel={() => setEditing(false)}
            />
          ) : (
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
              {renderBodyWithImages(entry.body)}
              {wasEdited && (
                <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.5, fontStyle: 'italic', marginLeft: 6 }}>(edited)</span>
              )}
            </p>
          )}

          {/* ONE action row: reactions + thread controls (#112).
              These used to be two stacked rows, and on a project-entity row the
              reaction row is EMPTY until somebody reacts — a 26px band holding a
              single right-floated dashed "+", measured on prod. That band is what
              Nick saw as "so much space between the end of that statement and the
              reply". Merging them costs the feed nothing and removes the gap;
              existing reaction pills still sit closest to the body they belong to. */}
          {/* #98 thread controls. Quiet by design — a thread affordance should
              not out-shout the message it hangs off. The count stays visible
              while COLLAPSED, which is the whole point: "so i can respond to
              somebody else" needs to work without expanding first. */}
          {/* The Reply control also shows on a REPLY so you can answer Hermes
              in-thread (it opens the root's composer — the follow-up still
              attaches to the root, so the thread stays one level). The reply
              COUNT / expand toggle stays root-only. */}
          {((showReactions && !isTask) || onReply || ((replyCount ?? 0) > 0 && !isReply)) && (
            <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 6 }}>
              {showReactions && !isTask && (
                <ReactionBar
                  targetType={entry.kind === 'update' ? 'project_update' : 'comment'}
                  targetId={entry.id}
                />
              )}
              {(replyCount ?? 0) > 0 && !isReply && onToggleThread && (
                <button
                  type="button"
                  onClick={onToggleThread}
                  aria-expanded={threadExpanded ? 'true' : 'false'}
                  className="cursor-pointer inline-flex items-center gap-1"
                  style={{
                    fontSize: '11px', fontWeight: 500, color: 'var(--teal)',
                    background: 'none', border: 'none', padding: 0,
                  }}
                >
                  <ChevronRight
                    {...ICON_PROPS}
                    size={12}
                    style={{ transform: threadExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 140ms' }}
                  />
                  {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                </button>
              )}
              {onReply && (
                <button
                  type="button"
                  onClick={onReply}
                  className="cursor-pointer"
                  style={{
                    fontSize: '11px', color: 'var(--slate)', opacity: 0.85,
                    background: 'none', border: 'none', padding: 0,
                  }}
                >
                  {isReply && isHermes ? 'Reply to Hermes' : 'Reply'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </ActivityEntryWrapper>
  )
}
