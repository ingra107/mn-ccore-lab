import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import {
  barOf, dayToIso, ganttSpan, grantName, isoToDay, milestoneDate, movedTerms,
  type GanttBar, type GrantProduct,
} from '../../lib/grants'
import { GRANT_BAR_LIT, GRANT_BAR_STROKE } from '../../lib/grantBar'

// The Grants page's timeline (Nick 2026-10-12): an award is a solid bar from
// its start to its end; an application is a hypothetical, hatched outline from
// its proposed start, its length the mechanism's usual term ("you can still
// show that in the Gantt chart as like a hypothetical... muted"). Milestones
// are diamonds. A bar moves by dragging it ("you could actually move some of
// those dates by just moving those bars") or from the keyboard: focus a bar,
// arrows move it a week (Shift: a month), Enter saves, Escape puts it back.
// An award keeps its length; an application moves its proposed start.

const WEEK = 7
const MONTH = 30

export interface GanttMove {
  row: GrantProduct
  fields: { period_start?: string; period_end?: string }
}

export default function GrantGantt({ rows, today, onMove }: {
  rows: GrantProduct[]
  today: string
  onMove: (m: GanttMove) => void
}) {
  const plotted = useMemo(
    () => rows.map((r) => ({ row: r, bar: barOf(r) })).filter((x): x is { row: GrantProduct; bar: GanttBar } => x.bar !== null),
    [rows],
  )
  const unplotted = rows.length - plotted.length
  const span = useMemo(() => ganttSpan(
    plotted.map((p) => p.bar),
    plotted.flatMap((p) => p.row.milestones.map(milestoneDate).filter((d): d is string => !!d)),
    today,
  ), [plotted, today])
  const trackRef = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(0)
  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return
    const measure = () => setTrackWidth(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const days = span.to - span.from
  const pct = (day: number) => `${((day - span.from) / days) * 100}%`
  const years: number[] = []
  for (let y = new Date(span.from * 86_400_000).getUTCFullYear(); isoToDay(`${y}-01-01`) < span.to; y++) years.push(y)
  // A year label needs ~36px; on a narrow track label every 2nd (or 3rd...) year.
  const every = trackWidth ? Math.max(1, Math.ceil((years.length * 36) / trackWidth)) : 1

  if (plotted.length === 0) {
    return <p className="gg-empty">Nothing to plot yet: give a grant a start date (a proposed start for an application) and it shows here.</p>
  }

  return (
    <div className="gg" data-testid="grant-gantt">
      <div className="gg-grid">
        <div className="gg-axis-label" aria-hidden="true" />
        <div className="gg-axis" ref={trackRef} aria-hidden="true">
          {years.map((y, i) => (
            <span key={y} className="gg-year" style={{ left: pct(isoToDay(`${y}-01-01`)) }}>
              {i % every === 0 ? (every > 1 ? `'${String(y).slice(2)}` : y) : ''}
            </span>
          ))}
        </div>
        {plotted.map(({ row, bar }) => (
          <GanttRow key={row.id} row={row} bar={bar} pct={pct} dayPerPx={trackWidth ? days / trackWidth : 0} today={today} onMove={onMove} />
        ))}
      </div>
      <div className="gg-legend" aria-hidden="true">
        <span><i className="gg-key gg-key-award" /> Award</span>
        <span><i className="gg-key gg-key-hyp" /> Proposed (hypothetical length)</span>
        <span><i className="gg-key-ms">◆</i> Milestone</span>
        <span className="gg-hint">Drag a bar, or focus it and use the arrow keys, to move its dates.</span>
      </div>
      {unplotted > 0 && <p className="gg-note">{unplotted} {unplotted === 1 ? 'grant has' : 'grants have'} no start date yet and {unplotted === 1 ? 'is' : 'are'} not plotted.</p>}
      <style>{CSS}</style>
    </div>
  )
}

function GanttRow({ row, bar, pct, dayPerPx, today, onMove }: {
  row: GrantProduct; bar: GanttBar; pct: (d: number) => string; dayPerPx: number; today: string
  onMove: (m: GanttMove) => void
}) {
  // A move in progress, in days: shown on the bar, written on release/Enter.
  const [offset, setOffset] = useState(0)
  const drag = useRef<{ x: number; pointer: number } | null>(null)
  const name = grantName(row)
  const start = isoToDay(bar.start) + offset
  const end = isoToDay(bar.end) + offset
  const commit = (daysMoved: number) => {
    setOffset(0)
    const fields = movedTerms(row, daysMoved)
    if (fields) onMove({ row, fields })
  }
  const describe = `${name}: ${bar.hypothetical ? 'proposed start' : 'from'} ${dayToIso(start)}${bar.hypothetical ? '' : ` to ${dayToIso(end)}`}`
  const todayDay = isoToDay(today)

  return (
    <>
      <div className="gg-label">
        <Link to={PATHS.project(row.project_slug)} className="gg-name">{name}</Link>
        <span className="gg-sub">{[row.venue, row.stage_label].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="gg-track">
        <span className="gg-today" style={{ left: pct(todayDay) }} aria-hidden="true" />
        <button
          type="button"
          className={`gg-bar${bar.hypothetical ? ' is-hyp' : ''}${offset ? ' is-moving' : ''}`}
          data-testid={`gantt-bar-${row.id}`}
          style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }}
          aria-label={`${describe}. Arrow keys move it a week, Shift with an arrow a month, Enter saves, Escape cancels.`}
          title={describe}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.currentTarget.setPointerCapture(e.pointerId)
            drag.current = { x: e.clientX, pointer: e.pointerId }
          }}
          onPointerMove={(e) => {
            if (!drag.current || drag.current.pointer !== e.pointerId || !dayPerPx) return
            setOffset(Math.round((e.clientX - drag.current.x) * dayPerPx))
          }}
          onPointerUp={(e) => {
            if (!drag.current || drag.current.pointer !== e.pointerId) return
            drag.current = null
            commit(offset)
          }}
          onPointerCancel={() => { drag.current = null; setOffset(0) }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? MONTH : WEEK
            if (e.key === 'ArrowRight') { e.preventDefault(); setOffset((o) => o + step) }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); setOffset((o) => o - step) }
            else if (e.key === 'Enter') { e.preventDefault(); commit(offset) }
            else if (e.key === 'Escape') { setOffset(0) }
          }}
          onBlur={() => { if (offset && !drag.current) commit(offset) }}
        >
          <span className="gg-bar-text">{bar.hypothetical ? 'proposed' : row.venue ?? ''}</span>
        </button>
        {row.milestones.map((m) => {
          const d = milestoneDate(m)
          if (!d) return null
          return (
            <span
              key={m.id}
              className={`gg-ms${m.completed ? ' is-done' : ''}`}
              style={{ left: pct(isoToDay(d)) }}
              title={`${m.title}: ${d}`}
              role="img"
              aria-label={`Milestone ${m.title}, ${d}${m.completed ? ', done' : ''}`}
              data-testid={`gantt-ms-${m.id}`}
            >◆</span>
          )
        })}
      </div>
    </>
  )
}

// Tokens only. Award = the one funded teal (grantBar.ts); hypothetical = a
// muted, hatched, dashed outline with no fill, so it reads as "not yet".
const CSS = `
.gg { width: 100%; }
.gg-grid { display: grid; grid-template-columns: minmax(120px, 220px) minmax(0, 1fr); row-gap: 6px; column-gap: 12px; align-items: center; }
.gg-axis { position: relative; height: 18px; border-bottom: 1px solid var(--sk-line2); }
.gg-year { position: absolute; top: 0; transform: translateX(2px); font-size: 11px; color: var(--sk-t3); border-left: 1px solid var(--sk-line2); padding-left: 3px; height: 18px; }
.gg-label { display: flex; flex-direction: column; min-width: 0; }
.gg-name { font-size: 13px; color: var(--sk-t1); text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gg-name:hover { text-decoration: underline; text-underline-offset: 2px; }
.gg-sub { font-size: 11px; color: var(--sk-t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gg-track { position: relative; height: 34px; }
.gg-today { position: absolute; top: -4px; bottom: -4px; width: 0; border-left: 1px dashed var(--sk-t3); opacity: .6; }
.gg-bar {
  position: absolute; top: 10px; height: 20px; min-width: 6px; border-radius: 6px; border: 0; padding: 0 6px;
  background: ${GRANT_BAR_LIT}; color: #fff; font-size: 11px; text-align: left; cursor: grab; touch-action: none;
  overflow: hidden; white-space: nowrap;
}
.gg-bar:active { cursor: grabbing; }
.gg-bar:focus-visible { outline: 2px solid var(--job-accent); outline-offset: 2px; }
.gg-bar.is-hyp {
  background: repeating-linear-gradient(135deg, color-mix(in srgb, ${GRANT_BAR_STROKE} 14%, transparent) 0 6px, transparent 6px 12px);
  border: 1.5px dashed ${GRANT_BAR_STROKE}; color: var(--sk-t2); opacity: .85;
}
.gg-bar.is-moving { box-shadow: 0 0 0 2px var(--job-accent); }
.gg-bar-text { pointer-events: none; }
.gg-ms { position: absolute; top: -1px; transform: translateX(-50%); font-size: 12px; line-height: 1; color: var(--job-milestone); pointer-events: auto; }
.gg-ms.is-done { opacity: .45; }
.gg-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 12px; font-size: 11px; color: var(--sk-t3); align-items: center; }
.gg-key { display: inline-block; width: 18px; height: 9px; border-radius: 3px; vertical-align: middle; margin-right: 4px; }
.gg-key-award { background: ${GRANT_BAR_LIT}; }
.gg-key-hyp { border: 1.5px dashed ${GRANT_BAR_STROKE}; background: repeating-linear-gradient(135deg, color-mix(in srgb, ${GRANT_BAR_STROKE} 14%, transparent) 0 3px, transparent 3px 6px); }
.gg-key-ms { color: var(--job-milestone); font-style: normal; margin-right: 4px; }
.gg-hint { margin-left: auto; }
.gg-note, .gg-empty { font-size: 12px; color: var(--sk-t3); margin-top: 8px; }
@media (max-width: 640px) {
  .gg-grid { grid-template-columns: minmax(84px, 110px) minmax(0, 1fr); column-gap: 8px; }
  .gg-hint { margin-left: 0; }
}
`
