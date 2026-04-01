import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Plus, List, LayoutGrid } from 'lucide-react'
import Avatar from '../../components/Avatar'
import CreateProjectModal from '../../components/CreateProjectModal'
import { useProjects, useTasks } from '../../hooks/useApiData'
import { useCreateProject } from '../../hooks/useMutations'
import { getPersonInfo } from '../../data/team'
import type { Project } from '../../data/types'
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
  const headerRef = useScrollReveal<HTMLDivElement>()

  const { data: projects = [] } = useProjects()
  const { data: tasks = [] } = useTasks()
  const createProject = useCreateProject()

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
        {/* Page Header */}
        <div ref={headerRef} className="fade-in-up" style={{ marginBottom: '1rem', paddingTop: '1rem' }}>
          <div className="flex items-center gap-2.5">
            <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.08)', flexShrink: 0 }}>
              <FileText size={16} style={{ color: 'var(--teal)' }} />
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 'clamp(1.35rem, 3vw, 1.75rem)',
                color: 'var(--ink)',
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              Manuscripts
            </h1>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--slate)',
                opacity: 0.5,
                marginLeft: '4px',
              }}
            >
              {activeCount} active
            </span>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg ml-auto new-project-btn"
              style={{
                background: 'transparent',
                color: 'var(--teal)',
                fontFamily: 'var(--font-body)',
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
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mb-4">
          {/* View toggle */}
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
            {(['list', 'pipeline'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  background: view === v ? 'var(--teal)' : 'transparent',
                  color: view === v ? '#faf8f3' : 'var(--slate)',
                  border: 'none',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                {v === 'list' ? <List size={14} /> : <LayoutGrid size={14} />}
                {v === 'list' ? 'List' : 'Pipeline'}
              </button>
            ))}
          </div>

          {/* PI filter */}
          <select
            value={filterPI}
            onChange={(e) => setFilterPI(e.target.value)}
            className="rounded-md border px-3 py-1.5 text-xs"
            style={{
              fontFamily: 'var(--font-body)',
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

        {/* ─── LIST VIEW ─── */}
        {view === 'list' && (
          <div style={{ borderRadius: '4px', overflow: 'hidden' }}>
            {/* Table header */}
            <div
              className="hidden sm:grid"
              style={{
                gridTemplateColumns: '1fr 120px 72px',
                padding: '8px 24px',
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
                        <div
                          className="manuscript-list-row"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 120px 72px',
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
        {view === 'pipeline' && (
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
                    background: '#f5f3ee',
                    borderRadius: '12px',
                    borderTop: '2px solid var(--teal)',
                    padding: '16px',
                    minHeight: '200px',
                  }}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
                    <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '13px', color: 'var(--ink)', margin: 0 }}>
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
