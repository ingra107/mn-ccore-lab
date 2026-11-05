import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { ProductLadder } from '../project/ProductStageCell'
import type { ProductKind, ProductRow } from '../../lib/products'
import { formatUsd, grantName, type GrantProduct } from '../../lib/grants'
import { displayName } from '../../lib/nameUtils'
import type { GrantTermFields } from '../../hooks/useGrantProducts'
import InlineDatePicker from '../InlineDatePicker'
import { formatMediumDate } from '../../lib/dateUtils'
import { SleekTable, SleekRow, type SleekColumn } from '../table/SleekRows'

// The Grants page's list: one row per grant product (an R03's A0 and A1 are
// two rows). Each shows its project and name (linked to the project page), the
// PI, its stage on its own ladder (the member route), and its terms, edited in
// place: venue (agency + mechanism), the dates the kind has, and an award's
// amount. A date or amount the kind does not have is not offered: schema-v128
// refuses it anyway, so the cell would only invite an error.

export interface TermEdit {
  row: GrantProduct
  fields: GrantTermFields
  label: string
}

export default function GrantList({ rows, kinds, onEdit }: {
  rows: GrantProduct[]
  kinds: ProductKind[]
  onEdit: (e: TermEdit) => void
}) {
  // On the shared sleek row (Rule 68). Six columns when it fits; below that the
  // phone anatomy: the name, its context, then each value under a label, and only
  // the terms this kind has (Nick, M27).
  const columns = useMemo<SleekColumn<GrantProduct>[]>(() => {
    const venue = (g: GrantProduct) => (
      <TextCell
        label={`Venue for ${grantName(g)}`} value={g.venue ?? ''} placeholder="NHLBI R01" testId={`grant-venue-${g.id}`}
        onSave={(v) => onEdit({ row: g, fields: { venue: v || null }, label: `${grantName(g)}: venue ${v || 'cleared'}` })}
      />
    )
    const stage = (g: GrantProduct) => (
      <ProductLadder slug={g.project_slug} product={g as unknown as ProductRow} kinds={kinds} testId={`grant-stage-${g.id}`} />
    )
    const start = (g: GrantProduct, hint?: string) => (
      <DateCell
        label={`${g.kind === 'award' ? 'Start' : 'Proposed start'} for ${grantName(g)}`} value={g.period_start} testId={`grant-start-${g.id}`}
        hint={hint}
        onSave={(v) => onEdit({ row: g, fields: { period_start: v }, label: `${grantName(g)}: start ${v ?? 'cleared'}` })}
      />
    )
    const end = (g: GrantProduct, hint?: string) => g.kind === 'award' ? (
      <DateCell
        label={`End for ${grantName(g)}`} value={g.period_end} testId={`grant-end-${g.id}`}
        onSave={(v) => onEdit({ row: g, fields: { period_end: v }, label: `${grantName(g)}: end ${v ?? 'cleared'}` })}
      />
    ) : (
      <DateCell
        label={`Due date for ${grantName(g)}`} value={g.deadline} testId={`grant-deadline-${g.id}`} hint={hint}
        onSave={(v) => onEdit({ row: g, fields: { deadline: v }, label: `${grantName(g)}: due ${v ?? 'cleared'}` })}
      />
    )
    const amount = (g: GrantProduct) => (
      <TextCell
        label={`Amount for ${grantName(g)}`} value={g.amount_usd == null ? '' : String(g.amount_usd)}
        display={formatUsd(g.amount_usd)} placeholder="$" testId={`grant-amount-${g.id}`} inputMode="numeric"
        onSave={(v) => {
          const n = v === '' ? null : Number(v.replace(/[$,\s]/g, ''))
          onEdit({ row: g, fields: { amount_usd: n }, label: `${grantName(g)}: amount ${n == null ? 'cleared' : formatUsd(n)}` })
        }}
      />
    )
    return [
      {
        key: 'grant', label: 'Grant', width: 'minmax(0, 2fr)', phone: 'title',
        render: (g) => (
          <span className="gl-name">
            <Link to={PATHS.project(g.project_slug)}>{grantName(g)}</Link>
            <span className="gl-sub">{g.kind_label}{g.pi ? ` · ${displayName(g.pi, 'short')}` : ''}</span>
          </span>
        ),
      },
      { key: 'venue', label: 'Venue', width: 'minmax(0, 1fr)', phone: 'line', render: venue, renderPhone: (g) => <Labelled label="Venue">{venue(g)}</Labelled> },
      { key: 'stage', label: 'Stage', width: '124px', phone: 'line', render: stage, renderPhone: (g) => <Labelled label="Stage">{stage(g)}</Labelled> },
      {
        key: 'start', label: 'Start', width: '100px', phone: 'line',
        render: (g) => g.kind === 'honor' ? <span className="gl-none">—</span> : start(g, g.kind === 'award' ? undefined : 'proposed'),
        renderPhone: (g) => g.kind === 'honor' ? null : <Labelled label={g.kind === 'award' ? 'Start' : 'Proposed start'}>{start(g)}</Labelled>,
      },
      {
        key: 'end', label: 'End / due', width: '100px', phone: 'line',
        render: (g) => end(g, 'due'),
        renderPhone: (g) => <Labelled label={g.kind === 'award' ? 'End' : 'Due'}>{end(g)}</Labelled>,
      },
      {
        key: 'amount', label: 'Amount', width: '76px', phone: 'line',
        render: (g) => g.kind === 'award' ? amount(g) : <span className="gl-none" title="Only an award carries an amount">—</span>,
        renderPhone: (g) => g.kind === 'award' ? <Labelled label="Amount">{amount(g)}</Labelled> : null,
      },
    ]
  }, [kinds, onEdit])

  return (
    <div data-testid="grant-list">
      <SleekTable columns={columns} className="gl sr-page" narrowBelow={600} ariaLabel="Grants">
        {rows.map((g) => (
          <SleekRow key={g.id} row={g} data={{ testid: `grant-row-${g.id}`, bucket: g.bucket }} />
        ))}
      </SleekTable>
      <style>{CSS}</style>
    </div>
  )
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return <><span className="gl-lab">{label}</span>{children}</>
}

function TextCell({ label, value, display, placeholder, testId, inputMode, onSave }: {
  label: string; value: string; display?: string; placeholder?: string; testId: string
  inputMode?: 'numeric'; onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (!editing) {
    return (
      <button type="button" className="gl-cell" aria-label={`${label}: ${display || value || 'empty'}. Edit`} data-testid={testId}
        onClick={() => { setDraft(value); setEditing(true) }}>
        {display || value || <span className="gl-none">{placeholder ?? '—'}</span>}
      </button>
    )
  }
  const done = (save: boolean) => {
    setEditing(false)
    const v = draft.trim()
    if (save && v !== value) onSave(v)
  }
  return (
    <input
      className="gl-input" aria-label={label} value={draft} placeholder={placeholder} inputMode={inputMode} autoFocus
      data-testid={`${testId}-input`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false) }}
    />
  )
}

/** A grant date: the shared date picker (presets, month and year jumps,
 *  Clear), the one every other Hub date uses. It writes only when a day,
 *  preset or Clear is picked, so nothing saves mid-typing. The trigger shows
 *  the year, because grant dates sit years apart. */
function DateCell({ label, value, hint, testId, onSave }: {
  label: string; value: string | null; hint?: string; testId: string; onSave: (v: string | null) => void
}) {
  return (
    <span className="gl-date" data-testid={testId}>
      <InlineDatePicker
        value={value}
        onChange={onSave}
        label={label}
        display={<span className={value ? 'gl-date-val' : 'gl-date-val gl-date-empty'}>{value ? formatMediumDate(value) : 'Set date'}</span>}
      />
      {hint && value && <span className="gl-hint">{hint}</span>}
    </span>
  )
}

const CSS = `
/* No row click to promise: the row's cells are what edit. */
.gl .sr-row { cursor: default; }
/* Two-line cells: rows must not touch, and a long subtitle stays on one line. */
.gl:not(.sr-narrow) .sr-row { height: auto; min-height: 48px; }
.gl:not(.sr-narrow) .gl-sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gl .sr-row[data-bucket="ended"] { opacity: .7; }
.gl-name { display: flex; flex-direction: column; min-width: 0; }
.gl-name a { color: var(--sk-t1); font-size: 13px; font-weight: 500; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gl-name a:hover { text-decoration: underline; text-underline-offset: 2px; }
.gl-sub { font-size: 11px; font-weight: 400; color: var(--sk-t3); }
.gl-cell { background: none; border: 0; padding: 2px 4px; margin-left: -4px; border-radius: 6px; color: var(--sk-t2); font-size: 13px; cursor: text; text-align: left; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gl-cell:hover { background: var(--sk-panel); }
.gl-input { width: 100%; font-size: 13px; padding: 2px 6px; border-radius: 6px; border: 1px solid var(--sk-line2); background: var(--sk-card); color: var(--sk-t1); }
.gl-date { display: inline-flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.gl-date .sr-trig { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px; min-height: 24px; padding: 2px 6px; margin-left: -6px; border-radius: 6px; cursor: pointer; }
.gl-date .sr-trig:hover, .gl-date .sr-trig[aria-expanded="true"] { background: var(--sk-panel); }
.gl-date .sr-trig:focus-visible { outline: 2px solid var(--job-accent); outline-offset: 1px; }
.gl-date .sr-car { color: var(--sk-t3); font-size: 11px; }
.gl-date-val { font-size: 13px; color: var(--sk-t2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.gl-date-empty { color: var(--sk-t3); }
.gl-hint { font-size: 10px; color: var(--sk-t3); padding-left: 7px; line-height: 1; }
.gl-none { color: var(--sk-t3); }
.gl.sr-narrow .sr-row.sr-nolead { grid-template-columns: minmax(0, 1fr); padding: 10px 8px; }
.gl.sr-narrow .sr-ph-trail { display: none; }
.gl.sr-narrow .gl-name a { white-space: normal; font-size: 13.5px; font-weight: 600; }
.gl.sr-narrow .gl-sub { font-size: 11.5px; margin-top: 1px; }
.gl.sr-narrow .sr-ph-l { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin-top: 8px; }
.gl.sr-narrow .sr-ph-l > .sr-c { display: block; min-width: 0; }
.gl-lab { display: block; font-size: 11px; color: var(--sk-t3); line-height: 1.3; }
.gl.sr-narrow .gl-cell { margin-left: 0; padding-left: 0; padding-right: 0; }
.sr.gl.sr-narrow .sr-car { display: inline; }
`
