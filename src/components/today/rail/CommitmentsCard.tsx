// CommitmentsCard -- the PI's open commitments to other people, overdue first.
// Moved here from the My Items page (the page is gone; Nick 2026-10-13, "Fold
// into Today"). Done commitments fold under a "Show N done" row, newest first.
//
// PI only. The commitments table has no owner column (api/schema-v5.sql) and
// /api/commitments returns every row the viewer's project and task scope
// allows, so a member would see the PI's promises to named people. The gate
// sits here, ahead of the fetch, so a member's browser never requests them.

import { useMemo, useState } from 'react'
import { CollapseChevron } from '../SectionCollapseToggle'
import { collapseToggleProps } from '../collapseToggleProps'
import { useCommitments, type CommitmentRow } from '../../../hooks/useCommitments'
import { useAuth } from '../../../hooks/useAuth'
import { formatShortDate, isOverdue } from '../../../lib/dateUtils'

function newestDone(a: CommitmentRow, b: CommitmentRow) {
  return (b.completed_at ?? '').localeCompare(a.completed_at ?? '')
}

function byDue(a: CommitmentRow, b: CommitmentRow) {
  const ao = isOverdue(a.due_date)
  const bo = isOverdue(b.due_date)
  if (ao !== bo) return ao ? -1 : 1
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
  if (a.due_date) return -1
  if (b.due_date) return 1
  return 0
}

function Row({ c, done }: { c: CommitmentRow; done?: boolean }) {
  const late = !done && isOverdue(c.due_date)
  const source = c.source ? c.source.replace(/^meeting:[ \t]*/i, '') : ''
  return (
    <div className="tk-rli">
      <span className="tk-t" style={done ? { textDecoration: 'line-through', color: 'var(--sk-t3)' } : undefined}>
        {c.commitment}
        <span style={{ display: 'block', fontSize: 11, color: 'var(--sk-t3)' }}>To {c.to_whom}</span>
        {source && <span style={{ display: 'block', fontSize: 11, color: 'var(--sk-t3)' }}>From {source}</span>}
      </span>
      {c.due_date && <span className={late ? 'tk-d tk-o' : 'tk-d'}>{formatShortDate(c.due_date)}</span>}
    </div>
  )
}

function CommitmentsList() {
  const [open, setOpen] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const { data: all = [] } = useCommitments()
  const { openOnes, doneOnes } = useMemo(() => ({
    openOnes: all.filter((c) => c.status !== 'done').sort(byDue),
    doneOnes: all.filter((c) => c.status === 'done').sort(newestDone),
  }), [all])
  if (openOnes.length + doneOnes.length === 0) return null
  return (
    <section className="tk-panel" data-b2-commitments>
      <div {...collapseToggleProps(open, () => setOpen((o) => !o), 'Commitments')} className="tk-ph tk-clk">
        <div className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>Commitments</h3>
          <span className="tk-cnt">{openOnes.length}</span>
        </div>
      </div>
      {open && (
        <>
          {openOnes.length === 0 && <div style={{ fontSize: 12, color: 'var(--sk-t3)' }}>All commitments fulfilled.</div>}
          {openOnes.map((c) => <Row key={c.id} c={c} />)}
          {doneOnes.length > 0 && (
            <>
              <button
                type="button"
                className="tk-rmore"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}
                aria-expanded={showDone}
                onClick={() => setShowDone((s) => !s)}
              >
                {showDone ? 'Hide' : 'Show'} {doneOnes.length} done
              </button>
              {showDone && doneOnes.map((c) => <Row key={c.id} c={c} done />)}
            </>
          )}
        </>
      )}
    </section>
  )
}

export function CommitmentsCard() {
  const { user } = useAuth()
  if (!user.isPi) return null
  return <CommitmentsList />
}
