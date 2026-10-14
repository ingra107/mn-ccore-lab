import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { ProductLadder } from '../project/ProductStageCell'
import type { ProductKind, ProductRow } from '../../lib/products'
import { formatUsd, grantName, type GrantProduct } from '../../lib/grants'
import { displayName } from '../../lib/nameUtils'
import type { GrantTermFields } from '../../hooks/useGrantProducts'

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
  return (
    <div className="gl" role="table" aria-label="Grants" data-testid="grant-list">
      <div role="row" className="gl-row gl-head">
        <span role="columnheader">Grant</span>
        <span role="columnheader">Venue</span>
        <span role="columnheader">Stage</span>
        <span role="columnheader">Start</span>
        <span role="columnheader">End / due</span>
        <span role="columnheader">Amount</span>
      </div>
      {rows.map((g) => (
        <div role="row" className="gl-row" key={g.id} data-testid={`grant-row-${g.id}`} data-bucket={g.bucket}>
          <span role="cell" className="gl-name">
            <Link to={PATHS.project(g.project_slug)}>{grantName(g)}</Link>
            <span className="gl-sub">{g.kind_label}{g.pi ? ` · ${displayName(g.pi, 'short')}` : ''}</span>
          </span>
          <span role="cell">
            <TextCell
              label={`Venue for ${grantName(g)}`} value={g.venue ?? ''} placeholder="NHLBI R01" testId={`grant-venue-${g.id}`}
              onSave={(v) => onEdit({ row: g, fields: { venue: v || null }, label: `${grantName(g)}: venue ${v || 'cleared'}` })}
            />
          </span>
          <span role="cell">
            <ProductLadder slug={g.project_slug} product={g as unknown as ProductRow} kinds={kinds} testId={`grant-stage-${g.id}`} />
          </span>
          <span role="cell">
            {g.kind === 'honor' ? <span className="gl-none">—</span> : (
              <DateCell
                label={`${g.kind === 'award' ? 'Start' : 'Proposed start'} for ${grantName(g)}`} value={g.period_start} testId={`grant-start-${g.id}`}
                hint={g.kind === 'award' ? undefined : 'proposed'}
                onSave={(v) => onEdit({ row: g, fields: { period_start: v }, label: `${grantName(g)}: start ${v ?? 'cleared'}` })}
              />
            )}
          </span>
          <span role="cell">
            {g.kind === 'award' ? (
              <DateCell
                label={`End for ${grantName(g)}`} value={g.period_end} testId={`grant-end-${g.id}`}
                onSave={(v) => onEdit({ row: g, fields: { period_end: v }, label: `${grantName(g)}: end ${v ?? 'cleared'}` })}
              />
            ) : (
              <DateCell
                label={`Due date for ${grantName(g)}`} value={g.deadline} testId={`grant-deadline-${g.id}`} hint="due"
                onSave={(v) => onEdit({ row: g, fields: { deadline: v }, label: `${grantName(g)}: due ${v ?? 'cleared'}` })}
              />
            )}
          </span>
          <span role="cell">
            {g.kind === 'award' ? (
              <TextCell
                label={`Amount for ${grantName(g)}`} value={g.amount_usd == null ? '' : String(g.amount_usd)}
                display={formatUsd(g.amount_usd)} placeholder="$" testId={`grant-amount-${g.id}`} inputMode="numeric"
                onSave={(v) => {
                  const n = v === '' ? null : Number(v.replace(/[$,\s]/g, ''))
                  onEdit({ row: g, fields: { amount_usd: n }, label: `${grantName(g)}: amount ${n == null ? 'cleared' : formatUsd(n)}` })
                }}
              />
            ) : <span className="gl-none" title="Only an award carries an amount">—</span>}
          </span>
        </div>
      ))}
      <style>{CSS}</style>
    </div>
  )
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

/** A date saves when you leave the field or press Enter, never per keystroke:
 *  a native date input fires change for each typed year digit (0002, 0020...),
 *  and each of those would be a write and an undo toast. Escape puts it back. */
function DateCell({ label, value, hint, testId, onSave }: {
  label: string; value: string | null; hint?: string; testId: string; onSave: (v: string | null) => void
}) {
  const [draft, setDraft] = useState(value ?? '')
  const [shown, setShown] = useState(value)
  if (shown !== value) { setShown(value); setDraft(value ?? '') }
  const commit = () => {
    const v = draft || null
    if (v !== value) onSave(v)
  }
  return (
    <span className="gl-date">
      <input
        type="date" className="gl-input gl-date-input" aria-label={label} value={draft} data-testid={testId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') setDraft(value ?? '')
        }}
      />
      {hint && value && <span className="gl-hint">{hint}</span>}
    </span>
  )
}

const CSS = `
.gl { display: flex; flex-direction: column; }
.gl-row {
  display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) 170px 150px 150px 96px; gap: 10px;
  align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--sk-line2); font-size: 13px;
}
.gl-head { font-size: 11px; color: var(--sk-t3); padding-top: 0; }
.gl-name { display: flex; flex-direction: column; min-width: 0; }
.gl-name a { color: var(--sk-t1); font-weight: 500; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gl-name a:hover { text-decoration: underline; text-underline-offset: 2px; }
.gl-sub { font-size: 11px; color: var(--sk-t3); }
.gl-row[data-bucket="ended"] { opacity: .7; }
.gl-cell { background: none; border: 0; padding: 2px 4px; margin-left: -4px; border-radius: 6px; color: var(--sk-t2); font-size: 13px; cursor: text; text-align: left; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gl-cell:hover { background: var(--sk-panel); }
.gl-input { width: 100%; font-size: 13px; padding: 2px 6px; border-radius: 6px; border: 1px solid var(--sk-line2); background: var(--sk-card); color: var(--sk-t1); }
.gl-date { display: inline-flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.gl-date-input { width: 132px; border-color: transparent; background: transparent; color: var(--sk-t2); }
.gl-date-input:hover, .gl-date-input:focus { border-color: var(--sk-line2); background: var(--sk-card); }
.gl-hint { font-size: 10px; color: var(--sk-t3); padding-left: 7px; line-height: 1; }
.gl-none { color: var(--sk-t3); }
@media (max-width: 760px) {
  .gl-head { display: none; }
  .gl-row { grid-template-columns: minmax(0, 1fr) auto; row-gap: 4px; }
  .gl-row > [role="cell"]:nth-child(1) { grid-column: 1 / -1; }
  .gl-row > [role="cell"]:nth-child(2) { grid-column: 1; }
  .gl-row > [role="cell"]:nth-child(3) { grid-column: 2; grid-row: 2; justify-self: end; }
  .gl-row > [role="cell"]:nth-child(4), .gl-row > [role="cell"]:nth-child(5) { grid-column: auto; }
  .gl-row > [role="cell"]:nth-child(6) { grid-column: 1 / -1; }
}
/* index.css forces 16px on every phone input (the iOS no-zoom rule), and at
   16px a blank date input's 'mm/dd/yyyy' ran under the calendar icon in 132px.
   On a phone the field takes its own natural width, so it always fits. The
   floor is for iOS WebKit, where an empty date input has almost no intrinsic
   width and would shrink to a sliver with nothing to tap. */
@media (max-width: 768px) {
  .gl-date-input { width: auto; min-width: min(9.5em, 100%); max-width: 100%; }
}
`
