import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Plus, List, GitBranch } from 'lucide-react'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import Avatar from '../../components/Avatar'
import ToggleButton from '../../components/ToggleButton'
import CreateProjectModal from '../../components/CreateProjectModal'
import { useProjects, useTasks } from '../../hooks/useApiData'
import { useCreateProject } from '../../hooks/useMutations'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProject } from '../../lib/api'
import InlineSelect from '../../components/InlineSelect'
import { useUndoToast } from '../../components/UndoToast'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { getPersonInfo } from '../../data/team'
import type { Project } from '../../data/types'
import PageHeader from '../../components/PageHeader'
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

  const [view, setView] = useState<'list' | 'pipeline'>('list')
  const [filterPI, setFilterPI] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  useScrollReveal<HTMLDivElement>()

  const { data: projects = [], isLoading } = useProjects()
  const { data: tasks = [] } = useTasks()
  const createProject = useCreateProject()
  const queryClient = useQueryClient()
  const { showUndo } = useUndoToast()
  const inlineUpdate = useMutation({
    mutationFn: ({ slug, fields }: { slug: string; fields: Record<string, unknown> }) =>
      updateProject(slug, fields),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  const handleFieldChange = (slug: string, field: string, value: unknown, prev: unknown) => {
    inlineUpdate.mutate({ slug, fields: { [field]: value } })
    showUndo(`${field} → ${value}`, () => inlineUpdate.mutate({ slug, fields: { [field]: prev } }))
  }

  const manuscripts = useMemo(() => {
    let filtered = projects.filter((p) => p.status !== 'Published' || p.stage === 'Published')
    if (filterPI) filtered = filtered.filter((p) => p.pi === filterPI)
    return [...filtered].sort((a, b) => {
      const stageA = STAGE_ORDER[a.stage ?? ''] ?? 99
      const stageB = STAGE_ORDER[b.stage ?? ''] ?? 99
      if (stageA !== stageB) return stageA - stageB
      return a.title.localeCompare(b.title)
    })
  }, [projects, filterPI])

  useListKeyboardNav({
    itemCount: view === 'list' ? manuscripts.length : 0,
    focusedIndex,
    setFocusedIndex,
    disabled: showCreate,
  })

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
              New Project
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
          </div>
        </PageHeader>

        {/* Loading skeleton */}
        {isLoading && <TableSkeleton rows={6} cols={5} />}

        {/* ─── LIST VIEW ─── */}
        {!isLoading && view === 'list' && (
          <div className="table-container">
            {/* Table header */}
            <div
              className="hidden sm:grid"
              style={{
                gridTemplateColumns: '1fr 100px 100px 100px 72px',
                padding: '8px 24px',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              {['Title', 'Status', 'Stage', 'PI', 'Group'].map((col) => (
                <span
                  key={col}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'var(--slate)',
                    opacity: 0.5,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.06em',
                  }}
                >
                  {col}
                </span>
              ))}
            </div>

            {/* Stage-grouped rows */}
            {manuscripts.length > 0 ? (
              (() => {
                let lastStage = ''
                return manuscripts.map((project) => {
                  const pi = getPersonInfo(project.pi)
                  const catLabel = CATEGORY_LABEL[project.category] ?? project.category
                  const showStageHeader = project.stage !== lastStage
                  lastStage = project.stage ?? ''
                  const tc = taskCounts.get(project.slug) || 0

                  return (
                    <div key={project.slug}>
                      {showStageHeader && (
                        <div className="flex items-center" style={{ padding: '20px 24px 8px', gap: '8px' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-body)',
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
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--slate)', opacity: 0.35, flexShrink: 0 }}>
                            {manuscripts.filter((p) => p.stage === project.stage).length}
                          </span>
                          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                        </div>
                      )}

                      <Link to={`/projects/${project.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
                        {/* Desktop: 5-column grid */}
                        <div
                          className="manuscript-list-row hidden sm:grid"
                          style={{
                            gridTemplateColumns: '1fr 100px 100px 100px 72px',
                            padding: '14px 24px',
                            borderBottom: '1px solid var(--border-subtle)',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease-out',
                          }}
                        >
                          <div className="flex items-center gap-2.5" style={{ paddingRight: '16px' }}>
                            <span
                              style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: CATEGORY_DOT[project.category] ?? 'var(--slate)',
                                flexShrink: 0, opacity: 0.7, marginTop: '-1px',
                              }}
                            />
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.4 }}>
                              {project.title}
                            </span>
                            {tc > 0 && (
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--teal)', opacity: 0.7, flexShrink: 0 }}>
                                {tc}
                              </span>
                            )}
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
                              <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="sm" variant="ice" className="!w-[22px] !h-[22px] !min-w-0 !min-h-0 !text-[8px]" />
                            </div>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--slate)', opacity: 0.6 }}>
                              {pi.name.split(' ').pop()}
                            </span>
                          </div>

                          <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--slate)', opacity: 0.4 }}>
                            {catLabel}
                          </span>
                        </div>

                        {/* Mobile: stacked layout */}
                        <div
                          className="manuscript-list-row sm:hidden"
                          style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease-out',
                          }}
                        >
                          {/* Title row: category dot + title + task count */}
                          <div className="flex items-start gap-2" style={{ marginBottom: '8px' }}>
                            <span
                              style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: CATEGORY_DOT[project.category] ?? 'var(--slate)',
                                flexShrink: 0, opacity: 0.7, marginTop: '6px',
                              }}
                            />
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.4, flex: 1 }}>
                              {project.title}
                            </span>
                            {tc > 0 && (
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--teal)', opacity: 0.7, flexShrink: 0, marginTop: '4px' }}>
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
                                fontFamily: 'var(--font-body)',
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
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)', opacity: 0.4 }}>
                  No manuscripts found
                </span>
              </div>
            )}
          </div>
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
                    background: '#f5f5f5',
                    borderRadius: '12px',
                    borderTop: '2px solid var(--teal)',
                    padding: '16px',
                    minHeight: '200px',
                  }}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
                    <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px', color: 'var(--ink)', margin: 0 }}>
                      {stage}
                    </h3>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--slate)', opacity: 0.4, fontWeight: 500 }}>
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
                                borderRadius: '8px',
                                padding: '14px',
                                boxShadow: '0 1px 2px rgba(15, 25, 35, 0.04)',
                                transition: 'box-shadow 0.25s ease',
                              }}
                            >
                              <div className="flex items-start gap-2">
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0, opacity: 0.7, marginTop: '5px' }} />
                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4, margin: 0 }}>
                                  {p.title}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5" style={{ marginTop: '6px', marginLeft: '14px' }}>
                                <div style={{ width: 16, height: 16, flexShrink: 0 }}>
                                  <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="sm" variant="ice" className="!w-4 !h-4 !min-w-0 !min-h-0 !text-[6px]" />
                                </div>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
                                  {pi.name.split(' ').pop()}
                                </span>
                              </div>
                            </motion.div>
                          </Link>
                        )
                      })}
                    </AnimatePresence>
                    {stageProjects.length === 0 && (
                      <div style={{ padding: '24px 8px', textAlign: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--slate)', opacity: 0.3 }}>
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
          background: rgba(201, 168, 76, 0.06) !important;
        }
        .manuscript-list-row:active {
          background: rgba(201, 168, 76, 0.10) !important;
        }
        .new-project-btn:hover {
          background: rgba(45, 138, 138, 0.06) !important;
        }
        .dark .manuscript-list-row:hover {
          background: rgba(201, 168, 76, 0.08) !important;
        }
      `}</style>
    </div>
  )
}
