import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Plus, List, GitBranch } from 'lucide-react'
import DensityToggle, { useDensity, densityClass } from '../../components/DensityToggle'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import Avatar from '../../components/Avatar'
import ToggleButton from '../../components/ToggleButton'
import CreateProjectModal from '../../components/CreateProjectModal'
import { useProjects, useTasks, useActiveRevisions } from '../../hooks/useApiData'
import { useCreateProject } from '../../hooks/useMutations'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProject } from '../../lib/api'
import InlineSelect from '../../components/InlineSelect'
import { useUndoToast } from '../../components/UndoToast'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { getPersonInfo } from '../../data/team'
import type { Project } from '../../data/types'
import PageHeader from '../../components/PageHeader'
import { ActiveRevisionsDashboard } from '../../components/RevisionTracker'
import { ColumnHeader, TableContainer } from '../../components/table'
// EmptyState available if needed

import { usePageMeta } from '../../hooks/usePageMeta'
import { useScrollReveal } from '../../hooks/useScrollReveal'

const STAGES = ['Idea', 'Data Collection', 'Analysis', 'Writing', 'Review', 'Published'] as const
const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, i]))

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

export default function Manuscripts() {
  usePageMeta(
    'Manuscript Pipeline | MN-CCORE',
    'Track MN-CCORE manuscripts from idea to publication.'
  )

  const [density, setDensity] = useDensity()
  const [view, setView] = useState<'list' | 'pipeline'>('list')
  const [filterPI, setFilterPI] = useState<string>('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)
  const [sortKey, setSortKey] = useState<'stage' | 'title' | 'status' | 'pi' | 'category'>('stage')
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
    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'stage': cmp = (STAGE_ORDER[a.stage ?? ''] ?? 99) - (STAGE_ORDER[b.stage ?? ''] ?? 99); break
        case 'title': cmp = a.title.localeCompare(b.title); break
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break
        case 'pi': cmp = (a.pi || '').localeCompare(b.pi || ''); break
        case 'category': cmp = (a.category || '').localeCompare(b.category || ''); break
      }
      if (cmp === 0) cmp = a.title.localeCompare(b.title)
      return sortAsc ? cmp : -cmp
    })
  }, [projects, filterPI, filterCategory, sortKey, sortAsc])

  useListKeyboardNav({
    itemCount: view === 'list' ? manuscripts.length : 0,
    focusedIndex,
    setFocusedIndex,
    disabled: showCreate,
  })

  // Reset focus when filters or view change
  useEffect(() => { setFocusedIndex(-1) }, [filterPI, filterCategory, view])

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
          <div className="flex items-center gap-4 flex-wrap">
            {/* View toggle */}
            <div className="flex items-center gap-1.5">
              <ToggleButton active={view === 'list'} onClick={() => setView('list')}>
                <List size={14} />
                List
              </ToggleButton>
              <ToggleButton active={view === 'pipeline'} onClick={() => setView('pipeline')}>
                <GitBranch size={14} />
                Pipeline
              </ToggleButton>
            </div>

            <select
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
              <option value="nick">Nick Ingraham</option>
              <option value="nate">Nate Mesfin</option>
            </select>

            <select
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
            <DensityToggle value={density} onChange={setDensity} />
          </div>
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
                gridTemplateColumns: 'minmax(200px, 1fr) 100px 100px 100px 72px',
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
                  const catLabel = CATEGORY_LABEL[project.category] ?? project.category
                  const showStageHeader = project.stage !== lastStage
                  lastStage = project.stage ?? ''
                  const tc = taskCounts.get(project.slug) || 0
                  const isFocused = focusedIndex === flatIndex
                  flatIndex++

                  return (
                    <div key={project.slug}>
                      {showStageHeader && sortKey === 'stage' && (
                        <div className="flex items-center" style={{ padding: '20px 24px 8px', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 500,
                              color: 'var(--slate)',
                              opacity: 0.55,
                              textTransform: 'uppercase' as const,
                              letterSpacing: '0.06em',
                              flexShrink: 0,
                            }}
                          >
                            {project.stage}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.35, flexShrink: 0 }}>
                            {manuscripts.filter((p) => p.stage === project.stage).length}
                          </span>
                          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                        </div>
                      )}

                      <Link to={`/projects/${project.slug}`} className={isFocused ? 'task-row-focused' : ''} style={{ textDecoration: 'none', display: 'block' }}>
                        {/* Desktop: 5-column grid */}
                        <div
                          className="manuscript-list-row hidden sm:grid"
                          style={{
                            gridTemplateColumns: 'minmax(200px, 1fr) 100px 100px 100px 72px',
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
                                flexShrink: 0, opacity: 0.7, marginTop: '-1px',
                              }}
                            />
                            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35 }}>
                              {project.title}
                            </span>
                            {tc > 0 && (
                              <span style={{ fontSize: '11px', color: 'var(--teal)', opacity: 0.7, flexShrink: 0 }}>
                                {tc}
                              </span>
                            )}
                            {/* Stage progress dots */}
                            <div className="flex items-center gap-0.5 ml-1 flex-shrink-0">
                              {STAGES.map((s, i) => {
                                const currentIdx = STAGES.indexOf((project.stage as typeof STAGES[number]) || 'Idea')
                                return (
                                  <div
                                    key={s}
                                    style={{
                                      width: 5, height: 5, borderRadius: 'var(--radius-circle)',
                                      background: i <= currentIdx ? 'var(--teal)' : 'var(--border-subtle)',
                                      transition: 'background 200ms',
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

                          <div className="flex items-center gap-1.5">
                            <div style={{ width: 22, height: 22, flexShrink: 0 }}>
                              <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="sm-plus" variant="ice" />
                            </div>
                            <span style={{ fontSize: 'var(--text-small)', color: 'var(--slate)', opacity: 0.6 }}>
                              {pi.name.split(' ').pop()}
                            </span>
                          </div>

                          <span style={{ fontSize: 'var(--text-label)', color: 'var(--slate)', opacity: 0.4 }}>
                            {catLabel}
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
                                flexShrink: 0, opacity: 0.7, marginTop: '6px',
                              }}
                            />
                            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35, flex: 1 }}>
                              {project.title}
                            </span>
                            {tc > 0 && (
                              <span style={{ fontSize: '11px', color: 'var(--teal)', opacity: 0.7, flexShrink: 0, marginTop: '4px' }}>
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
                            <span
                              style={{
                                fontSize: '11px',
                                color: 'var(--slate)',
                                opacity: 0.4,
                                marginLeft: 'auto',
                              }}
                            >
                              {catLabel}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </div>
                  )
                })
              })()
            ) : (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <span style={{ fontSize: '14px', color: 'var(--slate)', opacity: 0.4 }}>
                  No manuscripts found
                </span>
              </div>
            )}

            {/* Calculations row */}
            {manuscripts.length > 0 && (() => {
              const stageCounts = manuscripts.reduce<Record<string, number>>((acc, p) => {
                const stage = p.stage || 'Idea'
                acc[stage] = (acc[stage] || 0) + 1
                return acc
              }, {})
              const stats = [
                { label: 'Count', value: manuscripts.length },
                ...STAGES.filter(s => stageCounts[s]).map(s => ({
                  label: s,
                  value: stageCounts[s],
                })),
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
                    <span key={s.label} style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
                      {s.label}{' '}
                      <span style={{ fontWeight: 600, color: (s as any).color || 'var(--slate)', opacity: 1 }}>
                        {s.value}
                      </span>
                    </span>
                  ))}
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
                    <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.4, fontWeight: 500 }}>
                      {stageProjects.length}
                    </span>
                  </div>

                  <div className="flex flex-col" style={{ gap: '10px' }}>
                    <AnimatePresence mode="popLayout">
                      {stageProjects.map((p) => {
                        const pi = getPersonInfo(p.pi)
                        const dotColor = CATEGORY_DOT[p.category] ?? 'var(--slate)'
                        return (
                          <Link key={p.slug} to={`/projects/${p.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
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
                                <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: dotColor, flexShrink: 0, opacity: 0.7, marginTop: '5px' }} />
                                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, margin: 0 }}>
                                  {p.title}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5" style={{ marginTop: '6px', marginLeft: '14px' }}>
                                <div style={{ width: 16, height: 16, flexShrink: 0 }}>
                                  <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="2xs" variant="ice" />
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
                                  {pi.name.split(' ').pop()}
                                </span>
                              </div>
                            </motion.div>
                          </Link>
                        )
                      })}
                    </AnimatePresence>
                    {stageProjects.length === 0 && (
                      <div style={{ padding: 'var(--sp-xl) var(--sp-sm)', textAlign: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.3 }}>
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
