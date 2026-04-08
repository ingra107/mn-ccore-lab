import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderKanban, GitBranch, Plus, List, LayoutGrid } from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { useProjects, useDependencies, useProjectHealth } from '../hooks/useApiData'
import { useCreateProject } from '../hooks/useMutations'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProject } from '../lib/api'
import InlineSelect from '../components/InlineSelect'
import ProjectCard from '../components/ProjectCard'
import ProjectDependencyMap from '../components/ProjectDependencyMap'
import CreateProjectModal from '../components/CreateProjectModal'
import { directors } from '../data/team'
import type { Project } from '../data/types'
import { useProjectKeyboardNav } from '../hooks/useProjectKeyboardNav'
import type { Stage } from '../components/StageSelector'
import { staggerContainer, staggerItem } from '../lib/animations'
import PageTooltip from '../components/PageTooltip'

const STAGES = ['Idea', 'Data Collection', 'Analysis', 'Writing', 'Review', 'Published'] as const

const CATEGORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'clif', label: 'CLIF' },
  { key: 'lab', label: 'Lab' },
  { key: 'nate', label: 'Mesfin Lab' },
  { key: 'mentee', label: 'Mentees' },
] as const

const CATEGORY_DOT: Record<string, string> = {
  clif: 'var(--maroon)',
  lab: 'var(--teal)',
  nate: 'var(--gold)',
  mentee: 'var(--slate)',
}

const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, i]))

const HEALTH_STATUS_COLOR: Record<string, string> = {
  'Healthy': '#16a34a',
  'Needs Attention': '#c9a84c',
  'At Risk': '#c2410c',
  'Critical': '#7a0019',
}

function getStageProjects(stage: Stage, filtered: Project[]): Project[] {
  return filtered.filter((p) => p.stage === stage)
}

export default function Projects() {
  usePageMeta(
    'Research Pipeline | MN-CCORE',
    'Track MN-CCORE research projects from idea to publication across CLIF, Lab, and Mesfin research groups.'
  )

  const { data: projects = [] } = useProjects()
  const { data: dependencies = [] } = useDependencies()
  const { data: healthData } = useProjectHealth()

  // Build a map of slug -> health data for quick lookup
  const healthBySlug = useMemo(() => {
    const map = new Map<string, { score: number; status: string }>()
    for (const h of healthData?.data ?? []) {
      map.set(h.slug, { score: h.score, status: h.status })
    }
    return map
  }, [healthData])
  const createProject = useCreateProject()
  const queryClient = useQueryClient()
  const inlineUpdate = useMutation({
    mutationFn: ({ slug, fields }: { slug: string; fields: Record<string, unknown> }) =>
      updateProject(slug, fields),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
  const headerRef = useScrollReveal<HTMLDivElement>()
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list')
  const [showDeps, setShowDeps] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  type ProjectSortKey = 'title' | 'status' | 'stage' | 'pi' | 'category'
  const [sortKey, setSortKey] = useState<ProjectSortKey>('stage')
  const [sortAsc, setSortAsc] = useState(true)
  const toggleSort = (key: ProjectSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const filtered = useMemo(() => {
    const base = activeCategory === 'all' ? projects : projects.filter((p) => p.category === activeCategory)
    return [...base].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'title': cmp = a.title.localeCompare(b.title); break
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break
        case 'stage': {
          const stageA = STAGE_ORDER[a.stage ?? ''] ?? 99
          const stageB = STAGE_ORDER[b.stage ?? ''] ?? 99
          cmp = stageA - stageB
          break
        }
        case 'pi': cmp = (a.pi || '').localeCompare(b.pi || ''); break
        case 'category': cmp = (a.category || '').localeCompare(b.category || ''); break
      }
      if (cmp === 0) cmp = a.title.localeCompare(b.title)
      return sortAsc ? cmp : -cmp
    })
  }, [activeCategory, projects, sortKey, sortAsc])

  // Project slugs in display order for keyboard nav
  const projectSlugs = useMemo(() => filtered.map((p) => p.slug), [filtered])

  // Reset focus when filter/view changes
  useEffect(() => { setFocusedIndex(-1) }, [activeCategory, viewMode])

  // Keyboard navigation (list view only)
  useProjectKeyboardNav({
    projectCount: filtered.length,
    focusedIndex,
    setFocusedIndex,
    slugs: projectSlugs,
    enabled: viewMode === 'list' && !showCreate,
  })

  // Scroll focused row into view
  const setRowRef = useCallback((index: number) => (el: HTMLDivElement | null) => {
    rowRefs.current[index] = el
  }, [])

  useEffect(() => {
    if (focusedIndex >= 0 && rowRefs.current[focusedIndex]) {
      rowRefs.current[focusedIndex]!.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focusedIndex])

  // Summary stats
  const totalCount = projects.length
  const clifCount = projects.filter((p) => p.category === 'clif').length
  const labCount = projects.filter((p) => p.category === 'lab').length
  const nateCount = projects.filter((p) => p.category === 'nate').length
  const menteeCount = projects.filter((p) => p.category === 'mentee').length


  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '6rem' }}>
        {/* Page Header */}
        <div ref={headerRef} className="fade-in-up" style={{ marginBottom: '1rem', paddingTop: '1rem' }}>
          <div className="flex items-center gap-2.5">
            <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.08)', flexShrink: 0 }}>
              <FolderKanban size={16} style={{ color: 'var(--teal)' }} />
            </div>
            <h1
              style={{
                fontWeight: 600,
                fontSize: 'clamp(1.35rem, 3vw, 1.75rem)',
                color: 'var(--ink)',
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              Research Pipeline
            </h1>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg ml-auto new-project-btn"
              style={{
                background: 'transparent',
                color: 'var(--teal)',
                fontSize: '13px',
                fontWeight: 600,
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <Plus size={14} />
              New Project
            </button>
          </div>
        </div>

        {/* Controls bar: view toggle + filters + stats */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-4">
            {/* View toggle */}
            <div
              className="flex items-center rounded-lg overflow-hidden"
              style={{
                border: '1px solid var(--border-subtle)',
              }}
            >
              <button
                onClick={() => setViewMode('list')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
                style={{
                  fontWeight: 500,
                  background: viewMode === 'list' ? 'var(--teal)' : 'transparent',
                  color: viewMode === 'list' ? '#ffffff' : 'var(--slate)',
                  border: 'none',
                  transition: 'all 0.15s',
                }}
              >
                <List size={14} />
                List
              </button>
              <button
                onClick={() => setViewMode('pipeline')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
                style={{
                  fontWeight: 500,
                  background: viewMode === 'pipeline' ? 'var(--teal)' : 'transparent',
                  color: viewMode === 'pipeline' ? '#ffffff' : 'var(--slate)',
                  border: 'none',
                  transition: 'all 0.15s',
                }}
              >
                <LayoutGrid size={14} />
                Pipeline
              </button>
            </div>
            <PageTooltip id="projects-pipeline-hint" text="Try Pipeline view for a visual overview" />

            {/* Category filter pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setActiveCategory(f.key)}
                  className="cursor-pointer inline-flex items-center px-2.5 py-1 text-xs filter-pill"
                  style={{
                    fontWeight: 500,
                    fontSize: '12px',
                    borderRadius: '6px',
                    background: activeCategory === f.key ? 'var(--teal)' : 'transparent',
                    color: activeCategory === f.key ? '#ffffff' : 'var(--slate)',
                    border: activeCategory === f.key ? '1px solid var(--teal)' : '1px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary stats + dependency toggle */}
          <div className="flex items-center gap-3">
            <span
              className="text-xs"
              style={{
                color: 'var(--slate)',
                whiteSpace: 'nowrap',
              }}
            >
              {totalCount} projects &middot; {clifCount} CLIF &middot; {labCount} Lab &middot; {nateCount} Mesfin{menteeCount > 0 ? ` \u00b7 ${menteeCount} Mentees` : ''}
            </span>
            {viewMode === 'pipeline' && (
              <button
                type="button"
                onClick={() => setShowDeps(!showDeps)}
                className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  background: showDeps ? 'var(--teal)' : 'transparent',
                  color: showDeps ? '#ffffff' : 'var(--teal)',
                  border: '1px solid rgba(45, 138, 138, 0.2)',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                <GitBranch size={12} />
                Dependencies
              </button>
            )}
          </div>
        </div>

        {/* Dependency map (collapsible, pipeline only) */}
        <AnimatePresence>
          {showDeps && viewMode === 'pipeline' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ overflow: 'hidden', marginBottom: '1.5rem', position: 'relative' }}
            >
              <ProjectDependencyMap projects={filtered} dependencies={dependencies} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── LIST VIEW ─── */}
        {viewMode === 'list' && (
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
              {([['Title', 'title'], ['Status', 'status'], ['Stage', 'stage'], ['PI', 'pi'], ['Group', 'category']] as const).map(([label, key]) => (
                <button
                  key={key}
                  onClick={() => toggleSort(key)}
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color: sortKey === key ? 'var(--teal)' : 'var(--slate)',
                    opacity: sortKey === key ? 0.9 : 0.55,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  {label}
                  {sortKey === key && (
                    <span style={{ fontSize: '9px' }}>{sortAsc ? '▲' : '▼'}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Stage-grouped rows with stagger animation */}
            {filtered.length > 0 ? (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {(() => {
                  let lastStage = ''
                  return filtered.map((project, index) => {
                    const projectHealth = healthBySlug.get(project.slug)
                    const showStageHeader = project.stage !== lastStage
                    lastStage = project.stage ?? ''
                    const isFocused = focusedIndex === index

                    return (
                      <motion.div key={project.slug} variants={staggerItem} ref={setRowRef(index)}>
                        {/* Stage group divider — minimal, just text */}
                        {showStageHeader && sortKey === 'stage' && (
                          <div
                            className="flex items-center"
                            style={{
                              padding: '20px 16px 8px',
                              gap: '8px',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 500,
                                color: 'var(--slate)',
                                opacity: 0.55,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                flexShrink: 0,
                              }}
                            >
                              {project.stage}
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                color: 'var(--slate)',
                                opacity: 0.35,
                                flexShrink: 0,
                              }}
                            >
                              {filtered.filter((p) => p.stage === project.stage).length}
                            </span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                          </div>
                        )}

                        <Link
                          to={`/projects/${project.slug}`}
                          style={{ textDecoration: 'none', display: 'block' }}
                          onClick={() => setFocusedIndex(index)}
                        >
                          {/* Desktop: 5-column grid */}
                          <div
                            className={`project-list-row${isFocused ? ' project-row-focused' : ''} hidden sm:grid`}
                            style={{
                              gridTemplateColumns: '1fr 100px 100px 100px 72px',
                              padding: '14px 24px',
                              borderBottom: '1px solid var(--border-subtle)',
                              alignItems: 'center',
                              cursor: 'pointer',
                              transition: 'background 0.12s ease-out',
                            }}
                          >
                            {/* Title with category dot and health indicator */}
                            <div className="flex items-center gap-2.5" style={{ paddingRight: '16px' }}>
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  background: CATEGORY_DOT[project.category] ?? 'var(--slate)',
                                  flexShrink: 0,
                                  opacity: 0.7,
                                  marginTop: '-1px',
                                }}
                              />
                              <span
                                style={{
                                  fontSize: '14px',
                                  fontWeight: 500,
                                  color: 'var(--ink)',
                                  lineHeight: 1.4,
                                }}
                              >
                                {project.title}
                              </span>
                              {projectHealth && (
                                <span
                                  title={`Health: ${projectHealth.score}/100 — ${projectHealth.status}`}
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: HEALTH_STATUS_COLOR[projectHealth.status] ?? 'var(--slate)',
                                    flexShrink: 0,
                                    display: 'inline-block',
                                    marginLeft: '-4px',
                                  }}
                                />
                              )}
                              {/* Stage progress dots */}
                              <span className="inline-flex items-center gap-0.5 ml-1" title={`Stage: ${project.stage || 'Idea'}`}>
                                {STAGES.map((s, si) => {
                                  const currentIdx = STAGES.indexOf(project.stage as typeof STAGES[number]) ?? 0
                                  return (
                                    <span
                                      key={s}
                                      style={{
                                        width: 4,
                                        height: 4,
                                        borderRadius: '50%',
                                        background: si <= currentIdx ? 'var(--teal)' : 'var(--border-subtle)',
                                        opacity: si <= currentIdx ? 0.8 : 0.4,
                                      }}
                                    />
                                  )
                                })}
                              </span>
                            </div>

                            {/* Status (inline editable) */}
                            <InlineSelect
                              value={project.status || 'Active'}
                              options={[
                                { value: 'Active', label: 'Active', color: 'var(--green)' },
                                { value: 'Pending', label: 'Pending', color: 'var(--gold)' },
                                { value: 'Completed', label: 'Done', color: 'var(--slate)' },
                              ]}
                              onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { status: val } })}
                            />

                            {/* Stage (inline editable) */}
                            <InlineSelect
                              value={project.stage || 'Idea'}
                              options={STAGES.map((s) => ({ value: s, label: s }))}
                              onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { stage: val } })}
                            />

                            {/* PI (inline editable) */}
                            <div onClick={(e) => e.preventDefault()}>
                              <InlineSelect
                                value={project.pi || ''}
                                options={directors.map(d => ({ value: d.slug, label: d.name.split(' ')[1] || d.name }))}
                                onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { pi: val } })}
                              />
                            </div>

                            {/* Category (inline editable) */}
                            <div onClick={(e) => e.preventDefault()}>
                              <InlineSelect
                                value={project.category || ''}
                                options={[
                                  { value: 'clif', label: 'CLIF', color: 'var(--maroon)' },
                                  { value: 'lab', label: 'Lab', color: 'var(--teal)' },
                                  { value: 'nate', label: 'Mesfin', color: 'var(--gold)' },
                                  { value: 'mentee', label: 'Mentee', color: 'var(--slate)' },
                                ]}
                                onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { category: val } })}
                              />
                            </div>
                          </div>

                          {/* Mobile: stacked card layout */}
                          <div
                            className={`project-list-row${isFocused ? ' project-row-focused' : ''} sm:hidden`}
                            style={{
                              padding: '12px 16px',
                              borderBottom: '1px solid var(--border-subtle)',
                              cursor: 'pointer',
                              transition: 'background 0.12s ease-out',
                            }}
                          >
                            {/* Title row */}
                            <div className="flex items-start gap-2" style={{ marginBottom: '8px' }}>
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  background: CATEGORY_DOT[project.category] ?? 'var(--slate)',
                                  flexShrink: 0,
                                  opacity: 0.7,
                                  marginTop: '6px',
                                }}
                              />
                              <span
                                style={{
                                  fontSize: '14px',
                                  fontWeight: 500,
                                  color: 'var(--ink)',
                                  lineHeight: 1.4,
                                  flex: 1,
                                }}
                              >
                                {project.title}
                              </span>
                              {projectHealth && (
                                <span
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: HEALTH_STATUS_COLOR[projectHealth.status] ?? 'var(--slate)',
                                    flexShrink: 0,
                                    marginTop: '6px',
                                  }}
                                />
                              )}
                            </div>
                            {/* Metadata row */}
                            <div className="flex items-center gap-3" style={{ paddingLeft: '14px' }}>
                              <InlineSelect
                                value={project.status || 'Active'}
                                options={[
                                  { value: 'Active', label: 'Active', color: 'var(--green)' },
                                  { value: 'Pending', label: 'Pending', color: 'var(--gold)' },
                                  { value: 'Completed', label: 'Done', color: 'var(--slate)' },
                                ]}
                                onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { status: val } })}
                              />
                              <InlineSelect
                                value={project.stage || 'Idea'}
                                options={STAGES.map((s) => ({ value: s, label: s }))}
                                onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { stage: val } })}
                              />
                              <div onClick={(e) => e.preventDefault()} style={{ marginLeft: 'auto' }}>
                                <InlineSelect
                                  value={project.category || ''}
                                  options={[
                                    { value: 'clif', label: 'CLIF', color: 'var(--maroon)' },
                                    { value: 'lab', label: 'Lab', color: 'var(--teal)' },
                                    { value: 'nate', label: 'Mesfin', color: 'var(--gold)' },
                                    { value: 'mentee', label: 'Mentee', color: 'var(--slate)' },
                                  ]}
                                  onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { category: val } })}
                                />
                              </div>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    )
                  })
                })()}
              </motion.div>
            ) : (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    color: 'var(--slate)',
                    opacity: 0.55,
                  }}
                >
                  No projects in this category
                </span>
              </div>
            )}

            {/* Calculations row */}
            {filtered.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: 20,
                  padding: '8px 24px',
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'rgba(45, 138, 138, 0.02)',
                }}
              >
                {[
                  { label: 'Count', value: filtered.length },
                  ...Object.entries(
                    filtered.reduce((acc, p) => {
                      const stage = p.stage || 'Unknown'
                      acc[stage] = (acc[stage] || 0) + 1
                      return acc
                    }, {} as Record<string, number>)
                  ).map(([stage, count]) => ({ label: stage, value: count })),
                ].map(s => (
                  <span key={s.label} style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
                    {s.label}{' '}
                    <span style={{ fontWeight: 600, opacity: 1 }}>{s.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── PIPELINE VIEW ─── */}
        {viewMode === 'pipeline' && (
          <>
            {/* Stage progression line (desktop) */}
            <div
              className="hidden md:block mb-2"
              style={{ position: 'relative', height: '2px' }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '2%',
                  right: '2%',
                  height: '2px',
                  background: 'linear-gradient(to right, rgba(45,138,138,0.1), var(--teal), rgba(45,138,138,0.1))',
                  borderRadius: '1px',
                }}
              />
              {STAGES.map((_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    left: `${(i / (STAGES.length - 1)) * 96 + 2}%`,
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--teal)',
                    border: '2px solid var(--cream)',
                  }}
                />
              ))}
            </div>

            {/* Pipeline columns */}
            <div
              className="pipeline-board"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${STAGES.length}, minmax(200px, 1fr))`,
                gap: '20px',
                overflowX: 'auto',
                paddingBottom: '1rem',
              }}
            >
              {STAGES.map((stage) => {
                const stageProjects = getStageProjects(stage, filtered)
                return (
                  <div
                    key={stage}
                    className="pipeline-column"
                    style={{
                      background: '#f5f5f5',
                      borderRadius: '12px',
                      borderTop: '2px solid var(--teal)',
                      padding: '16px',
                      minHeight: '300px',
                      minWidth: '200px',
                    }}
                  >
                    {/* Column header */}
                    <div style={{ marginBottom: '14px' }}>
                      <div className="flex items-center justify-between">
                        <h3
                          style={{
                            fontWeight: 400,
                            fontSize: '13px',
                            color: 'var(--ink)',
                            margin: 0,
                          }}
                        >
                          {stage}
                        </h3>
                        <span
                          style={{
                            fontSize: '12px',
                            color: 'var(--slate)',
                            opacity: 0.55,
                            fontWeight: 500,
                          }}
                        >
                          {stageProjects.length}
                        </span>
                      </div>
                    </div>

                    {/* Cards with stagger animation */}
                    <motion.div
                      className="flex flex-col"
                      style={{ gap: '12px' }}
                      variants={staggerContainer}
                      initial="hidden"
                      animate="visible"
                    >
                      <AnimatePresence mode="popLayout">
                        {stageProjects.length > 0 ? (
                          stageProjects.map((project) => (
                            <motion.div key={project.slug} variants={staggerItem}>
                              <ProjectCard
                                project={project}
                              />
                            </motion.div>
                          ))
                        ) : (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                              padding: '32px 12px',
                              textAlign: 'center',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '12px',
                                color: 'var(--slate)',
                                opacity: 0.5,
                              }}
                            >
                              No projects
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Create Project Modal */}
      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(input) => createProject.mutate(input)}
      />

      {/* Scoped styles */}
      <style>{`
        .pipeline-board {
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--teal) transparent;
        }
        .pipeline-board::-webkit-scrollbar {
          height: 6px;
        }
        .pipeline-board::-webkit-scrollbar-track {
          background: transparent;
        }
        .pipeline-board::-webkit-scrollbar-thumb {
          background: rgba(45, 138, 138, 0.3);
          border-radius: 3px;
        }

        .project-list-row:hover {
          background: rgba(201, 168, 76, 0.06) !important;
          transition: background 0.12s ease-out !important;
        }
        .project-list-row:active {
          background: rgba(201, 168, 76, 0.10) !important;
          transition: background 0.05s ease-out !important;
        }

        .project-row-focused {
          position: relative;
          background: rgba(201, 168, 76, 0.04) !important;
        }
        .project-row-focused::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--gold);
          border-radius: 0 1px 1px 0;
        }

        .new-project-btn:hover {
          background: rgba(45, 138, 138, 0.06) !important;
        }

        .filter-pill:hover {
          background: rgba(15, 25, 35, 0.04);
        }

        /* Dark mode overrides */
        .dark .pipeline-column {
          background: #162535 !important;
        }
        .dark .project-card {
          background: #0f1923 !important;
        }
        .dark .project-card:hover {
          background: #1a2a3a !important;
        }
        .dark .project-row-focused {
          background: rgba(201, 168, 76, 0.06) !important;
        }
        .dark .project-list-row:hover {
          background: rgba(201, 168, 76, 0.08) !important;
        }
        .dark .project-list-row:active {
          background: rgba(201, 168, 76, 0.12) !important;
        }
      `}</style>
    </div>
  )
}

