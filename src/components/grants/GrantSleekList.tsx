// The Grants list on the shared sleek row (components/table/SleekRows,
// rules-ui-design 19; evaluation item 95). One line per grant: title, then
// "K23 · NHLBI", the period dim, a thin teal progress bar, the status (inline
// edit) and the PI's face. A row click or Enter opens the detail under it;
// j/k move the cursor; Esc closes the detail, then clears the cursor.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { SleekTable, SleekRow, type SleekColumn, type SleekSort } from '../table/SleekRows'
import InlineSelect from '../InlineSelect'
import { Face } from '../today/skin'
import { GRANT_STATUS_OPTIONS } from '../../hooks/useGrantTimeline'
import { GRANT_STATUS_DOT, grantAward, grantPeriod, grantProgress, grantStatusOf, monthYear } from '../../lib/grantRows'
import type { GrantTimelineItem, GrantStatus } from '../../hooks/useGrantTimeline'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { formatMediumDate } from '../../lib/dateUtils'
import { fullNameReadable } from '../../lib/personLabel'
import { tealRamp } from '../../lib/tealRamp'

function GrantStatusPill({ status }: { status: GrantStatus }) {
  const label = GRANT_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
  return <span className={`tk-pill ${GRANT_STATUS_DOT[status] ?? ''}`}><i />{label}</span>
}

function Progress({ pct }: { pct: number }) {
  if (pct <= 0) return null
  const n = Math.round(pct)
  return (
    <span className="gr-prog" title={`${n}% through the award period`}>
      {/* Data bar: teal, dim early in the award, bright near its end (tealRamp). */}
      <span className="gr-bar" aria-hidden="true"><i style={{ width: `${n}%`, background: tealRamp(n / 100) }} /></span>
      <span className="sr-m">{n}%</span>
    </span>
  )
}

function Detail({ grant, progress }: { grant: GrantTimelineItem; progress: number }) {
  const field = (label: string, value: ReactNode) => (
    <div>
      <div className="gr-dl">{label}</div>
      <div>{value}</div>
    </div>
  )
  const span = `${grant.start_date ? formatMediumDate(grant.start_date) : '?'} – ${grant.end_date ? formatMediumDate(grant.end_date) : '?'}`
  const bucket = grant.bucket === 'proposed' ? 'Proposed' : grant.bucket === 'ended' ? 'Ended' : 'Active'
  return (
    <div className="gr-detail">
      {field('Full title', grant.title)}
      {field('PI', grant.pi ? <span className="gr-pi"><Face slug={grant.pi} sm />{fullNameReadable(grant.pi)}</span> : '—')}
      {field('Mechanism', grant.mechanism || '—')}
      {field('Agency', grant.agency || '—')}
      {field('Period', span)}
      {field('Status', `${bucket}${progress > 0 ? ` · ${Math.round(progress)}% through period` : ''}`)}
    </div>
  )
}

export function GrantSleekList({ grants, sort, onSort, cursor, setCursor, expandedId, setExpandedId, onStatusChange, keyboardDisabled = false, now: nowProp }: {
  /** Already filtered and sorted. */
  grants: GrantTimelineItem[]
  sort: SleekSort
  onSort: (next: SleekSort) => void
  cursor: number
  setCursor: (i: number | ((prev: number) => number)) => void
  expandedId: string | null
  setExpandedId: (id: string | null) => void
  onStatusChange: (id: string, prev: GrantStatus | null, next: string) => void
  keyboardDisabled?: boolean
  /** Clock for the progress bars; tests pin it. Default: the time of mount. */
  now?: number
}) {
  const [mountedAt] = useState(() => Date.now())
  const now = nowProp ?? mountedAt
  // Keep the cursor on a real row when the list shrinks (a filter change).
  useEffect(() => {
    if (cursor >= grants.length) setCursor(grants.length - 1)
  }, [cursor, grants.length, setCursor])

  useListKeyboardNav({
    itemCount: grants.length,
    focusedIndex: cursor,
    setFocusedIndex: setCursor,
    disabled: keyboardDisabled,
    onEnter: () => {
      const g = grants[cursor]
      if (g) setExpandedId(expandedId === g.id ? null : g.id)
    },
    onEscape: () => {
      if (expandedId) setExpandedId(null)
      else setCursor(-1)
    },
  })

  const columns = useMemo<SleekColumn<GrantTimelineItem>[]>(() => [
    {
      key: 'title', label: 'Title', width: 'minmax(0,1fr)', sortable: true, phone: 'title',
      render: (g) => <div className="sr-tt"><span className="sr-x">{g.title}</span></div>,
    },
    {
      key: 'award', label: 'Award', width: '140px', sortable: true, phone: 'line',
      render: (g) => <span className="tk-cs">{grantAward(g) || '—'}</span>,
      // Phone: one muted line, "K23 · NHLBI · to Jun 2028".
      renderPhone: (g) => <span className="tk-cs">{[grantAward(g), g.end_date ? `to ${monthYear(g.end_date)}` : ''].filter(Boolean).join(' · ')}</span>,
    },
    {
      key: 'period', label: 'Period', width: '148px', sortable: true,
      render: (g) => <span className="sr-m">{grantPeriod(g)}</span>,
    },
    {
      key: 'progress', width: '76px', minTableWidth: 860,
      render: (g) => <Progress pct={grantProgress(g, now)} />,
    },
    {
      key: 'status', label: 'Status', width: '132px', sortable: true, interactive: true, phone: 'line',
      render: (g) => (
        <InlineSelect
          value={grantStatusOf(g)}
          options={GRANT_STATUS_OPTIONS}
          onChange={(next) => onStatusChange(g.id, (g.status as GrantStatus | null) ?? null, next)}
          display={<GrantStatusPill status={grantStatusOf(g)} />}
        />
      ),
    },
    {
      key: 'pi', label: 'PI', width: '40px', sortable: true, phone: 'trail',
      render: (g) => (g.pi ? <Face slug={g.pi} /> : <span className="sr-m">—</span>),
      renderPhone: (g) => (g.pi ? <Face slug={g.pi} lg /> : null),
    },
  ], [onStatusChange, now])

  return (
    <SleekTable columns={columns} sort={sort} onSort={onSort} defaultSortLabel="Start date" className="gr-list">
      {grants.map((g, i) => {
        const open = expandedId === g.id
        return (
          <SleekRow
            key={g.id}
            row={g}
            data={{ 'grant-id': g.id }}
            cursor={i === cursor}
            expanded={open}
            onClick={() => { setCursor(i); setExpandedId(open ? null : g.id) }}
          >
            {open && <Detail grant={g} progress={grantProgress(g, now)} />}
          </SleekRow>
        )
      })}
    </SleekTable>
  )
}
