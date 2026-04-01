import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderKanban, GitBranch, Plus, List, LayoutGrid } from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { useProjects, useDependencies } from '../hooks/useApiData'
import { useCreateProject } from '../hooks/useMutations'
import ProjectCard from '../components/ProjectCard'
import ProjectDependencyMap from '../components/ProjectDependencyMap'
import CreateProjectModal from '../components/CreateProjectModal'
import Avatar from '../components/Avatar'
import { directors, getAllMembers } from '../data/team'
import type { Project } from '../data/types'
import type { Stage } from '../components/StageSelector'

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

const CATEGORY_LABEL: Record<string, string> = {
  clif: 'CLIF',
  lab: 'Lab',
  nate: 'Mesfin',
  mentee: 'Mentee',
}

function getPiInfo(slug: string) {
  const director = directors.find((d) => d.slug === slug)
  if (director) return { name: director.name, initials: director.initials, photoUrl: director.photoUrl }
  const member = getAllMembers().find((m) => m.slug === slug)
  if (member) return { name: member.name, initials: member.initials, photoUrl: member.photoUrl }
  return { name: slug, initials: slug.slice(0, 2).toUpperCase(), photoUrl: undefined }
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
  const createProject = useCreateProject()
  const headerRef = useScrollReveal<HTMLDivElement>()
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list')
  const [showDeps, setShowDeps] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  // Sort by stage pipeline order, then alphabetically within stage
  const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, i]))

  const filtered = useMemo(() => {
    const base = activeCategory === 'all' ? projects : projects.filter((p) => p.category === activeCategory)
    return [...base].sort((a, b) => {
      const stageA = STAGE_ORDER[a.stage ?? ''] ?? 99
      const stageB = STAGE_ORDER[b.stage ?? ''] ?? 99
      if (stageA !== stageB) return stageA - stageB
      return a.title.localeCompare(b.title)
    })
  }, [activeCategory, projects])

  // Summary stats
  const totalCount = projects.length
  const clifCount = projects.filter((p) => p.category === 'clif').length
  const labCount = projects.filter((p) => p.category === 'lab').length
  const nateCount = projects.filter((p) => p.category === 'nate').length
  const menteeCount = projects.filter((p) => p.category === 'mentee').length


  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        {/* Page Header */}
        <div ref={headerRef} className="fade-in-up" style={{ marginBottom: '1.5rem', paddingTop: '1.5rem' }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.1)', flexShrink: 0 }}>
              <FolderKanban size={19} style={{ color: 'var(--teal)' }} />
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                color: 'var(--ink)',
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              Research Pipeline
            </h1>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg ml-auto"
              style={{
                background: 'var(--teal)',
                color: '#faf8f3',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Plus size={14} />
              New Project
            </button>
          </div>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '15px',
              color: 'var(--slate)',
              opacity: 0.6,
              marginTop: '6px',
            }}
          >
            Track projects from idea to publication
          </p>

          {/* Separator */}
          <div
            style={{
              height: '1px',
              background: 'var(--border-subtle)',
              marginTop: '1.25rem',
            }}
          />
        </div>

        {/* Controls bar: view toggle + filters + stats */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
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
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  background: viewMode === 'list' ? 'var(--teal)' : 'transparent',
                  color: viewMode === 'list' ? '#faf8f3' : 'var(--slate)',
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
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  background: viewMode === 'pipeline' ? 'var(--teal)' : 'transparent',
                  color: viewMode === 'pipeline' ? '#faf8f3' : 'var(--slate)',
                  border: 'none',
                  transition: 'all 0.15s',
                }}
              >
                <LayoutGrid size={14} />
                Pipeline
              </button>
            </div>

            {/* Category filter pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setActiveCategory(f.key)}
                  className="cursor-pointer inline-flex items-center px-2.5 py-1 rounded-full text-xs"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    fontSize: '12px',
                    background: activeCategory === f.key ? 'var(--teal)' : 'transparent',
                    color: activeCategory === f.key ? '#faf8f3' : 'var(--slate)',
                    border: activeCategory === f.key ? '1px solid var(--teal)' : '1px solid var(--border-subtle)',
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
                fontFamily: 'var(--font-body)',
                color: 'var(--slate)',
                opacity: 0.5,
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
                  fontFamily: 'var(--font-body)',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: showDeps ? 'var(--teal)' : 'transparent',
                  color: showDeps ? '#faf8f3' : 'var(--teal)',
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
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{ overflow: 'hidden', marginBottom: '1.5rem', position: 'relative' }}
            >
              <ProjectDependencyMap projects={filtered} dependencies={dependencies} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── LIST VIEW ─── */}
        {viewMode === 'list' && (
          <div
            style={{
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            {/* Table header */}
            <div
              className="hidden sm:grid"
              style={{
                gridTemplateColumns: '1fr 140px 80px',
                padding: '10px 24px',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              {['Title', 'PI', 'Group'].map((col) => (
                <span
                  key={col}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'var(--slate)',
                    opacity: 0.35,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {col}
                </span>
              ))}
            </div>

            {/* Stage-grouped rows */}
            {filtered.length > 0 ? (
              (() => {
                let lastStage = ''
                return filtered.map((project) => {
                  const pi = getPiInfo(project.pi)
                  const catLabel = CATEGORY_LABEL[project.category] ?? project.category
                  const showStageHeader = project.stage !== lastStage
                  lastStage = project.stage ?? ''

                  return (
                    <div key={project.slug}>
                      {/* Stage group divider — minimal, just text */}
                      {showStageHeader && (
                        <div
                          style={{
                            padding: '14px 24px 6px',
                            ...(lastStage !== (STAGES[0] as string) ? { borderTop: '1px solid var(--border-subtle)' } : {}),
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '11px',
                              fontWeight: 500,
                              color: 'var(--slate)',
                              opacity: 0.5,
                              letterSpacing: '0.03em',
                            }}
                          >
                            {project.stage}
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '11px',
                              color: 'var(--slate)',
                              opacity: 0.3,
                              marginLeft: '6px',
                            }}
                          >
                            {filtered.filter((p) => p.stage === project.stage).length}
                          </span>
                        </div>
                      )}

                      <Link
                        to={`/projects/${project.slug}`}
                        style={{ textDecoration: 'none', display: 'block' }}
                      >
                        <div
                          className="project-list-row"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 140px 80px',
                            padding: '12px 24px',
                            borderBottom: '1px solid var(--border-subtle)',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          {/* Title with category dot */}
                          <div className="flex items-center gap-2.5" style={{ paddingRight: '16px' }}>
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: CATEGORY_DOT[project.category] ?? 'var(--slate)',
                                flexShrink: 0,
                                opacity: 0.5,
                              }}
                            />
                            <span
                              style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: 'var(--ink)',
                                lineHeight: 1.4,
                              }}
                            >
                              {project.title}
                            </span>
                          </div>

                          {/* PI */}
                          <div className="flex items-center gap-2">
                            <div style={{ width: 24, height: 24, flexShrink: 0 }}>
                              <Avatar
                                name={pi.name}
                                initials={pi.initials}
                                photoUrl={pi.photoUrl}
                                size="sm"
                                variant="ice"
                                className="!w-6 !h-6 !min-w-0 !min-h-0 !text-[9px]"
                              />
                            </div>
                            <span
                              style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: '13px',
                                color: 'var(--slate)',
                                opacity: 0.7,
                              }}
                            >
                              {pi.name.split(' ').pop()}
                            </span>
                          </div>

                          {/* Category — small muted pill */}
                          <span
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '11px',
                              color: 'var(--slate)',
                              opacity: 0.5,
                            }}
                          >
                            {catLabel}
                          </span>
                        </div>
                      </Link>
                    </div>
                  )
                })
              })()
            ) : (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px',
                    color: 'var(--slate)',
                    opacity: 0.4,
                  }}
                >
                  No projects in this category
                </span>
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
                gap: '16px',
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
                      background: 'var(--ice)',
                      borderRadius: '12px',
                      borderTop: '2px solid var(--teal)',
                      padding: '16px 14px',
                      minHeight: '300px',
                      minWidth: '200px',
                    }}
                  >
                    {/* Column header */}
                    <div style={{ marginBottom: '14px' }}>
                      <div className="flex items-center justify-between">
                        <h3
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontWeight: 600,
                            fontSize: '13px',
                            color: 'var(--ink)',
                            margin: 0,
                          }}
                        >
                          {stage}
                        </h3>
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '12px',
                            color: 'var(--slate)',
                            opacity: 0.4,
                            fontWeight: 500,
                          }}
                        >
                          {stageProjects.length}
                        </span>
                      </div>
                    </div>

                    {/* Cards */}
                    <div className="flex flex-col" style={{ gap: '12px' }}>
                      <AnimatePresence mode="popLayout">
                        {stageProjects.length > 0 ? (
                          stageProjects.map((project) => (
                            <ProjectCard
                              key={project.slug}
                              project={project}
                            />
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
                                fontFamily: 'var(--font-body)',
                                fontSize: '12px',
                                color: 'var(--slate)',
                                opacity: 0.3,
                              }}
                            >
                              No projects
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
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
          background: rgba(15, 25, 35, 0.025) !important;
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
        .dark .project-list-row:hover {
          background: rgba(255, 255, 255, 0.03) !important;
        }
      `}</style>
    </div>
  )
}
