// TaskRowActions — the trailing per-row verb strip for a SharedTaskRow.
//
// WHY (Nick 2026-07-21): the meeting pipeline deliberately OVER-produces action
// items, so killing the irrelevant ones has to be near-zero friction. Before
// this, the only way to remove one was: expand the row → open the full editor
// panel → Delete → confirm. Same for re-routing a whole meeting's items that
// landed on the wrong project. Four+ interactions for a one-second decision,
// repeated 20× per debrief.
//
// Contract:
//   • Project cluster — ALWAYS visible, TWO deliberately separate controls
//     (Nick 2026-07-21, overturning the first cut which dropped navigation):
//       – the CHIP (combobox, "Project") shows the project name, or "No project"
//         when unrouted, and opens the searchable picker. Not hover-gated: the
//         failure this exists to fix is "a whole meeting's items landed on the
//         WRONG project", which you can only spot if the project reads at rest.
//         It shows "No project" for unrouted items, which the plain ProjectTag
//         link (TaskRow.tsx) cannot — that renders NOTHING when project is null,
//         so the rows most likely to be mis-routed were the least visible.
//       – the ARROW (link, "Open <name>") navigates to the project, and renders
//         ONLY when the row is actually routed. It resolves the project from
//         the SAME query that labels the chip, so the two can never disagree.
//     Why the big target is the picker and not the link, inverting the usual
//     "project name = link" reading: this is a TRIAGE surface. Re-routing is the
//     frequent act here (it is the reason the feature exists); navigating away
//     is rare and the page already carries project links in "Projects
//     discussed". The frequent action gets the generous hit area. They are
//     separate elements with different ROLES (combobox vs link) and different
//     accessible names, so neither the pointer nor the a11y tree can confuse
//     them — pinned by the accessible-name uniqueness sweep in
//     tests/local/journeys/meeting-row-actions.spec.ts.
//     Surfaces mounting this strip should pass `project={null}` to TaskRow so
//     the row does not ALSO render ProjectTag, which would print the project
//     name twice.
//   • Verbs (done / edit / delete) — revealed on row hover or keyboard focus
//     via the `.task-row-verbs` class in index.css. Deliberately CSS-driven,
//     not React `hover` state: hover state never fires on Tab, and a strip that
//     exists only on :hover is unreachable by keyboard and screen reader.
//     Every button carries a real aria-label + tooltip.
//
// The `done` verb intentionally duplicates the row's left-edge DoneBox. That is
// not an accident of layering: when sweeping 20 over-produced items, all the
// verbs being adjacent under one cursor is the whole ergonomic point, and both
// controls call the SAME handler — there is no second code path to diverge.
// It is therefore rendered DECORATIVE (aria-hidden + tabIndex=-1): a second
// button carrying the identical accessible name "Mark done" makes a screen
// reader announce the same action twice per row and adds a dead stop to the tab
// order, with zero capability gained — the DoneBox is already the canonical,
// always-visible, keyboard-reachable done control. Pointer users get the
// adjacency; assistive tech gets exactly one done control per row. (Caught by
// tests/local/journeys/meeting-row-actions.spec.ts, which resolved two elements
// for the same role+name.) aria-hidden is only legitimate here BECAUSE the
// element is removed from the tab order in the same breath.
//
// Reuse: the project picker is ProjectInlineGhostSelect (the same searchable
// GhostSelect combobox the full editor and both inline drawers use), so the
// option list, search, keyboard nav and ARIA are identical everywhere.

import { ArrowUpRight, Check, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ICON_PROPS } from '../../lib/iconProps'
import { PATHS } from '../../constants/paths'
import { ProjectInlineGhostSelect } from './detail/FieldControls'
import { useProjectPickerList } from '../../hooks/useProjectPickerList'

export interface TaskRowActionsProps {
  isDone: boolean
  /** Project SLUG (TASK_SELECT_COLS resolves project_id to slug at the read boundary). */
  projectId: string | null
  onToggleDone: () => void
  onOpenEditor: () => void
  /** next is the chosen slug, or null when "No project" is picked. */
  onProjectChange: (next: string | null) => void
  onDelete: () => void
}

function VerbButton({
  label, onClick, danger, decorative, children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  /**
   * Pointer-only duplicate of a control that already exists elsewhere on the
   * row. Hidden from the accessibility tree AND from the tab order together —
   * never one without the other (aria-hidden on a focusable element is a
   * defect, not a shortcut).
   */
  decorative?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className="tip tip-end"
      data-tip={label}
      {...(decorative
        ? { 'aria-hidden': true as const, tabIndex: -1 }
        : { 'aria-label': label })}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      // Row-level mousedown starts the long-press multi-select timer and the
      // row click expands — neither should fire from a verb press.
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--sp-xs)',
        cursor: 'pointer',
        color: danger ? 'var(--maroon)' : 'var(--slate)',
        opacity: 0.85,
        lineHeight: 1,
        flexShrink: 0,
        fontFamily: 'inherit',
        touchAction: 'manipulation',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-subtle)'; e.currentTarget.style.opacity = '1' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = '0.85' }}
    >
      {children}
    </button>
  )
}

export function TaskRowActions({
  isDone, projectId, onToggleDone, onOpenEditor, onProjectChange, onDelete,
}: TaskRowActionsProps) {
  // Resolved from the SAME query that labels the chip (hooks/useProjectPickerList)
  // so the arrow and the chip can never disagree about what this row is routed
  // to. No arrow when the slug is unknown — there is nowhere to navigate — while
  // the chip still falls back to showing the raw slug, so an unresolvable route
  // stays VISIBLE even though it is not navigable.
  const { data: projectList = [] } = useProjectPickerList()
  const project = projectId ? projectList.find((p) => p.slug === projectId) ?? null : null

  return (
    <div
      className="task-row-actions"
      // The strip lives INSIDE the row's clickable body; without this every
      // press would also toggle the row's expand/select.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
    >
      <ProjectInlineGhostSelect
        value={projectId ?? ''}
        onChange={(v) => onProjectChange(v || null)}
      />
      {project && (
        // Navigation, kept distinct from the picker beside it: its own element,
        // its own role (link), its own name. An icon-only link has no text to
        // underline, so unlike a NAMED link it does carry a tooltip — the
        // "named links need no tooltip" rule (index.css .link-affordance) is
        // about project-name links, which this is not.
        <Link
          to={PATHS.project(project.slug)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="tip tip-end"
          data-tip={`Open ${project.title}`}
          aria-label={`Open ${project.title}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--teal)',
            opacity: 0.9,
            padding: 'var(--sp-xs)',
            borderRadius: 'var(--radius-md)',
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          <ArrowUpRight {...ICON_PROPS} size={12} />
        </Link>
      )}
      <div className="task-row-verbs" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <VerbButton label={isDone ? 'Mark not done' : 'Mark done'} onClick={onToggleDone} decorative>
          <Check {...ICON_PROPS} size={13} style={{ color: isDone ? 'var(--green)' : undefined }} />
        </VerbButton>
        <VerbButton label="Edit action item" onClick={onOpenEditor}>
          <Pencil {...ICON_PROPS} size={13} />
        </VerbButton>
        <VerbButton label="Delete action item" onClick={onDelete} danger>
          <Trash2 {...ICON_PROPS} size={13} />
        </VerbButton>
      </div>
    </div>
  )
}

export default TaskRowActions
