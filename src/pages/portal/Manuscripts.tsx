import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Plus, List, GitBranch, BookOpen, ExternalLink } from 'lucide-react'
import { useDensity, densityClass } from '../../components/DensityToggle'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import Avatar from '../../components/Avatar'
import CreateProjectModal from '../../components/CreateProjectModal'
import { useProjects, useTasks, useActiveRevisions } from '../../hooks/useApiData'
import { useCreateProject } from '../../hooks/useMutations'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProject } from '../../lib/api'
import InlineSelect from '../../components/InlineSelect'
import { useUndoToast } from '../../components/UndoToast'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { getPersonInfo } from '../../data/team'
import { displayName } from '../../lib/nameUtils'
import type { Project } from '../../data/types'
import PageHeader from '../../components/PageHeader'
import { ActiveRevisionsDashboard } from '../../components/RevisionTracker'
import { ColumnHeader, TableContainer, TableControls } from '../../components/table'
import EmptyState from '../../components/EmptyState'

import { usePageMeta } from '../../hooks/usePageMeta'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import { PATHS } from '../../constants/paths'

const STAGES = ['Idea', 'Data Collection', 'Analysis', 'Writing', 'Review', 'Revisions', 'Published'] as const
const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, i]))

// PI options for inline editing. Primary investigators on CCORE manuscripts
// are the two directors (Nick + Nate). More PIs can be added as they start
// owning manuscript projects.
const PI_OPTIONS = [
  { value: 'nick-ingraham', label: 'Nick Ingraham' },
  { value: 'nate-mesfin', label: 'Nate Mesfin' },
] as const

const STALLED_THRESHOLD_DAYS = 30

function daysInStage(project: Project): number {
  const dateStr = project.updated_at || project.lastActivity
  if (!dateStr) return 0
  const ms = Date.now() - new Date(dateStr).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

const CATEGORY_DOT: Record<string, string> = {
  clif: 'var(--maroon)',
  lab: 'var(--teal)',
  nate: 'var(--gold)',
  mentee: 'var(--slate)',
}

const CATEGORY_LABEL: Record<string, string> = {
  clif: 'CLIF',
  lab: 'Lab',
  nate: 'Mesfin',
  mentee: 'Mentee',
}

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({
  value,
  label,
  color: CATEGORY_DOT[value],
}))

export default function Manuscripts() {
  usePageMeta(
    'Manuscript Pipeline | MN-CCORE',
    'Track MN-CCORE manuscripts from idea to publication.'
  )

  const [density, setDensity] = useDensity()
  // P3-03: 'trophy' = cover-style grid for Published manuscripts.
  const [view, setView] = useState<'list' | 'pipeline' | 'trophy'>('list')
  const [filterPI, setFilterPI] = useState<string>('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterStalled, setFilterStalled] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [sortKey, setSortKey] = useState<'stage' | 'title' | 'status' | 'pi' | 'category' | 'days_in_stage'>('stage')
  const [sortAsc, setSortAsc] = useState(true)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  useScrollReveal<HTMLDivElement>()

  const { data: projects = [], isLoading } = useProjects()
  const { data: tasks = [] } = useTasks()
  const { data: activeRevisions = [] } = useActiveRevisions()
  const createProject = useCreateProject()
  const queryClient = useQueryClient()
  const { showUndo } = useUndoToast()
  const inlineUpdate = useMutation({
    mutationFn: ({ slug, fields }: { slug: string; fields: Record<string, unknown> }) =>
      updateProject(slug, fields),
    onMutate: async ({ slug, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] })
      const prev = queryClient.getQueryData<Project[]>(['projects'])
      if (prev) {
        queryClient.setQueryData<Project[]>(['projects'], prev.map(p => p.slug === slug ? { ...p, ...fields } : p))
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['projects'], context.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })

  const handleFieldChange = (slug: string, field: string, value: unknown, prev: unknown) => {
    inlineUpdate.mutate({ slug, fields: { [field]: value } })
    showUndo(`${field} → ${value}`, () => inlineUpdate.mutate({ slug, fields: { [field]: prev } }))
  }

  const manuscripts = useMemo(() => {
    let filtered = projects.filter((p) => p.status !== 'Published' || p.stage === 'Published')
    if (filterPI) filtered = filtered.filter((p) => p.pi === filterPI)
    if (filterCategory) filtered = filtered.filter((p) => p.category === filterCategory)
    if (filterStalled) filtered = filtered.filter((p) => p.stage !== 'Published' && daysInStage(p) > STALLED_THRESHOLD_DAYS)
    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'stage': cmp = (STAGE_ORDER[a.stage ?? ''] ?? 99) - (STAGE_ORDER[b.stage ?? ''] ?? 99); break
        case 'title': cmp = a.title.localeCompare(b.title); break
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break
        case 'pi': cmp = (a.pi || '').localeCompare(b.pi || ''); break
        case 'category': cmp = (a.category || '').localeCompare(b.category || ''); break
        case 'days_in_stage': cmp = daysInStage(b) - daysInStage(a); break
      }
      if (cmp === 0) cmp = a.title.localeCompare(b.title)
      return sortAsc ? cmp : -cmp
    })
  }, [projects, filterPI, filterCategory, filterStalled, sortKey, sortAsc])

  useListKeyboardNav({
    itemCount: view === 'list' ? manuscripts.length : 0,
    focusedIndex,
    setFocusedIndex,
    disabled: showCreate,
  })

  // Reset focus when filters or view change
  useEffect(() => { setFocusedIndex(-1) }, [filterPI, filterCategory, filterStalled, view])

  const taskCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) {
      if (t.project_id && !t.completed) {
        map.set(t.project_id, (map.get(t.project_id) || 0) + 1)
      }
    }
    return map
  }, [tasks])

  const byStage = useMemo(() => {
    const map: Record<string, Project[]> = {}
    for (const s of STAGES) map[s] = []
    for (const p of manuscripts) {
      const stage = p.stage || 'Idea'
      if (map[stage]) map[stage].push(p)
      else map['Idea'].push(p)
    }
    return map
  }, [manuscripts])

  const activeCount = manuscripts.filter((p) => p.stage !== 'Published').length
  const writingCount = manuscripts.filter((p) => p.stage === 'Writing').length

  const stalledCount = useMemo(() =>
    projects.filter(p => p.stage !== 'Published' && daysInStage(p) > STALLED_THRESHOLD_DAYS).length
  , [projects])

  // Dynamic page title
  useEffect(() => {
    document.title = writingCount > 0
      ? `Manuscripts (${writingCount} writing) | MN-CCORE`
      : `Manuscripts (${activeCount}) | MN-CCORE`
    return () => { document.title = 'MN-CCORE Lab Hub' }
  }, [writingCount, activeCount])

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '6rem' }}>
        <PageHeader
          icon={<FileText size={20} />}
          title="Manuscripts"
          count={activeCount}
          actions={
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg new-project-btn"
              style={{
                background: 'transparent',
                color: 'var(--teal)',
                fontSize: '13px',
                fontWeight: 600,
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                transition: 'background 0.12s ease-out',
              }}
            >
              <Plus size={14} />
              New Manuscript
            </button>
          }
        >
          <TableControls
            views={[
              { key: 'list', icon: <List size={14} />, label: 'List' },
              { key: 'pipeline', icon: <GitBranch size={14} />, label: 'Pipeline' },
              { key: 'trophy', icon: <BookOpen size={14} />, label: 'Trophy' },
            ]}
            activeView={view}
            onViewChange={(v) => setView(v as 'list' | 'pipeline' | 'trophy')}
            filters={
              <>
                <select
                  aria-label="Filter manuscripts by PI"
                  value={filterPI}
                  onChange={(e) => setFilterPI(e.target.value)}
                  className="rounded-md border px-3 py-1.5 text-xs"
                  style={{
                    fontSize: '12px',
                    color: filterPI ? 'var(--teal)' : 'var(--slate)',
                    backgroundColor: 'transparent',
                    borderColor: 'var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All PIs</option>
                  <option value="nick-ingraham">Nick Ingraham</option>
                  <option value="nate-mesfin">Nate Mesfin</option>
                </select>
                <select
                  aria-label="Filter manuscripts by category"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="rounded-md border px-3 py-1.5 text-xs"
                  style={{
                    fontSize: '12px',
                    color: filterCategory ? 'var(--gold)' : 'var(--slate)',
                    backgroundColor: 'transparent',
                    borderColor: 'var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All Groups</option>
                  {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                {/* Stalled filter pill */}
                <button
                  onClick={() => setFilterStalled(!filterStalled)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    border: filterStalled ? '1px solid var(--orange)' : '1px solid var(--border-subtle)',
                    background: filterStalled ? 'var(--orange-hover)' : 'transparent',
                    color: filterStalled ? 'var(--orange)' : 'var(--slate)',
                    fontSize: '12px',
                    fontWeight: filterStalled ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.12s ease-out',
                    opacity: filterStalled ? 1 : 0.85,
                  }}
                  title={`Manuscripts stalled in stage for more than ${STALLED_THRESHOLD_DAYS} days`}
                >
                  Stalled
                  {stalledCount > 0 && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '16px',
                        height: '16px',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--orange)',
                        color: 'white',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '0 4px',
                      }}
                    >
                      {stalledCount}
                    </span>
                  )}
                </button>
              </>
            }
            showDensity
            density={density}
            onDensityChange={setDensity}
            count={activeCount}
            countLabel="manuscripts"
          />
        </PageHeader>

        {/* Active Revisions section */}
        {!isLoading && activeRevisions.length > 0 && (
          <ActiveRevisionsDashboard revisions={activeRevisions} />
        )}

        {/* Loading skeleton */}
        {isLoading && <TableSkeleton rows={6} cols={5} />}

        {/* ─── LIST VIEW ─── */}
        {!isLoading && view === 'list' && (
          <TableContainer className={densityClass(density)}>
            {/* Table header — sortable */}
            <div
              className="hidden sm:grid"
              style={{
                gridTemplateColumns: 'minmax(200px, 3fr) 90px 100px 140px 80px 68px',
                padding: 'var(--sp-sm) var(--sp-xl)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              {([
                { label: 'Title', key: 'title' as const },
                { label: 'Status', key: 'status' as const },
                { label: 'Stage', key: 'stage' as const },
                { label: 'PI', key: 'pi' as const },
                { label: 'Group', key: 'category' as const },
                { label: 'Days', key: 'days_in_stage' as const },
              ]).map((col) => (
                <ColumnHeader
                  key={col.key}
                  label={col.label}
                  sortKey={col.key}
                  currentSort={sortKey}
                  sortAsc={sortAsc}
                  onSort={(k) => {
                    if (sortKey === k) setSortAsc(!sortAsc)
                    else { setSortKey(k as typeof sortKey); setSortAsc(true) }
                  }}
                />
              ))}
            </div>

            {/* Stage-grouped rows */}
            {manuscripts.length > 0 ? (
              (() => {
                let lastStage = ''
                let flatIndex = 0
                return manuscripts.map((project) => {
                  const pi = getPersonInfo(project.pi)
                  const showStageHeader = project.stage !== lastStage
                  lastStage = project.stage ?? ''
                  const tc = taskCounts.get(project.slug) || 0
                  const isFocused = focusedIndex === flatIndex
                  flatIndex++
                  const days = daysInStage(project)
                  const isStalled = project.stage !== 'Published' && days > STALLED_THRESHOLD_DAYS

                  return (
                    <div key={project.slug}>
                      {showStageHeader && sortKey === 'stage' && (
                        <div className="flex items-center" style={{ padding: '20px 24px 8px', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 500,
                              color: 'var(--slate)',
                              opacity: 0.75,
                              textTransform: 'uppercase' as const,
                              letterSpacing: '0.06em',
                              flexShrink: 0,
                            }}
                          >
                            {project.stage}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75, flexShrink: 0 }}>
                            {manuscripts.filter((p) => p.stage === project.stage).length}
                          </span>
                          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                        </div>
                      )}

                      <Link to={PATHS.project(project.slug)} className={isFocused ? 'task-row-focused' : ''} style={{ textDecoration: 'none', display: 'block' }}>
                        {/* Desktop: 6-column grid */}
                        <div
                          className="manuscript-list-row hidden sm:grid"
                          style={{
                            gridTemplateColumns: 'minmax(200px, 3fr) 90px 100px 140px 80px 68px',
                            padding: `var(--row-padding-y, 14px) 24px`,
                            borderBottom: '1px solid var(--border-subtle)',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease-out',
                          }}
                        >
                          <div className="flex items-center gap-2.5" style={{ paddingRight: '16px' }}>
                            <span
                              style={{
                                width: 6, height: 6, borderRadius: 'var(--radius-circle)',
                                background: CATEGORY_DOT[project.category] ?? 'var(--slate)',
                                flexShrink: 0, opacity: 0.85, marginTop: '-1px',
                              }}
                            />
                            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35 }}>
                              {project.title}
                            </span>
                            {tc > 0 && (
                              <span style={{ fontSize: '11px', color: 'var(--teal)', flexShrink: 0 }}>
                                {tc}
                              </span>
                            )}
                            {/* Stage progress dots: completed=gray filled, current=teal, pending=faint outlined */}
                            <div className="flex items-center gap-0.5 ml-1 flex-shrink-0">
                              {STAGES.map((s, i) => {
                                const currentIdx = STAGES.indexOf((project.stage as typeof STAGES[number]) || 'Idea')
                                return (
                                  <div
                                    key={s}
                                    style={{
                                      width: 5, height: 5, borderRadius: 'var(--radius-circle)',
                                      background: i < currentIdx
                                        ? 'var(--ink-muted)'
                                        : i === currentIdx
                                          ? 'var(--teal)'
                                          : 'transparent',
                                      border: i > currentIdx ? '1px solid var(--border-subtle)' : 'none',
                                      opacity: i > currentIdx ? 0.85 : 1,
                                      transition: 'background 200ms',
                                      boxSizing: 'border-box',
                                    }}
                                    title={s}
                                  />
                                )
                              })}
                            </div>
                          </div>

                          {/* Status (inline editable) */}
                          <InlineSelect
                            value={project.status || 'Active'}
                            options={[
                              { value: 'Active', label: 'Active', color: 'var(--green)' },
                              { value: 'Pending', label: 'Pending', color: 'var(--gold)' },
                              { value: 'Completed', label: 'Done', color: 'var(--slate)' },
                            ]}
                            onChange={(val) => handleFieldChange(project.slug, 'status', val, project.status)}
                          />

                          {/* Stage (inline editable) */}
                          <InlineSelect
                            value={project.stage || 'Idea'}
                            options={STAGES.map((s) => ({ value: s, label: s }))}
                            onChange={(val) => handleFieldChange(project.slug, 'stage', val, project.stage)}
                          />

                          {/* PI — inline editable. Avatar stays visible as a sibling so the
                              visual "who owns this?" signal isn't lost when we switch to a select. */}
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <div style={{ width: 22, height: 22, flexShrink: 0 }}>
                              <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="sm-plus" variant="ice" />
                            </div>
                            <InlineSelect
                              value={project.pi || 'nick-ingraham'}
                              options={PI_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                              onChange={(val) => handleFieldChange(project.slug, 'pi', val, project.pi)}
                              size="sm"
                            />
                          </div>

                          {/* Category — inline editable */}
                          <div onClick={(e) => e.stopPropagation()}>
                            <InlineSelect
                              value={project.category || 'lab'}
                              options={CATEGORY_OPTIONS}
                              onChange={(val) => handleFieldChange(project.slug, 'category', val, project.category)}
                              size="sm"
                            />
                          </div>

                          {/* Days in stage */}
                          <span
                            style={{
                              fontSize: 'var(--text-label)',
                              fontWeight: isStalled ? 600 : 400,
                              color: isStalled ? 'var(--orange)' : 'var(--slate)',
                              opacity: isStalled ? 0.9 : 0.75,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                            title={isStalled ? `Stalled: ${days}d in this stage` : `${days}d in stage`}
                          >
                            {days > 0 ? `${days}d` : '—'}
                          </span>
                        </div>

                        {/* Mobile: stacked layout */}
                        <div
                          className="manuscript-list-row sm:hidden"
                          style={{
                            padding: `var(--row-padding-y, 12px) 16px`,
                            borderBottom: '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease-out',
                          }}
                        >
                          {/* Title row: category dot + title + task count */}
                          <div className="flex items-start gap-2" style={{ marginBottom: '8px' }}>
                            <span
                              style={{
                                width: 6, height: 6, borderRadius: 'var(--radius-circle)',
                                background: CATEGORY_DOT[project.category] ?? 'var(--slate)',
                                flexShrink: 0, opacity: 0.85, marginTop: '6px',
                              }}
                            />
                            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35, flex: 1 }}>
                              {project.title}
                            </span>
                            {tc > 0 && (
                              <span style={{ fontSize: '11px', color: 'var(--teal)', flexShrink: 0, marginTop: '4px' }}>
                                {tc}
                              </span>
                            )}
                          </div>
                          {/* Metadata row: status + stage + category label right-aligned */}
                          <div className="flex items-center gap-3" style={{ paddingLeft: '14px' }}>
                            <InlineSelect
                              value={project.status || 'Active'}
                              options={[
                                { value: 'Active', label: 'Active', color: 'var(--green)' },
                                { value: 'Pending', label: 'Pending', color: 'var(--gold)' },
                                { value: 'Completed', label: 'Done', color: 'var(--slate)' },
                              ]}
                              onChange={(val) => handleFieldChange(project.slug, 'status', val, project.status)}
                            />
                            <InlineSelect
                              value={project.stage || 'Idea'}
                              options={STAGES.map((s) => ({ value: s, label: s }))}
                              onChange={(val) => handleFieldChange(project.slug, 'stage', val, project.stage)}
                            />
                            {/* Category — inline editable on mobile too */}
                            <div style={{ marginLeft: 'auto' }} onClick={(e) => e.stopPropagation()}>
                              <InlineSelect
                                value={project.category || 'lab'}
                                options={CATEGORY_OPTIONS}
                                onChange={(val) => handleFieldChange(project.slug, 'category', val, project.category)}
                                size="sm"
                              />
                            </div>
                          </div>
                        </div>
                      </Link>
                    </div>
                  )
                })
              })()
            ) : (
              <EmptyState
                icon={<FileText size={40} />}
                title="The shelf is empty"
                subtitle="Manuscripts in the pipeline show up here, grouped by stage — from first draft to published."
              />
            )}

            {/* Calculations row */}
            {manuscripts.length > 0 && (() => {
              const stageCounts = manuscripts.reduce<Record<string, number>>((acc, p) => {
                const stage = p.stage || 'Idea'
                acc[stage] = (acc[stage] || 0) + 1
                return acc
              }, {})
              const publishedCount = stageCounts['Published'] || 0
              const stats = [
                { label: 'Total', value: manuscripts.length },
                ...STAGES.filter(s => s !== 'Published' && stageCounts[s]).map(s => ({
                  label: s,
                  value: stageCounts[s],
                })),
                ...(publishedCount > 0 ? [{ label: 'Published', value: publishedCount }] : []),
              ]
              return (
                <div
                  style={{
                    display: 'flex',
                    gap: 20,
                    padding: 'var(--sp-sm) var(--sp-lg)',
                    borderTop: '1px solid var(--border-subtle)',
                    background: 'var(--teal-hover)',
                  }}
                >
                  {stats.map(s => (
                    <span key={s.label} style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75 }}>
                      {s.label}{' '}
                      <span style={{ fontWeight: 600, color: 'var(--slate)', opacity: 1 }}>
                        {s.value}
                      </span>
                    </span>
                  ))}
                  {stalledCount > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--orange)', opacity: 0.8, marginLeft: 'auto' }}>
                      {stalledCount} stalled
                    </span>
                  )}
                </div>
              )
            })()}
          </TableContainer>
        )}

        {/* ─── PIPELINE VIEW ─── */}
        {!isLoading && view === 'pipeline' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${STAGES.length}, minmax(180px, 1fr))`,
              gap: '20px',
              overflowX: 'auto',
              paddingBottom: '1rem',
            }}
          >
            {STAGES.map((stage) => {
              const stageProjects = byStage[stage] || []
              return (
                <div
                  key={stage}
                  style={{
                    background: 'var(--ice)',
                    borderRadius: 'var(--radius-xl)',
                    borderTop: '2px solid var(--teal)',
                    padding: 'var(--sp-lg)',
                    minHeight: '200px',
                  }}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
                    <h3 style={{ fontWeight: 500, fontSize: '13px', color: 'var(--ink)', margin: 0 }}>
                      {stage}
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.75, fontWeight: 500 }}>
                      {stageProjects.length}
                    </span>
                  </div>

                  <div className="flex flex-col" style={{ gap: '10px' }}>
                    <AnimatePresence mode="popLayout">
                      {stageProjects.map((p) => {
                        const pi = getPersonInfo(p.pi)
                        const dotColor = CATEGORY_DOT[p.category] ?? 'var(--slate)'
                        return (
                          <Link key={p.slug} to={PATHS.project(p.slug)} style={{ textDecoration: 'none', display: 'block' }}>
                            <motion.div
                              layout
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8 }}
                              className="project-card"
                              style={{
                                background: 'var(--cream)',
                                borderRadius: 'var(--radius-lg)',
                                padding: '14px',
                                boxShadow: 'var(--shadow-card)',
                                transition: 'box-shadow 0.25s ease',
                              }}
                            >
                              <div className="flex items-start gap-2">
                                <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: dotColor, flexShrink: 0, opacity: 0.85, marginTop: '5px' }} />
                                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, margin: 0 }}>
                                  {p.title}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5" style={{ marginTop: '6px', marginLeft: '14px' }}>
                                <div style={{ width: 16, height: 16, flexShrink: 0 }}>
                                  <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="2xs" variant="ice" />
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75 }}>
                                  {p.pi ? displayName(p.pi, 'short') : pi.name}
                                </span>
                              </div>
                            </motion.div>
                          </Link>
                        )
                      })}
                    </AnimatePresence>
                    {stageProjects.length === 0 && (
                      <div style={{ padding: 'var(--sp-xl) var(--sp-sm)', textAlign: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.75 }}>
                          No projects
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ─── TROPHY VIEW (P3-03) ─── cover-style cards for Published manuscripts */}
        {!isLoading && view === 'trophy' && (() => {
          const published = manuscripts.filter((p) => p.stage === 'Published')
          if (published.length === 0) {
            return (
              <div className="text-center py-12" style={{ color: 'var(--slate)' }}>
                <BookOpen size={32} style={{ opacity: 0.4, margin: '0 auto var(--sp-sm)' }} />
                <p className="text-sm" style={{ opacity: 'var(--ink-label)' }}>
                  No published manuscripts yet. Trophy view shows them here once they ship.
                </p>
              </div>
            )
          }
          return (
            <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {published.map((p) => {
                const journal = (p as any).journal_name || (p as any).target_journal || (p as any).journal || ''
                const created = (p as any).created_at as string | undefined
                const year = (p as any).published_year || (p as any).year || (created ? new Date(created).getFullYear() : '')
                const doi = (p as any).doi
                return (
                  <div
                    key={p.slug}
                    className="rounded-lg border flex flex-col overflow-hidden"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      background: 'var(--surface-1)',
                      minHeight: '220px',
                    }}
                  >
                    <div
                      className="px-4 pt-4 pb-3"
                      style={{
                        background: 'linear-gradient(135deg, var(--teal-active), var(--gold-active))',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '11px', color: 'var(--ink-bright, #fff)', opacity: 0.85, letterSpacing: '0.04em' }}>
                        {journal || 'Journal'} {year ? `· ${year}` : ''}
                      </div>
                      <h3
                        className="mt-2"
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 500,
                          fontSize: '15px',
                          color: 'var(--ink-bright, #fff)',
                          lineHeight: 1.25,
                          minHeight: '3em',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical' as const,
                        }}
                      >
                        {p.title}
                      </h3>
                    </div>
                    <div className="flex-1 p-3 flex flex-col justify-between">
                      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--slate)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: 'var(--green)' }} />
                        Published
                      </div>
                      {doi && (
                        <a
                          href={doi.startsWith('http') ? doi : `https://doi.org/${doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] mt-2"
                          style={{ color: 'var(--teal)', textDecoration: 'none' }}
                        >
                          <ExternalLink size={11} />
                          DOI
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(input) => createProject.mutate(input)}
      />

      <style>{`
        .manuscript-list-row:hover {
          background: var(--gold-hover) !important;
        }
        .manuscript-list-row:active {
          background: var(--gold-active) !important;
        }
        .new-project-btn:hover {
          background: var(--teal-hover) !important;
        }
        .dark .manuscript-list-row:hover {
          background: var(--gold-active) !important;
        }
      `}</style>
    </div>
  )
}
