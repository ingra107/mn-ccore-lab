// The Manuscripts List view on the shared sleek row (components/table/SleekRows,
// Nick's 2026-10-10 mock; every-page evaluation item 39). One line per
// manuscript, stage group headers kept while the list is in stage order.
//
// Kept from the gridded list: header sort on Title / Status / Stage / PI /
// Group / Days, inline edit on Status / Stage / PI / Group (caret on hover),
// the open-task count, stalled days in orange, j/k focus, the stage tally
// under the rows, and a click anywhere on the row opening the project. New:
// Enter opens the j/k row, Esc clears it, and the title is a real link so
// ctrl/middle-click opens a new tab. Dropped on purpose: the category icon
// before titles (the category is the Group column and the filter pills).

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SleekTable, SleekRow, type SleekColumn, type SleekSort } from '../../components/table/SleekRows'
import InlineSelect from '../../components/InlineSelect'
import { Face, Person } from '../../components/today/skin'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { PATHS } from '../../constants/paths'
import type { Project } from '../../data/types'

type Opt = { value: string; label: string; color?: string }

/** A project as a manuscript row: `stage` and `stage_entered_at` are its HOME
 *  MANUSCRIPT PRODUCT's (ManuscriptsPage builds them from the products read).
 *  A Project carries no stage of its own (contract phase step 1). */
export type ManuscriptRow = Project & { stage: string }

export interface ManuscriptsListProps {
  /** Already filtered and sorted by the page. */
  manuscripts: ManuscriptRow[]
  sort: SleekSort
  onSort: (next: SleekSort) => void
  stages: readonly string[]
  stageLabels: Record<string, string>
  statusOptions: Opt[]
  piOptions: Opt[]
  categoryOptions: Opt[]
  categoryLabel: Record<string, string>
  taskCounts: Map<string, number>
  daysInStage: (p: ManuscriptRow) => number
  stalledThresholdDays: number
  onFieldChange: (slug: string, field: string, value: unknown, prev: unknown) => void
  onStageChange: (slug: string, next: string, prev: string | null | undefined) => void
  /** Keyboard off (a modal is open). */
  keyboardDisabled?: boolean
}

// The status word stays gray; the dot carries the state (the task status pill's classes).
const STATUS_DOT: Record<string, string> = { active: 'sr-ip', waiting_external: 'sr-wt', blocked: 'sr-bl', done: '' }
const STALLED: CSSProperties = { color: 'var(--job-stale)', fontWeight: 600 }

export function ManuscriptsList({
  manuscripts, sort, onSort, stages, stageLabels, statusOptions, piOptions, categoryOptions, categoryLabel,
  taskCounts, daysInStage, stalledThresholdDays, onFieldChange, onStageChange,
  keyboardDisabled = false,
}: ManuscriptsListProps) {
  const navigate = useNavigate()
  // The j/k row. -1 = none. The page remounts the list on a filter change.
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const open = useCallback((slug: string) => navigate(PATHS.project(slug)), [navigate])

  useListKeyboardNav({
    itemCount: manuscripts.length,
    focusedIndex,
    setFocusedIndex,
    onEnter: () => { const p = manuscripts[focusedIndex]; if (p) open(p.slug) },
    // Only claim Escape while a row holds the cursor; otherwise it belongs to others.
    onEscape: focusedIndex >= 0 ? () => setFocusedIndex(-1) : undefined,
    disabled: keyboardDisabled,
  })

  // Keep the j/k row on screen.
  useEffect(() => {
    const p = manuscripts[focusedIndex]
    if (!p) return
    document.querySelector(`[data-slug="${CSS.escape(p.slug)}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [focusedIndex, manuscripts])

  const stageOptions = useMemo(() => stages.map((s) => ({ value: s, label: stageLabels[s] ?? s })), [stages, stageLabels])
  const statusLabel = useMemo(() => Object.fromEntries(statusOptions.map((o) => [o.value, o.label])), [statusOptions])

  const columns = useMemo<SleekColumn<ManuscriptRow>[]>(() => {
    const stalledDays = (p: ManuscriptRow) => {
      const d = daysInStage(p)
      return p.stage !== 'published' && d > stalledThresholdDays ? d : 0
    }
    return [
      {
        key: 'title', label: 'Title', width: 'minmax(0,1fr)', sortable: true, phone: 'title',
        render: (p) => {
          const tc = taskCounts.get(p.slug) || 0
          return (
            <div className="sr-tt">
              {/* A real link: ctrl/middle-click opens a tab. A plain click is the row's. */}
              <Link to={PATHS.project(p.slug)} className="sr-x sr-open" style={{ color: 'inherit' }} title={p.title} onClick={(e) => e.stopPropagation()}>
                {p.title}
              </Link>
              {tc > 0 && <span className="tk-tag tk-n" title={`${tc} open task${tc === 1 ? '' : 's'}`}>{tc} task{tc === 1 ? '' : 's'}</span>}
            </div>
          )
        },
      },
      {
        // Phone keeps status on the line: it is the field most often edited from the list.
        key: 'status', label: 'Status', width: '104px', sortable: true, interactive: true, phone: 'line',
        render: (p) => {
          const v = p.status || 'active'
          return (
            <InlineSelect
              value={v}
              options={statusOptions}
              onChange={(next) => onFieldChange(p.slug, 'status', next, p.status)}
              display={<span className={`tk-pill ${STATUS_DOT[v] ?? ''}`}><i />{statusLabel[v] ?? v}</span>}
            />
          )
        },
      },
      {
        key: 'stage', label: 'Stage', width: '104px', sortable: true, interactive: true, phone: 'line',
        render: (p) => (
          <InlineSelect
            value={p.stage || 'idea'}
            options={stageOptions}
            onChange={(next) => onStageChange(p.slug, next, p.stage)}
            display={<span className="sr-m sr-hi">{stageLabels[p.stage ?? ''] ?? p.stage ?? 'Idea'}</span>}
          />
        ),
      },
      {
        // Badge + first name (rules-ui-design 12, 18). A null PI reads
        // "Unassigned" with no face (evaluation item 41).
        key: 'pi', label: 'PI', width: '128px', sortable: true, interactive: true, minTableWidth: 720, phone: 'trail',
        render: (p) => (
          <InlineSelect
            value={p.pi ?? ''}
            options={piOptions}
            onChange={(next) => onFieldChange(p.slug, 'pi', next, p.pi)}
            display={p.pi
              ? <span className="sr-m sr-hi" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}><Person slug={p.pi} /></span>
              : <span className="sr-m">Unassigned</span>}
          />
        ),
        renderPhone: (p) => (p.pi ? <Face slug={p.pi} lg /> : null),
      },
      {
        key: 'category', label: 'Group', width: '84px', sortable: true, interactive: true, minTableWidth: 860, phone: 'line',
        render: (p) => (
          <InlineSelect
            value={p.category || 'MNCCORE'}
            options={categoryOptions}
            onChange={(next) => onFieldChange(p.slug, 'category', next, p.category)}
            display={<span className="sr-m">{categoryLabel[p.category ?? ''] ?? p.category ?? 'MNCCORE'}</span>}
          />
        ),
      },
      {
        key: 'days_in_stage', label: 'Days', width: '52px', sortable: true, align: 'end', phone: 'line',
        render: (p) => {
          const d = daysInStage(p)
          const stalled = stalledDays(p) > 0
          return (
            <span className="sr-m" style={stalled ? STALLED : undefined} title={stalled ? `Stalled: ${d}d in this stage` : `${d}d in stage`}>
              {d > 0 ? `${d}d` : '—'}
            </span>
          )
        },
        // Phone: only a stalled count earns the space.
        renderPhone: (p) => {
          const d = stalledDays(p)
          return d > 0 ? <span className="sr-m" style={STALLED} title={`Stalled: ${d}d in this stage`}>{d}d</span> : null
        },
      },
    ]
  }, [taskCounts, statusOptions, statusLabel, stageOptions, stageLabels, piOptions, categoryOptions, categoryLabel, daysInStage, stalledThresholdDays, onFieldChange, onStageChange])

  // Stage headers while the list is in stage order (the default, or a Stage sort).
  const grouped = !sort || sort.key === 'stage'
  const groups = useMemo(() => {
    const out: { stage: string; rows: { p: ManuscriptRow; i: number }[] }[] = []
    manuscripts.forEach((p, i) => {
      const stage = grouped ? (p.stage ?? '') : ''
      const last = out[out.length - 1]
      if (last && last.stage === stage) last.rows.push({ p, i })
      else out.push({ stage, rows: [{ p, i }] })
    })
    return out
  }, [manuscripts, grouped])

  const row = ({ p, i }: { p: ManuscriptRow; i: number }) => (
    <SleekRow
      key={p.slug}
      row={p}
      data={{ slug: p.slug }}
      cursor={i === focusedIndex}
      onClick={() => { setFocusedIndex(i); open(p.slug) }}
    />
  )

  return (
    <SleekTable columns={columns} sort={sort} onSort={onSort} defaultSortLabel="By stage">
      {grouped
        ? groups.map((g, gi) => (
            <div key={g.stage || '_'} role="rowgroup" aria-label={stageLabels[g.stage] ?? g.stage}>
              <div className="sr-grp-h" aria-hidden="true" style={{ cursor: 'default', paddingTop: gi === 0 ? 4 : 18 }}>
                <h3>{stageLabels[g.stage] ?? (g.stage || 'No stage')}</h3>
                <span className="sr-n">{g.rows.length}</span>
              </div>
              {g.rows.map(row)}
            </div>
          ))
        : manuscripts.map((p, i) => row({ p, i }))}
    </SleekTable>
  )
}
