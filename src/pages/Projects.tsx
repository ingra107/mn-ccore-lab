import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePageMeta } from '../hooks/usePageMeta'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { useProjects } from '../hooks/useApiData'
import ProjectCard from '../components/ProjectCard'
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

function getStageProjects(stage: Stage, filtered: Project[]): Project[] {
  return filtered.filter((p) => p.stage === stage)
}

export default function Projects() {
  usePageMeta(
    'Research Pipeline | MN-CCORE',
    'Track MN-CCORE research projects from idea to publication across CLIF, Lab, and Mesfin research groups.'
  )

  const { data: projects = [] } = useProjects()
  const headerRef = useScrollReveal<HTMLDivElement>()
  const [activeCategory, setActiveCategory] = useState<string>('all')

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return projects
    return projects.filter((p) => p.category === activeCategory)
  }, [activeCategory, projects])

  // Summary stats
  const totalCount = projects.length
  const clifCount = projects.filter((p) => p.category === 'clif').length
  const labCount = projects.filter((p) => p.category === 'lab').length
  const nateCount = projects.filter((p) => p.category === 'nate').length
  const menteeCount = projects.filter((p) => p.category === 'mentee').length

  // Stage change mutation — creates a fresh hook per call via slug
  function handleStageChange(slug: string, newStage: Stage) {
    // Direct API call since useUpdateProject needs to be called at component level
    fetch(`/api/projects/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    })
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        {/* Page Header */}
        <div ref={headerRef} className="fade-in-up" style={{ marginBottom: '2rem', paddingTop: '1.5rem' }}>
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
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '15px',
              color: 'var(--slate)',
              opacity: 0.7,
              marginTop: '6px',
              maxWidth: '520px',
            }}
          >
            Track projects from idea to publication
          </p>

          {/* Gold rule */}
          <div
            style={{
              height: '1px',
              background: 'linear-gradient(to right, var(--gold), transparent)',
              opacity: 0.3,
              marginTop: '1.25rem',
            }}
          />
        </div>

        {/* Filter bar + stats */}
        <div
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6"
        >
          {/* Category filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORY_FILTERS.map((f) => (
              <motion.button
                key={f.key}
                type="button"
                onClick={() => setActiveCategory(f.key)}
                className="cursor-pointer inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                style={{
                  fontFamily: 'var(--font-mono)',
                  minHeight: '32px',
                  background: activeCategory === f.key ? 'var(--gold)' : 'var(--ice)',
                  color: activeCategory === f.key ? '#0f1923' : 'var(--slate)',
                  border: 'none',
                  transitionProperty: 'background-color, color',
                  transitionDuration: '200ms',
                  transitionTimingFunction: 'ease',
                }}
                whileTap={{ scale: 0.95 }}
                aria-pressed={activeCategory === f.key}
              >
                {f.label}
              </motion.button>
            ))}
          </div>

          {/* Summary stats */}
          <span
            className="text-xs"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--slate)',
              opacity: 0.6,
              whiteSpace: 'nowrap',
            }}
          >
            {totalCount} projects &middot; {clifCount} CLIF &middot; {labCount} Lab &middot; {nateCount} Mesfin{menteeCount > 0 ? ` \u00b7 ${menteeCount} Mentees` : ''}
          </span>
        </div>

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
              background: 'linear-gradient(to right, rgba(201,168,76,0.1), var(--gold), rgba(201,168,76,0.1))',
              borderRadius: '1px',
            }}
          />
          {/* Stage dots */}
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
                background: 'var(--gold)',
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
            gap: '12px',
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
                  padding: '16px 12px',
                  minHeight: '300px',
                  minWidth: '200px',
                }}
              >
                {/* Column header */}
                <div style={{ marginBottom: '12px' }}>
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 600,
                      fontSize: '14px',
                      color: 'var(--ink)',
                      margin: 0,
                      paddingBottom: '6px',
                      borderBottom: '2px solid var(--gold)',
                    }}
                  >
                    {stage}
                  </h3>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--slate)',
                      opacity: 0.6,
                    }}
                  >
                    {stageProjects.length} project{stageProjects.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2">
                  <AnimatePresence mode="popLayout">
                    {stageProjects.length > 0 ? (
                      stageProjects.map((project) => (
                        <ProjectCard
                          key={project.slug}
                          project={project}
                          onStageChange={(newStage) => handleStageChange(project.slug, newStage)}
                        />
                      ))
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{
                          padding: '24px 12px',
                          textAlign: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '12px',
                            color: 'var(--slate)',
                            opacity: 0.4,
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
      </div>

      {/* Scoped styles */}
      <style>{`
        .pipeline-board {
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--gold) transparent;
        }
        .pipeline-board::-webkit-scrollbar {
          height: 6px;
        }
        .pipeline-board::-webkit-scrollbar-track {
          background: transparent;
        }
        .pipeline-board::-webkit-scrollbar-thumb {
          background: rgba(201, 168, 76, 0.3);
          border-radius: 3px;
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
        .dark .stage-dropdown {
          background: #162535 !important;
          border-color: rgba(201,168,76,0.3) !important;
        }
      `}</style>
    </div>
  )
}
