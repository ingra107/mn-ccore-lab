// SleekRows: THE sleek single-line row for data views (Nick 2026-10-10, the
// "Tasks: sleek rows" mock, rules-ui-design 19). One row chrome, every page;
// each page configures its own columns.
//
// API
//   <SleekTable columns sort onSort(next) header narrowBelow defaultSortLabel className>
//     Measures its own width (not the viewport). Columns whose `minTableWidth`
//     is above that width are dropped; below `narrowBelow` (default 640) rows
//     switch to the phone layout. Renders the sticky header (blurred page
//     wash, one hairline) unless `header={false}`; on the phone layout the
//     header becomes one "Sort" select over the same sortable columns.
//   <SleekRow row cursor selected urgent done expanded selectMode onClick
//             onDoubleClick onMouseDown onMouseUp onMouseLeave className data>
//     One 40px line (min-height 40, auto on the phone layout) with radius,
//     hover tint, cursor ring, selected teal wash + 2px edge, urgent orange
//     edge (selection wins). In a cell flagged `interactive`, clicks on a
//     control (link, button, input, an open menu) never reach onClick; clicks
//     on the cell's text or empty space do. `children` render BELOW the line.
//   <SleekOverdueLine count note> - the quiet overdue line above a table.
//   nextSleekSort(cur, key) (./sleekSort) - the header cycle: asc -> desc -> cleared.
//
// Column config (SleekColumn<T>)
//   key, label?, width (a CSS grid track), sortable?, align 'end'?,
//   minTableWidth? (drop from the desktop grid below this table width; the
//   phone layout ignores it and uses `phone`), interactive? (cell owns its
//   clicks: an inline editor or a button), hover? (fades in on row hover, the
//   cursor row or keyboard focus; space is kept so rows line up),
//   phone? 'lead' | 'title' | 'line' | 'trail' (where the cell goes on the
//   phone layout; unset = hidden there), render(row), renderPhone?(row).
//
// Pieces inside cells come from the Today card (.tk-* chips, Face, CardCheck,
// CardDuePill): the table wraps itself in `.tk` so they render the same way.
// Styles: `.sr-*` in index.css.

import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'

import { nextSleekSort, type SleekSort } from './sleekSort'

export type { SleekSort }

export interface SleekColumn<T> {
  key: string
  label?: string
  width: string
  sortable?: boolean
  align?: 'start' | 'end'
  minTableWidth?: number
  interactive?: boolean
  hover?: boolean
  phone?: 'lead' | 'title' | 'line' | 'trail'
  render: (row: T) => ReactNode
  renderPhone?: (row: T) => ReactNode
}

interface Layout {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: SleekColumn<any>[]
  narrow: boolean
}
const LayoutCtx = createContext<Layout | null>(null)

export function SleekTable<T>({ columns, sort = null, onSort, header = true, narrowBelow = 640, defaultSortLabel = 'Default order', className, style, children }: {
  columns: SleekColumn<T>[]
  sort?: SleekSort
  /** Receives the next sort state (header click = the asc/desc/cleared cycle). */
  onSort?: (next: SleekSort) => void
  header?: boolean
  narrowBelow?: number
  defaultSortLabel?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  // 0 = not measured yet: render every column, desktop layout.
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const narrow = width > 0 && width < narrowBelow
  // The phone layout places columns by `phone` slot alone: minTableWidth
  // governs the desktop grid only, so a column can drop off a mid-width grid
  // and still show in its phone slot.
  const visible = useMemo(
    () => (narrow ? columns : columns.filter((c) => width === 0 || !c.minTableWidth || width >= c.minTableWidth)),
    [columns, width, narrow],
  )
  const layout = useMemo<Layout>(() => ({ columns: visible, narrow }), [visible, narrow])
  const template = visible.map((c) => c.width).join(' ')
  const sortable = columns.filter((c) => c.sortable && c.label)

  return (
    <LayoutCtx.Provider value={layout}>
      <div
        ref={ref}
        className={`tk sr${narrow ? ' sr-narrow' : ''}${className ? ` ${className}` : ''}`}
        role="table"
        style={{ ...style, '--sr-cols': template } as CSSProperties}
      >
        {header && !narrow && (
          <div className="sr-g sr-hd" role="row">
            {visible.map((c) => {
              const active = sort?.key === c.key
              return (
                <div
                  key={c.key}
                  role="columnheader"
                  className={c.align === 'end' ? 'sr-end' : undefined}
                  aria-sort={c.sortable ? (active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                >
                  {c.sortable && c.label && onSort ? (
                    <button
                      type="button"
                      className={active ? 'sr-on' : undefined}
                      onClick={() => onSort(nextSleekSort(sort, c.key))}
                      title={active ? (sort.dir === 'asc' ? 'Sorted ascending. Click for descending.' : 'Sorted descending. Click to clear.') : `Sort by ${c.label.toLowerCase()}`}
                    >
                      {c.label}{active && <span aria-hidden="true" className="sr-arr">{sort.dir === 'asc' ? '▴' : '▾'}</span>}
                    </button>
                  ) : c.label}
                </div>
              )
            })}
          </div>
        )}
        {header && narrow && sortable.length > 0 && onSort && (
          <div className="sr-sorter">
            <label>
              Sort
              <select
                aria-label="Sort by"
                value={sort ? `${sort.key}:${sort.dir}` : ''}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(':')
                  onSort(key ? { key, dir: dir === 'desc' ? 'desc' : 'asc' } : null)
                }}
              >
                <option value="">{defaultSortLabel}</option>
                {sortable.flatMap((c) => [
                  <option key={`${c.key}:asc`} value={`${c.key}:asc`}>{c.label} ▴</option>,
                  <option key={`${c.key}:desc`} value={`${c.key}:desc`}>{c.label} ▾</option>,
                ])}
              </select>
            </label>
          </div>
        )}
        {children}
      </div>
    </LayoutCtx.Provider>
  )
}

// What counts as a control inside an `interactive` cell. A click on one (or
// anywhere in a menu the cell portals out) stays in the cell; a click on the
// cell's plain text or empty space reaches the row, so no cell is a dead zone.
const CONTROL = 'a,button,input,select,textarea,label,[role="button"],[role="option"],[role="listbox"],[role="dialog"],[role="menu"],[role="menuitem"],[contenteditable="true"]'
const keepControlClicks = (e: MouseEvent<HTMLDivElement>) => {
  const target = e.target as Element
  const cell = e.currentTarget
  // Portaled menus bubble through React but sit outside the cell in the DOM.
  if (!cell.contains(target)) { e.stopPropagation(); return }
  const control = target.closest?.(CONTROL)
  if (control && cell.contains(control)) e.stopPropagation()
}

export function SleekRow<T>({ row, cursor = false, selected = false, urgent = false, done = false, expanded = false, selectMode = false, onClick, onDoubleClick, onMouseDown, onMouseUp, onMouseLeave, className, data, children }: {
  row: T
  cursor?: boolean
  selected?: boolean
  urgent?: boolean
  done?: boolean
  expanded?: boolean
  /** Ctrl/Meta held: the pointer reads as "select", not "open". */
  selectMode?: boolean
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  onDoubleClick?: (e: MouseEvent<HTMLDivElement>) => void
  onMouseDown?: (e: MouseEvent<HTMLDivElement>) => void
  onMouseUp?: (e: MouseEvent<HTMLDivElement>) => void
  onMouseLeave?: (e: MouseEvent<HTMLDivElement>) => void
  className?: string
  /** data-* attributes for the row line (e.g. { 'task-id': t.id }). */
  data?: Record<string, string>
  children?: ReactNode
}) {
  const layout = useContext(LayoutCtx)
  if (!layout) throw new Error('SleekRow must render inside a SleekTable')
  const { columns, narrow } = layout
  const dataAttrs = Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]))
  // A table with no `lead` column (no complete box) drops the phone lead slot.
  const noLead = narrow && !columns.some((c) => c.phone === 'lead')
  const cls = `sr-row${narrow ? ' sr-ph' : ' sr-g'}${noLead ? ' sr-nolead' : ''}${cursor ? ' sr-cur' : ''}${selected ? ' sr-sel' : ''}${urgent ? ' sr-urg' : ''}${done ? ' sr-done' : ''}${expanded ? ' sr-exp' : ''}${selectMode ? ' sr-selmode' : ''}${className ? ` ${className}` : ''}`

  const cell = (c: SleekColumn<T>, phone = false) => {
    const content = phone && c.renderPhone ? c.renderPhone(row) : c.render(row)
    const cellCls = `sr-c${c.align === 'end' ? ' sr-end' : ''}${c.hover ? ' sr-hv' : ''}`
    return (
      <div key={c.key} role="cell" className={cellCls} data-col={c.key} onClick={c.interactive ? keepControlClicks : undefined}>
        {content}
      </div>
    )
  }

  let line: ReactNode
  if (narrow) {
    const at = (slot: SleekColumn<T>['phone']) => columns.filter((c) => c.phone === slot)
    // A page with no lead column (no complete box) gets no lead track, so its
    // titles start at the row's edge (.sr-nolead in index.css).
    const lead = at('lead')
    line = (
      <>
        {lead.length > 0 && <div className="sr-ph-lead">{lead.map((c) => cell(c, true))}</div>}
        <div className="sr-ph-mid">
          <div className="sr-ph-t">{at('title').map((c) => cell(c, true))}</div>
          {at('line').length > 0 && <div className="sr-ph-l">{at('line').map((c) => cell(c, true))}</div>}
        </div>
        <div className="sr-ph-trail">{at('trail').map((c) => cell(c, true))}</div>
      </>
    )
  } else {
    line = columns.map((c) => cell(c))
  }

  return (
    <div className="sr-item">
      <div
        role="row"
        aria-selected={selected}
        className={cls}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        {...dataAttrs}
      >
        {line}
      </div>
      {children}
    </div>
  )
}

/** The quiet overdue line: a red dot, "N overdue", then a muted note. */
export function SleekOverdueLine({ count, note = 'sorted to the top, oldest first' }: { count: number; note?: string }) {
  if (count <= 0) return null
  return (
    <div className="sr-ovl" role="status">
      <i aria-hidden="true" />
      <b>{count} overdue</b>
      <span>{note}</span>
    </div>
  )
}
