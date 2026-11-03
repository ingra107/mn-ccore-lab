// SortPicker: the ONE way a person places a task in a kind-of-work section
// (Review / Writing / Analysis & Build / Replies & admin), or leaves it in Sort,
// or hands it back to the automatic rules. Replaces the two Move popovers that
// wrote group_override (My Tasks InlineDetail, Today TaskDetailDrawer).
//
//   (hooks/useSortActions: the three writes, POST /api/tasks/:id/sort, with a toast)
//   SortKindButtons  the Sort strip: one tap per kind, on the row itself
//   SortMenu         the "Set section" menu: kinds, Leave unsorted, Reset
//
// Every call is logged by the Worker (task_sort_events), with the section the
// row sat in; that log is how Nick measures how often he sorts and whether a
// category is missing.

import type { CSSProperties } from 'react'
import { useSortActions } from '../../hooks/useSortActions'
import { isHandSorted, WORK_KINDS } from '../../lib/taskSections'
import { withAlpha, INK, INK_DIM, PANEL_BG } from '../../lib/taskGrouping'
import type { TaskRow } from '../../lib/api'

/** The Sort strip's one-tap kind buttons, under a row that has no kind yet. */
export function SortKindButtons({ task }: { task: TaskRow }) {
  const { sortAs, pending } = useSortActions(task)
  return (
    <div
      role="group"
      aria-label="Sort this task"
      className="tk-sortbtns"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {WORK_KINDS.map((k) => (
        <button
          key={k.code}
          type="button"
          className="tk-btn tk-sm"
          disabled={pending}
          onClick={() => sortAs(k.code)}
        >
          {k.label}
        </button>
      ))}
    </div>
  )
}

/** The "Set section" menu body. The caller owns the trigger and the open state. */
export function SortMenu({ task, onDone }: { task: TaskRow; onDone: () => void }) {
  const { sortAs, leaveUnsorted, reset, pending } = useSortActions(task, onDone)
  const hand = isHandSorted(task)
  const item = (on: boolean): CSSProperties => ({
    display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11,
    background: on ? withAlpha('var(--job-accent)', 15) : 'transparent', border: 'none',
    color: on ? 'var(--job-accent)' : INK, fontFamily: 'inherit', cursor: pending ? 'wait' : 'pointer',
  })
  return (
    <div
      role="menu"
      aria-label="Set section"
      style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200, background: PANEL_BG, boxShadow: 'inset 0 0 0 1px var(--sk-line2), 0 4px 12px rgba(0,0,0,0.4)', borderRadius: 'var(--radius-sm)', zIndex: 30 }}
    >
      {WORK_KINDS.map((k) => {
        const on = hand && task.work_kind === k.code
        return (
          <button key={k.code} type="button" role="menuitem" onClick={() => sortAs(k.code)} disabled={pending} style={item(on)}>
            Sort as {k.label}{on ? ' ✓' : ''}
          </button>
        )
      })}
      <button type="button" role="menuitem" onClick={leaveUnsorted} disabled={pending} style={item(hand && !task.work_kind)}>
        Leave unsorted{hand && !task.work_kind ? ' ✓' : ''}
      </button>
      {hand && (
        <>
          <div style={{ height: 1, background: 'var(--sk-line)', margin: '4px 0' }} />
          <button
            type="button"
            role="menuitem"
            onClick={reset}
            disabled={pending}
            style={{ ...item(false), color: INK_DIM, fontStyle: 'italic' }}
          >
            ↺ Reset to automatic
          </button>
        </>
      )}
    </div>
  )
}
