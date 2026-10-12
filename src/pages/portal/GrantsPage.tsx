import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Banknote, Diamond, List, GanttChartSquare, Telescope, Plus, ClipboardList, X, Check, Wallet } from 'lucide-react'
import FilterLinks from '../../components/ui/FilterLinks'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import InlineSelect from '../../components/InlineSelect'
import Field from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { TableControls } from '../../components/table'
import { QueryErrorNote } from '../../components/QueryErrorNote'
import GrantList, { type TermEdit } from '../../components/grants/GrantList'
import GrantGantt, { type GanttMove } from '../../components/grants/GrantGantt'
import { useGrantProducts, useSetGrantTerms, useAddGrantMilestone, GRANTS_KEY } from '../../hooks/useGrantProducts'
import { useSimilarGrants } from '../../hooks/useApiData'
import { useUpdateTaskStatus } from '../../hooks/useMutations'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'
import { localDateKey } from '../../lib/dateUtils'
import { formatUsd, grantName, mechanismOf, milestoneDate, type GrantProduct } from '../../lib/grants'

// The Grants page reads products (Nick 2026-10-12: "we can keep grants
// separate so use the current grants page to build out and make sure it reads
// the right stuff"). A row is a grant_application, award or honor product
// (api/routes/grants.ts); its stage is its kind's ladder, its dates and money
// are schema-v128's award terms, its post-award milestones are milestone
// tasks. The NIH RePORTER search is unchanged (it calls RePORTER live).

type ViewMode = 'list' | 'timeline'
type FilterMode = 'all' | 'active' | 'proposed' | 'ended'
type Tab = 'grants' | 'post-award' | 'landscape'

export default function GrantsPage() {
  const { data, isLoading, isError, refetch } = useGrantProducts()
  const rows = useMemo(() => data?.data ?? [], [data])
  const kinds = useMemo(() => data?.kinds ?? [], [data])
  const [view, setView] = useState<ViewMode>('list')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [activeTab, setActiveTab] = useState<Tab>('grants')
  const [searchKeywords, setSearchKeywords] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [showAddMilestone, setShowAddMilestone] = useState(false)
  const similarGrants = useSimilarGrants(activeSearch)
  const setTerms = useSetGrantTerms()
  const today = localDateKey(new Date())

  const counts = useMemo(() => ({
    active: rows.filter((g) => g.bucket === 'active').length,
    proposed: rows.filter((g) => g.bucket === 'proposed').length,
    ended: rows.filter((g) => g.bucket === 'ended').length,
  }), [rows])
  const shown = useMemo(() => (filter === 'all' ? rows : rows.filter((g) => g.bucket === filter)), [rows, filter])
  // The timeline plots what is live; an ended grant stays in the list.
  const plotted = useMemo(() => shown.filter((g) => g.bucket !== 'ended'), [shown])
  const activeFunding = useMemo(
    () => rows.filter((g) => g.bucket === 'active').reduce((s, g) => s + (g.amount_usd ?? 0), 0),
    [rows],
  )
  const mechanisms = useMemo(
    () => [...new Set(rows.filter((g) => g.bucket === 'active').map((g) => mechanismOf(g.venue)).filter(Boolean))].sort(),
    [rows],
  )

  const write = (row: GrantProduct, fields: TermEdit['fields'], label: string) => {
    const keys = Object.keys(fields) as (keyof TermEdit['fields'])[]
    setTerms.mutate({
      slug: row.project_slug, productId: row.id, fields, label,
      seen: { seq: row.seq, values: Object.fromEntries(keys.map((k) => [k, row[k] ?? null])) },
    })
  }
  const onEdit = (e: TermEdit) => write(e.row, e.fields, e.label)
  const onMove = (m: GanttMove) => write(m.row, m.fields,
    `${grantName(m.row)} ${m.row.kind === 'award' ? 'now runs' : 'proposed start'} ${m.fields.period_start}${m.fields.period_end ? ` to ${m.fields.period_end}` : ''}`)

  // The redesign's filter links (main fda4d934, wave 1), not bordered pills.
  const filterPills = (
    <FilterLinks
      ariaLabel="Grant status"
      value={filter}
      onChange={setFilter}
      options={[
        { value: 'all', label: 'All' },
        { value: 'active', label: 'Active' },
        { value: 'proposed', label: 'Proposed' },
        { value: 'ended', label: 'Ended' },
      ] satisfies { value: FilterMode; label: string }[]}
    />
  )

  const shownCount = view === 'timeline' ? plotted.length : shown.length

  return (
    <div className="content-container">
      <PageHeader
        title="Grants & Funding"
        subtitle={`${counts.active} active, ${counts.proposed} proposed${counts.ended > 0 ? `, ${counts.ended} ended` : ''}`}
      >
        <TableControls
          views={[
            { key: 'list', icon: <List {...ICON_PROPS} size={14} />, label: 'List' },
            { key: 'timeline', icon: <GanttChartSquare {...ICON_PROPS} size={14} />, label: 'Timeline' },
          ]}
          activeView={view}
          onViewChange={(v) => setView(v as ViewMode)}
          filters={filterPills}
          count={shownCount}
          countLabel={shownCount === 1 ? 'grant' : 'grants'}
        />
      </PageHeader>

      <div className="flex gap-1 border-b mb-4" style={{ borderColor: 'var(--border-subtle)' }} role="tablist" aria-label="Grants sections">
        {([
          { key: 'grants', label: 'My Grants' },
          { key: 'post-award', label: 'Post-Award' },
          { key: 'landscape', label: 'NIH RePORTER' },
        ] as const).map((tab) => {
          const on = activeTab === tab.key
          return (
            <button key={tab.key} role="tab" aria-selected={on ? 'true' : 'false'} onClick={() => setActiveTab(tab.key)}
              className="px-3 py-2 text-sm transition-colors touch-tall"
              style={{
                color: on ? 'var(--job-accent)' : 'var(--slate)', borderBottom: `2px solid ${on ? 'var(--job-accent)' : 'transparent'}`,
                background: 'none', cursor: 'pointer', marginBottom: '-1px', fontWeight: on ? 'var(--weight-ui, 500)' : 400,
              }}
            >{tab.label}</button>
          )
        })}
      </div>

      {isError && <QueryErrorNote label="grants" onRetry={() => { void refetch() }} />}
      {isLoading && <TableSkeleton rows={4} cols={6} />}

      {activeTab === 'grants' && !isLoading && (
        <>
          {view === 'list' && (shown.length === 0 ? (
            <EmptyState icon={<Wallet size={40} />} title="No grants here"
              subtitle="Grant applications, awards and honors show up here: add one as a product on its project page." />
          ) : (
            <>
              <GrantList rows={shown} kinds={kinds} onEdit={onEdit} />
              <div className="mt-2 px-4 py-2 text-xs flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--slate)', opacity: 0.85 }}>
                {activeFunding > 0 && (
                  <span className="flex items-center gap-1" data-testid="grant-funding-total">
                    <Banknote {...ICON_PROPS} size={11} /> {formatUsd(activeFunding)} active funding
                  </span>
                )}
                {mechanisms.length > 0 && <span>{activeFunding > 0 ? '· ' : ''}Active mechanisms: {mechanisms.join(', ')}</span>}
              </div>
            </>
          ))}
          {view === 'timeline' && (
            <div className="mt-2 rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
              <GrantGantt rows={plotted} today={today} onMove={onMove} />
            </div>
          )}
        </>
      )}

      {activeTab === 'post-award' && !isLoading && (
        <PostAward rows={rows} today={today} onAdd={() => setShowAddMilestone(true)} />
      )}

      {activeTab === 'landscape' && (
        <div className="mt-2 rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Telescope {...ICON_PROPS} size={16} style={{ color: 'var(--slate)' }} />
            <h3 style={{ fontWeight: 500, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>Grant Landscape (NIH RePORTER)</h3>
          </div>
          <div className="flex gap-2 mb-4">
            <input
              type="text" placeholder="Search keywords (e.g., critical care, mechanical ventilation, ARDS)" aria-label="RePORTER keywords"
              value={searchKeywords} onChange={(e) => setSearchKeywords(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setActiveSearch(searchKeywords) }}
              style={{ flex: 1, padding: 'var(--sp-sm) var(--sp-md)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', fontSize: 'var(--value-size)', background: 'var(--cream)', color: 'var(--ink)' }}
            />
            <button type="button" onClick={() => setActiveSearch(searchKeywords)}
              style={{ background: 'var(--job-accent)', color: 'var(--sk-card)', border: 'none', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-sm) var(--sp-lg)', fontSize: 'var(--value-size)', fontWeight: 600, cursor: 'pointer' }}
            >Search</button>
          </div>
          {similarGrants.isLoading && <p className="text-center py-6" style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 0.85 }}>Searching NIH RePORTER...</p>}
          {similarGrants.isError && !similarGrants.isLoading && (
            <div className="text-center py-6"><QueryErrorNote label="grant search" onRetry={() => similarGrants.refetch()} /></div>
          )}
          {similarGrants.data?.data?.map((grant) => (
            <div key={grant.project_num} className="p-3 rounded-lg mb-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p style={{ fontSize: 'var(--value-size)', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, margin: 0 }}>{grant.title}</p>
                  <span style={{ fontSize: '10px', color: 'var(--slate)' }}>
                    {grant.project_num} &middot; {grant.pi} &middot; {grant.organization} &middot; FY{grant.fiscal_year}
                  </span>
                </div>
                {grant.award_amount > 0 && (
                  <span style={{ fontSize: 'var(--label-size)', color: 'var(--ink)', whiteSpace: 'nowrap' }}>${(grant.award_amount / 1000).toFixed(0)}K</span>
                )}
              </div>
              {grant.abstract && (
                <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.85, marginTop: '4px', lineHeight: 1.4, marginBottom: 0 }}>{grant.abstract}...</p>
              )}
            </div>
          ))}
          {similarGrants.data && similarGrants.data.total > 0 && !similarGrants.isLoading && (
            <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', marginTop: '8px' }}>
              Showing {similarGrants.data.data.length} of {similarGrants.data.total.toLocaleString()} results
            </p>
          )}
          {activeSearch && similarGrants.data?.data?.length === 0 && !similarGrants.isLoading && (
            <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 0.85, textAlign: 'center', padding: 'var(--sp-lg) 0' }}>
              No funded grants found for "{activeSearch}"
            </p>
          )}
        </div>
      )}

      <AnimatePresence>
        {showAddMilestone && <AddMilestoneModal rows={rows} onClose={() => setShowAddMilestone(false)} />}
      </AnimatePresence>
    </div>
  )
}

// ── Post-award milestones: milestone tasks on grant products ────────────────

function PostAward({ rows, today, onAdd }: { rows: GrantProduct[]; today: string; onAdd: () => void }) {
  const qc = useQueryClient()
  const setStatus = useUpdateTaskStatus()
  const items = useMemo(() => rows
    .flatMap((g) => g.milestones.map((m) => ({ m, g, date: milestoneDate(m) })))
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')), [rows])
  const overdue = items.filter((x) => !x.m.completed && x.date && x.date < today).length

  return (
    <div className="mt-2 rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }} data-testid="post-award">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClipboardList {...ICON_PROPS} size={14} style={{ color: 'var(--slate)' }} />
          <h3 className="text-sm font-normal" style={{ color: 'var(--ink)', margin: 0 }}>Post-Award Milestones</h3>
          {overdue > 0 && <span style={{ fontSize: 11, color: 'var(--job-overdue)' }}>{overdue} overdue</span>}
        </div>
        <Button variant="primary" onClick={onAdd} style={{ gap: '0.25rem', padding: '4px 10px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 500 }}
          className="flex items-center" data-testid="add-milestone">
          <Plus {...ICON_PROPS} size={12} /> Add Milestone
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-center py-4" style={{ fontSize: 12, color: 'var(--slate)', opacity: 0.85 }}>
          No post-award milestones. Add progress reports, continuing reviews, NCE deadlines and budget periods.
        </p>
      ) : items.map(({ m, g, date }) => (
        <div key={m.id} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)', fontSize: 13, opacity: m.completed ? 0.6 : 1 }}
          data-testid={`milestone-${m.id}`}>
          <input type="checkbox" aria-label={`${m.title} done`} checked={!!m.completed}
            onChange={(e) => setStatus.mutate({ id: m.id, status: e.target.checked ? 'done' : 'todo' }, {
              onSettled: () => qc.invalidateQueries({ queryKey: GRANTS_KEY }),
            })} />
          <Diamond {...ICON_PROPS} size={12} style={{ color: 'var(--job-milestone)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, color: 'var(--ink)' }}>{m.title}</span>
          <Link to={PATHS.project(g.project_slug)} style={{ color: 'var(--slate)', fontSize: 12 }}>{grantName(g)}</Link>
          <span style={{ width: 96, textAlign: 'right', color: !m.completed && date && date < today ? 'var(--job-overdue)' : 'var(--slate)', fontSize: 12 }}>
            {date ?? '—'}{m.deadline && m.due_date && m.deadline !== m.due_date ? ` (hard ${m.deadline})` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

function AddMilestoneModal({ rows, onClose }: { rows: GrantProduct[]; onClose: () => void }) {
  const add = useAddGrantMilestone()
  const options = rows.filter((g) => g.bucket !== 'ended')
  const [productId, setProductId] = useState(options.find((g) => g.kind === 'award')?.id ?? options[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [hard, setHard] = useState('')
  const row = options.find((g) => g.id === productId)
  const ready = !!row && title.trim() !== '' && (due !== '' || hard !== '')
  const input = { width: '100%', padding: 'var(--sp-sm) var(--sp-md)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', fontSize: 'var(--value-size)', background: 'var(--cream)', color: 'var(--ink)' }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'var(--overlay-medium)', zIndex: 'var(--z-sidebar)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-lg)' }}>
      <motion.div role="dialog" aria-label="Add milestone" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--cream)', borderRadius: 'var(--radius-2xl)', border: '1px solid var(--border-subtle)', padding: 'var(--sp-xl)', width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-card-hover)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Add a milestone</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)' }}>
            <X {...ICON_PROPS} size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Grant" htmlFor="ms-grant" noContainer>
            <InlineSelect id="ms-grant" value={productId} onChange={setProductId} size="md" alwaysShowChevron
              options={options.map((g) => ({ value: g.id, label: `${grantName(g)}${g.venue ? ` (${g.venue})` : ''}` }))} />
          </Field>
          <Field label="Title" htmlFor="ms-title" noContainer>
            <input id="ms-title" type="text" placeholder="e.g., Year 2 RPPR" value={title} onChange={(e) => setTitle(e.target.value)} style={input} autoFocus />
          </Field>
          <Field label="Our date" htmlFor="ms-due" noContainer>
            <input id="ms-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} style={input} />
          </Field>
          <Field label="Hard date (the sponsor's)" htmlFor="ms-hard" noContainer>
            <input id="ms-hard" type="date" value={hard} onChange={(e) => setHard(e.target.value)} style={input} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} style={{ padding: 'var(--sp-sm) var(--sp-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', background: 'none', fontSize: 'var(--value-size)', color: 'var(--slate)', cursor: 'pointer' }}>Cancel</button>
          <button type="button" disabled={!ready || add.isPending} data-testid="milestone-save"
            onClick={() => row && add.mutate({ slug: row.project_slug, productId: row.id, title: title.trim(), due_date: due || null, deadline: hard || null }, { onSuccess: onClose })}
            className="flex items-center gap-1.5"
            style={{ padding: 'var(--sp-sm) var(--sp-lg)', borderRadius: 'var(--radius-lg)', border: 'none', background: ready ? 'var(--job-accent)' : 'var(--border-subtle)', color: ready ? 'var(--sk-card)' : 'var(--slate)', fontSize: 'var(--value-size)', fontWeight: 600, cursor: ready ? 'pointer' : 'not-allowed' }}>
            {add.isPending ? 'Saving…' : <><Check {...ICON_PROPS} size={14} /> Add milestone</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
