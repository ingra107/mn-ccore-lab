import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderKanban, GitBranch, Plus, List, LayoutGrid, Star } from 'lucide-react'
import { useDensity, densityClass } from '../components/DensityToggle'
import { stageIndex, toApiStage } from '../lib/stageNormalize'
import { usePageMeta } from '../hooks/usePageMeta'
import { useProjects, useDependencies, useProjectHealth, useTasks } from '../hooks/useApiData'
import { useCreateProject } from '../hooks/useMutations'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProject } from '../lib/api'
import InlineSelect from '../components/InlineSelect'
import { PROJECT_STATUS_OPTIONS, normalizeProjectStatus, isProjectActive } from '../lib/taskConstants'
import ProjectCard from '../components/ProjectCard'
import ProjectDependencyMap from '../components/ProjectDependencyMap'
import CreateProjectModal from '../components/CreateProjectModal'
import DataPage from '../components/DataPage'
import { ColumnHeader, TableContainer } from '../components/table'
import { directors } from '../data/team'
import { displayName } from '../lib/nameUtils'
import type { Project } from '../data/types'
import { useProjectKeyboardNav } from '../hooks/useProjectKeyboardNav'
import { staggerContainer, staggerItem } from '../lib/animations'
import PageTooltip from '../components/PageTooltip'
import { stripConsortiumPrefix } from '../lib/textUtils'
import { PATHS } from '../constants/paths'

// Values are D1 lowercase canonical; labels are Title Case for display.
const STAGES = ['idea', 'data_collection', 'analysis', 'writing', 'review', 'revisions', 'published'] as const
type Stage = (typeof STAGES)[number]
const STAGE_LABELS: Record<Stage, string> = {
  idea: 'Idea',
  data_collection: 'Data Collection',
  analysis: 'Analysis',
  writing: 'Writing',
  review: 'Review',
  revisions: 'Revisions',
  published: 'Published',
}

// Stage 4 #12-followup (2026-05-08): 3-bucket canonical categories.
// 'stale' is a pseudo-filter (health score < 50) not a real category value.
const CATEGORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'MNCCORE', label: 'MN-CCORE' },
  { key: 'CLIF', label: 'CLIF' },
  { key: 'Peripheral Brain', label: 'Peripheral Brain' },
  { key: 'stale', label: 'Needs Attention' },
] as const

const CATEGORY_DOT: Record<string, string> = {
  // Canonical 3-bucket
  MNCCORE: 'var(--teal)',
  CLIF: 'var(--maroon)',
  'Peripheral Brain': 'var(--slate)',
  // Legacy fallbacks for soft-deleted rows
  clif: 'var(--maroon)',
  lab: 'var(--teal)',
  nate: 'var(--orange)',
  mentee: 'var(--gold)',
}

const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, i]))

// S19: PI dropdown options. Directors are the canonical choices; if the current
// PI value is a non-director slug (legacy "nick", a bare email, a non-director
// member), prepend a resolved option so InlineSelect renders a clean display
// name instead of the raw slug.
function piOptions(currentPi?: string | null): { value: string; label: string }[] {
  const base = directors.map((d) => ({ value: d.slug, label: displayName(d.slug, 'display') }))
  const pi = (currentPi || '').trim()
  if (pi && !base.some((o) => o.value === pi)) {
    return [{ value: pi, label: displayName(pi, 'display') }, ...base]
  }
  return base
}

const HEALTH_STATUS_COLOR: Record<string, string> = {
  'Healthy': 'var(--green)',
  'Needs Attention': 'var(--gold)',
  'At Risk': 'var(--orange)',
  'Critical': 'var(--maroon)',
}

function getStageProjects(stage: Stage, filtered: Project[]): Project[] {
  return filtered.filter((p) => p.stage === stage)
}

export default function Projects() {
  usePageMeta(
    'Research Pipeline | MN-CCORE',
    'Track MN-CCORE research projects from idea to publication across MN-CCORE, CLIF, and Peripheral Brain buckets.'
  )

  const { data: projects = [] } = useProjects()
  const { data: allTasks = [] } = useTasks()
  const { data: dependencies = [] } = useDependencies()
  const { data: healthData } = useProjectHealth()

  // Task counts per project
  const taskCountByProject = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of allTasks) {
      if (t.project_id && !t.completed) {
        map.set(t.project_id, (map.get(t.project_id) || 0) + 1)
      }
    }
    return map
  }, [allTasks])

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
  const [density, setDensity] = useDensity()
  // S10: category is URL-backed so ⌘K "Filter CLIF Projects" (which navigates
  // to PATHS.projects + '?category=CLIF') lands pre-filtered, and saved/shared
  // links round-trip. Same pattern ManuscriptsPage uses. Absent param = 'all'.
  const [searchParams, setSearchParams] = useSearchParams()
  const VALID_CATEGORY_KEYS = useMemo(() => new Set(CATEGORY_FILTERS.map((f) => f.key as string)), [])
  const categoryParam = searchParams.get('category')
  const activeCategory = categoryParam && VALID_CATEGORY_KEYS.has(categoryParam) ? categoryParam : 'all'
  const setActiveCategory = useCallback((next: string) => {
    setSearchParams((prev) => {
      const out = new URLSearchParams(prev)
      if (next && next !== 'all') out.set('category', next)
      else out.delete('category')
      return out
    }, { replace: true })
  }, [setSearchParams])
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list')
  const [showDeps, setShowDeps] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  type ProjectSortKey = 'title' | 'status' | 'stage' | 'pi' | 'category'
  const [sortKey, setSortKey] = useState<ProjectSortKey>('stage')
  const [sortAsc, setSortAsc] = useState(true)
  const [pinnedSlugs, setPinnedSlugs] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('pinned-projects') || '[]')) } catch { return new Set() }
  })
  const togglePin = (slug: string) => {
    setPinnedSlugs(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug); else next.add(slug)
      localStorage.setItem('pinned-projects', JSON.stringify([...next]))
      return next
    })
  }
  const toggleSort = (key: ProjectSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const filtered = useMemo(() => {
    let base: typeof projects
    if (activeCategory === 'all') base = projects
    else if (activeCategory === 'stale') {
      base = projects.filter(p => {
        const h = healthBySlug.get(p.slug)
        return isProjectActive(p.status) && (!h || h.score < 50)
      })
    }
    else base = projects.filter((p) => p.category === activeCategory)
    return [...base].sort((a, b) => {
      // Pinned always first
      const aPinned = pinnedSlugs.has(a.slug) ? 0 : 1
      const bPinned = pinnedSlugs.has(b.slug) ? 0 : 1
      if (aPinned !== bPinned) return aPinned - bPinned
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
  }, [activeCategory, projects, sortKey, sortAsc, pinnedSlugs])

  // Project slugs in display order for keyboard nav
  const projectSlugs = useMemo(() => filtered.map((p) => p.slug), [filtered])

  // Reset focus when filter/view changes
  useEffect(() => { setFocusedIndex(-1) }, [activeCategory, viewMode])

  // Dynamic page title
  useEffect(() => {
    const active = projects.filter(p => isProjectActive(p.status)).length
    document.title = `Projects (${active} active) | MN-CCORE`
    return () => { document.title = 'MN-CCORE Lab Hub' }
  }, [projects])

  // Keyboard navigation (list view only)
  useProjectKeyboardNav({
    projectCount: filtered.length,
    focusedIndex,
    setFocusedIndex,
    slugs: projectSlugs,
    enabled: viewMode === 'list' && !showCreate,
    togglePin,
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

  // Summary stats — 3-bucket canonical (Stage 4 #12-followup, 2026-05-08)
  const totalCount = projects.length
  const mncoreCount = projects.filter((p) => p.category === 'MNCCORE').length
  const clifCount = projects.filter((p) => p.category === 'CLIF').length
  const pbCount = projects.filter((p) => p.category === 'Peripheral Brain').length


  return (
    <>
    <DataPage
      icon={<FolderKanban size={20} />}
      title="Research Pipeline"
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
            transition: 'background 0.15s',
          }}
        >
          <Plus size={14} />
          New Project
        </button>
      }
      views={[
        { key: 'list', icon: <List size={14} />, label: 'List' },
        { key: 'pipeline', icon: <LayoutGrid size={14} />, label: 'Pipeline' },
      ]}
      activeView={viewMode}
      onViewChange={(v) => setViewMode(v as 'list' | 'pipeline')}
      filters={
        <>
          <PageTooltip id="projects-pipeline-hint" text="Try Pipeline view for a visual overview" />
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveCategory(f.key)}
              className="cursor-pointer inline-flex items-center px-2.5 py-1 text-xs filter-pill"
              style={{
                fontWeight: 'var(--label-weight)',
                fontSize: 'var(--label-size)',
                borderRadius: 'var(--radius-md)',
                background: activeCategory === f.key ? 'var(--teal-solid)' : 'transparent',
                color: activeCategory === f.key ? 'var(--ink-bright, #fff)' : 'var(--slate)',
                border: activeCategory === f.key ? '1px solid var(--teal)' : '1px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {f.label}
            </button>
          ))}
        </>
      }
      rightExtra={
        <>
          <span
            className="text-xs"
            style={{
              color: 'var(--slate)',
              whiteSpace: 'nowrap',
            }}
          >
              {totalCount} projects &middot; {mncoreCount} MN-CCORE &middot; {clifCount} CLIF{pbCount > 0 ? ` \u00b7 ${pbCount} PB` : ''}
          </span>
          {viewMode === 'pipeline' && (
            <button
              type="button"
              onClick={() => setShowDeps(!showDeps)}
              className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
              style={{
                fontSize: 'var(--label-size)',
                fontWeight: 'var(--label-weight)',
                background: showDeps ? 'var(--teal-solid)' : 'transparent',
                color: showDeps ? 'var(--ink-bright, #fff)' : 'var(--teal)',
                border: '1px solid rgba(45, 138, 138, 0.2)',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              <GitBranch size={12} />
              Dependencies
            </button>
          )}
        </>
      }
      showDensity
      density={density}
      onDensityChange={setDensity}
      beforeBody={
        /* Dependency map (collapsible, pipeline only) */
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
      }
    >
        {/* ─── LIST VIEW ─── */}
        {viewMode === 'list' && (
          <TableContainer className={densityClass(density)}>

            {/* Table header */}
            <div
              className="hidden md:grid"
              style={{
                gridTemplateColumns: 'minmax(320px, 3fr) 110px 110px 120px 80px',
                padding: 'var(--sp-sm) var(--sp-xl)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              {([['Title', 'title'], ['Status', 'status'], ['Stage', 'stage'], ['PI', 'pi'], ['Group', 'category']] as const).map(([label, key]) => (
                <ColumnHeader
                  key={key}
                  label={label}
                  sortKey={key}
                  currentSort={sortKey}
                  sortAsc={sortAsc}
                  onSort={(k) => toggleSort(k as ProjectSortKey)}
                />
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
                              gap: 'var(--sp-sm)',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 'var(--label-size)',
                                fontWeight: 'var(--label-weight)',
                                color: 'var(--slate)',
                                opacity: 'var(--ink-label)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                flexShrink: 0,
                              }}
                            >
                              {project.stage}
                            </span>
                            <span
                              style={{
                                fontSize: 'var(--label-size)',
                                color: 'var(--slate)',
                                opacity: 0.75,
                                flexShrink: 0,
                              }}
                            >
                              {filtered.filter((p) => p.stage === project.stage).length}
                            </span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                          </div>
                        )}

                        <Link
                          to={PATHS.project(project.slug)}
                          style={{ textDecoration: 'none', display: 'block' }}
                          onClick={() => setFocusedIndex(index)}
                        >
                          {/* Desktop: 5-column grid */}
                          <div
                            className={`project-list-row${isFocused ? ' project-row-focused' : ''} hidden md:grid`}
                            style={{
                              gridTemplateColumns: 'minmax(320px, 3fr) 110px 110px 120px 80px',
                              padding: `var(--row-padding-y) 24px`,
                              borderBottom: '1px solid var(--border-subtle)',
                              alignItems: 'center',
                              cursor: 'pointer',
                              transition: 'background 0.12s ease-out',
                            }}
                          >
                            {/* Title with pin star, category dot, and health indicator */}
                            <div className="flex items-center gap-2.5" style={{ paddingRight: '16px' }}>
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(project.slug) }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: 0,
                                  flexShrink: 0,
                                  color: pinnedSlugs.has(project.slug) ? 'var(--gold)' : 'var(--slate)',
                                  opacity: pinnedSlugs.has(project.slug) ? 1 : 0.15,
                                  transition: 'opacity 150ms ease, color 150ms ease',
                                  lineHeight: 0,
                                }}
                                onMouseOver={(e) => { if (!pinnedSlugs.has(project.slug)) e.currentTarget.style.opacity = '0.5' }}
                                onMouseOut={(e) => { if (!pinnedSlugs.has(project.slug)) e.currentTarget.style.opacity = '0.15' }}
                                title={pinnedSlugs.has(project.slug) ? 'Unpin project' : 'Pin to top'}
                              >
                                <Star size={12} fill={pinnedSlugs.has(project.slug) ? 'var(--gold)' : 'none'} />
                              </button>
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 'var(--radius-circle)',
                                  background: CATEGORY_DOT[project.category] ?? 'var(--slate)',
                                  flexShrink: 0,
                                  opacity: 0.85,
                                  marginTop: '-1px',
                                }}
                              />
                              <span
                                style={{
                                  fontSize: '14px',
                                  fontWeight: 500,
                                  color: 'var(--ink)',
                                  lineHeight: 1.35,
                                }}
                              >
                                {stripConsortiumPrefix(project.title).clean}
                                {project.short_name && (
                                  <span style={{
                                    fontSize: '11px',
                                    color: 'var(--slate)',
                                    opacity: 0.75,
                                    display: 'block',
                                    marginTop: '1px',
                                  }}>
                                    {project.short_name}
                                  </span>
                                )}
                              </span>
                              {/* Task count badge */}
                              {(() => {
                                const tc = taskCountByProject.get(project.slug) || 0
                                return tc > 0 ? (
                                  <span style={{ fontSize: '10px', color: 'var(--teal)', flexShrink: 0 }} title={`${tc} open task${tc !== 1 ? 's' : ''}`}>
                                    {tc}
                                  </span>
                                ) : null
                              })()}
                              {projectHealth && (
                                <span
                                  title={`Health: ${projectHealth.score}/100 — ${projectHealth.status}`}
                                  className="inline-flex items-center gap-1"
                                  style={{ flexShrink: 0, marginLeft: '-2px' }}
                                >
                                  <span style={{
                                    width: 24,
                                    height: 4,
                                    borderRadius: 'var(--radius-sm)',
                                    background: 'var(--border-subtle)',
                                    overflow: 'hidden',
                                    display: 'inline-block',
                                  }}>
                                    <span style={{
                                      display: 'block',
                                      width: `${Math.min(projectHealth.score, 100)}%`,
                                      height: '100%',
                                      borderRadius: 'var(--radius-sm)',
                                      background: HEALTH_STATUS_COLOR[projectHealth.status] ?? 'var(--slate)',
                                      transition: 'width 300ms ease',
                                    }} />
                                  </span>
                                </span>
                              )}
                              {/* Stage progress dots */}
                              <span className="inline-flex items-center gap-0.5 ml-1" title={`Stage: ${project.stage || 'idea'}`}>
                                {STAGES.map((s, si) => {
                                  // Brain.db granular stages → 6-stage canonical (P2-R2-14)
                                  const currentIdx = stageIndex(project.stage)
                                  return (
                                    <span
                                      key={s}
                                      style={{
                                        width: 4,
                                        height: 4,
                                        borderRadius: 'var(--radius-circle)',
                                        background: si <= currentIdx ? 'var(--teal-solid)' : 'var(--border-subtle)',
                                        opacity: si <= currentIdx ? 0.8 : 0.85,
                                      }}
                                    />
                                  )
                                })}
                              </span>
                              {/* Last activity / staleness indicator */}
                              {project.lastActivity && (() => {
                                const days = Math.floor((Date.now() - new Date(project.lastActivity!).getTime()) / 86400000)
                                if (days < 7) return null
                                return (
                                  <span style={{
                                    fontSize: '10px',
                                    color: days > 30 ? 'var(--maroon)' : days > 14 ? 'var(--orange)' : 'var(--slate)',
                                    opacity: 0.85,
                                    flexShrink: 0,
                                  }} title={`Last activity ${days} days ago`}>
                                    {days}d ago
                                  </span>
                                )
                              })()}
                            </div>

                            {/* Status (inline editable) */}
                            <InlineSelect
                              value={normalizeProjectStatus(project.status)}
                              options={PROJECT_STATUS_OPTIONS}
                              onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { status: val } })}
                            />

                            {/* Stage (inline editable) */}
                            <InlineSelect
                              value={project.stage || 'idea'}
                              options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
                              onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { stage: toApiStage(val) } })}
                            />

                            {/* PI (inline editable) — S19: resolve the current
                                value through displayName so a non-director slug
                                (e.g. "nick") never renders raw in the cell. */}
                            <div onClick={(e) => e.preventDefault()}>
                              <InlineSelect
                                value={project.pi || ''}
                                options={piOptions(project.pi)}
                                onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { pi: val } })}
                              />
                            </div>

                            {/* Category (inline editable) — 3-bucket canonical */}
                            <div onClick={(e) => e.preventDefault()}>
                              <InlineSelect
                                value={project.category || ''}
                                options={[
                                  { value: 'MNCCORE', label: 'MN-CCORE', color: 'var(--teal)' },
                                  { value: 'CLIF', label: 'CLIF', color: 'var(--maroon)' },
                                  { value: 'Peripheral Brain', label: 'Peripheral Brain', color: 'var(--slate)' },
                                ]}
                                onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { category: val } })}
                              />
                            </div>
                          </div>

                          {/* Mobile: stacked card layout */}
                          <div
                            className={`project-list-row${isFocused ? ' project-row-focused' : ''} md:hidden`}
                            style={{
                              padding: `var(--row-padding-y) 16px`,
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
                                  borderRadius: 'var(--radius-circle)',
                                  background: CATEGORY_DOT[project.category] ?? 'var(--slate)',
                                  flexShrink: 0,
                                  opacity: 0.85,
                                  marginTop: '6px',
                                }}
                              />
                              <span
                                style={{
                                  fontSize: '14px',
                                  fontWeight: 500,
                                  color: 'var(--ink)',
                                  lineHeight: 1.35,
                                  flex: 1,
                                }}
                              >
                                {stripConsortiumPrefix(project.title).clean}
                                {project.short_name && (
                                  <span style={{
                                    fontSize: '11px',
                                    color: 'var(--slate)',
                                    opacity: 0.75,
                                    display: 'block',
                                    marginTop: '1px',
                                  }}>
                                    {project.short_name}
                                  </span>
                                )}
                              </span>
                              {projectHealth && (
                                <span
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: 'var(--radius-circle)',
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
                                value={normalizeProjectStatus(project.status)}
                                options={PROJECT_STATUS_OPTIONS}
                                onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { status: val } })}
                              />
                              <InlineSelect
                                value={project.stage || 'idea'}
                                options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
                                onChange={(val) => inlineUpdate.mutate({ slug: project.slug, fields: { stage: toApiStage(val) } })}
                              />
                              <div onClick={(e) => e.preventDefault()} style={{ marginLeft: 'auto' }}>
                                <InlineSelect
                                  value={project.category || ''}
                                  options={[
                                    { value: 'MNCCORE', label: 'MN-CCORE', color: 'var(--teal)' },
                                    { value: 'CLIF', label: 'CLIF', color: 'var(--maroon)' },
                                    { value: 'Peripheral Brain', label: 'Peripheral Brain', color: 'var(--slate)' },
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
                    opacity: 'var(--ink-label)',
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
                  gap: 'var(--sp-xl)',
                  padding: 'var(--sp-sm) var(--sp-xl)',
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'var(--teal-hover)',
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
                  <span key={s.label} style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                    {s.label}{' '}
                    <span style={{ fontWeight: 600, opacity: 1 }}>{s.value}</span>
                  </span>
                ))}
              </div>
            )}
          </TableContainer>
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
                  borderRadius: 'var(--radius-sm)',
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
                    borderRadius: 'var(--radius-circle)',
                    background: 'var(--teal-solid)',
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
                gridTemplateColumns: `repeat(${STAGES.length}, minmax(160px, 1fr))`,
                gap: 'var(--sp-lg)',
                overflowX: 'auto',
                paddingBottom: '1rem',
                maxWidth: '100%',
              }}
            >
              {STAGES.map((stage) => {
                const stageProjects = getStageProjects(stage, filtered)
                return (
                  <div
                    key={stage}
                    className="pipeline-column"
                    style={{
                      background: 'var(--ice)',
                      borderRadius: 'var(--radius-xl)',
                      borderTop: '2px solid var(--teal)',
                      padding: 'var(--sp-lg)',
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
                            fontSize: 'var(--label-size)',
                            color: 'var(--slate)',
                            opacity: 'var(--ink-label)',
                            fontWeight: 'var(--label-weight)',
                          }}
                        >
                          {stageProjects.length}
                        </span>
                      </div>
                    </div>

                    {/* Cards with stagger animation */}
                    <motion.div
                      className="flex flex-col"
                      style={{ gap: 'var(--sp-md)' }}
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
                              padding: 'var(--sp-2xl) var(--sp-md)',
                              textAlign: 'center',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 'var(--label-size)',
                                color: 'var(--slate)',
                                opacity: 'var(--ink-label)',
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
      </DataPage>

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
          background: var(--gold-hover) !important;
          transition: background 0.12s ease-out !important;
        }
        .project-list-row:active {
          background: var(--gold-active) !important;
          transition: background 0.05s ease-out !important;
        }

        .project-row-focused {
          position: relative;
          background: var(--gold-hover) !important;
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
          background: var(--teal-hover) !important;
        }

        .filter-pill:hover {
          background: rgba(15, 25, 35, 0.04);
        }

        /* Dark mode overrides */
        .dark .pipeline-column {
          background-color: var(--cream) !important; background-image: linear-gradient(var(--surface-2), var(--surface-2)) !important;
        }
        .dark .project-card {
          background-color: var(--cream) !important; background-image: linear-gradient(var(--surface-1), var(--surface-1)) !important;
        }
        .dark .project-card:hover {
          background-image: linear-gradient(var(--surface-3), var(--surface-3)) !important;
        }
        .dark .project-row-focused {
          background: var(--gold-hover) !important;
        }
        .dark .project-list-row:hover {
          background: var(--gold-active) !important;
        }
        .dark .project-list-row:active {
          background: var(--gold-emphasis) !important;
        }
      `}</style>
    </>
  )
}

