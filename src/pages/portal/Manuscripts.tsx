import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, List, ArrowRight, FileText } from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import ToggleButton from '../../components/ToggleButton'
import Avatar from '../../components/Avatar'
import { useProjects, useTasks } from '../../hooks/useApiData'
import { getPersonInfo } from '../../data/team'
import type { Project } from '../../data/types'

// Manuscript stages (pipeline columns)
const stages = [
  { key: 'Idea', label: 'Idea', color: 'var(--slate)', bg: 'rgba(100,116,139,0.06)' },
  { key: 'Data Collection', label: 'Data Collection', color: 'var(--teal)', bg: 'rgba(45,138,138,0.06)' },
  { key: 'Analysis', label: 'Analysis', color: 'var(--gold)', bg: 'rgba(201,168,76,0.06)' },
  { key: 'Writing', label: 'Writing', color: '#c2410c', bg: 'rgba(194,65,12,0.06)' },
  { key: 'Review', label: 'In Review', color: 'var(--maroon)', bg: 'rgba(122,0,25,0.06)' },
  { key: 'Published', label: 'Published', color: 'var(--green, #22c55e)', bg: 'rgba(34,197,94,0.06)' },
] as const

type ViewMode = 'pipeline' | 'list'

export default function Manuscripts() {
  const [view, setView] = useState<ViewMode>('pipeline')
  const [filterPI, setFilterPI] = useState<string>('')

  const { data: projects = [] } = useProjects()
  const { data: tasks = [] } = useTasks()

  // Filter to manuscript-like projects (all projects are potential manuscripts)
  const manuscripts = useMemo(() => {
    let filtered = projects.filter((p) => p.status !== 'Published' || p.stage === 'Published')
    if (filterPI) {
      filtered = filtered.filter((p) => p.pi === filterPI)
    }
    return filtered
  }, [projects, filterPI])

  // Group by stage
  const byStage = useMemo(() => {
    const map: Record<string, Project[]> = {}
    for (const s of stages) map[s.key] = []
    for (const p of manuscripts) {
      const stage = p.stage || 'Idea'
      if (map[stage]) {
        map[stage].push(p)
      } else {
        map['Idea'].push(p)
      }
    }
    return map
  }, [manuscripts])

  // Task counts per project
  const taskCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) {
      if (t.project_id && !t.completed) {
        map.set(t.project_id, (map.get(t.project_id) || 0) + 1)
      }
    }
    return map
  }, [tasks])

  // Stats
  const activeCount = manuscripts.filter((p) => p.stage !== 'Published').length

  return (
    <div>
      <div>
        <SectionHeader
          icon={FileText}
          title="Manuscript Pipeline"
          subtitle={`${activeCount} active manuscripts — track from idea to publication`}
        />
        {/* Stage flow summary */}
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {stages.map((s, i) => {
            const count = byStage[s.key]?.length || 0
            return (
              <span key={s.key} className="flex items-center gap-1">
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ fontFamily: 'var(--font-mono)', color: s.color, backgroundColor: s.bg, border: `1px solid ${s.color}20` }}
                >
                  {s.label} {count}
                </span>
                {i < stages.length - 1 && <span className="text-[8px]" style={{ color: 'var(--slate)', opacity: 0.3 }}>→</span>}
              </span>
            )
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {([
            { key: 'pipeline' as ViewMode, label: 'Pipeline', icon: LayoutGrid },
            { key: 'list' as ViewMode, label: 'List', icon: List },
          ]).map((v) => {
            const Icon = v.icon
            const active = view === v.key
            return (
              <ToggleButton
                key={v.key}
                active={active}
                onClick={() => setView(v.key)}
              >
                <Icon size={14} />
                {v.label}
              </ToggleButton>
            )
          })}
        </div>

        <select
          value={filterPI}
          onChange={(e) => setFilterPI(e.target.value)}
          className="rounded-full border px-3 py-1.5 text-xs"
          style={{
            fontFamily: 'var(--font-sans)', fontSize: '12px',
            color: filterPI ? 'var(--teal)' : 'var(--slate)',
            backgroundColor: filterPI ? 'rgba(45,138,138,0.06)' : 'transparent',
            borderColor: filterPI ? 'var(--teal)' : 'var(--border-light)',
            cursor: 'pointer', appearance: 'none' as const, WebkitAppearance: 'none' as const,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', paddingRight: '24px',
          }}
        >
          <option value="">All PIs</option>
          <option value="nick">Nick Ingraham</option>
          <option value="nate">Nate Mesfin</option>
        </select>
      </div>

      {/* Content */}
      <div className="mt-5">
        {view === 'pipeline' ? (
          <PipelineView byStage={byStage} taskCounts={taskCounts} />
        ) : (
          <ListView manuscripts={manuscripts} taskCounts={taskCounts} />
        )}
      </div>
    </div>
  )
}

// ── Pipeline View (Kanban by stage) ──────────────────────────

function PipelineView({ byStage, taskCounts }: { byStage: Record<string, Project[]>; taskCounts: Map<string, number> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stages.map((stage) => {
        const stageProjects = byStage[stage.key] || []
        return (
          <div key={stage.key}>
            {/* Column header */}
            <div
              className="flex items-center justify-between px-2.5 py-2 rounded-t-lg border-b-2 mb-2"
              style={{ backgroundColor: stage.bg, borderColor: stage.color }}
            >
              <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-sans)', color: stage.color }}>
                {stage.label}
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ fontFamily: 'var(--font-mono)', color: stage.color, backgroundColor: stage.bg }}
              >
                {stageProjects.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 min-h-[150px]">
              {stageProjects.map((p) => (
                <ManuscriptMiniCard key={p.slug} project={p} taskCount={taskCounts.get(p.slug) || 0} />
              ))}
              {stageProjects.length === 0 && (
                <div
                  className="flex items-center justify-center py-6 rounded-lg border border-dashed text-[11px]"
                  style={{ borderColor: 'var(--border-light)', color: 'var(--slate)', opacity: 0.3, fontFamily: 'var(--font-sans)' }}
                >
                  None
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Manuscript Mini Card ─────────────────────────────────────

function ManuscriptMiniCard({ project, taskCount }: { project: Project; taskCount: number }) {
  const pi = getPersonInfo(project.pi)

  return (
    <Link
      to={`/projects/${project.slug}`}
      className="block rounded-lg border p-2.5 transition-all hover:shadow-sm"
      style={{ borderColor: 'var(--border-light)', backgroundColor: 'white', textDecoration: 'none' }}
    >
      <p className="text-xs font-medium leading-tight" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
        {project.title}
      </p>
      <div className="flex items-center gap-1.5 mt-2">
        <div style={{ width: 16, height: 16 }}>
          <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="sm" variant="ice" className="!w-4 !h-4 !min-w-0 !min-h-0 !text-[5px]" />
        </div>
        <span className="text-[9px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.6 }}>
          {pi.name.split(' ').pop()}
        </span>
        {taskCount > 0 && (
          <span className="ml-auto text-[9px] px-1 py-0.5 rounded" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.08)' }}>
            {taskCount} tasks
          </span>
        )}
      </div>
      {project.category && (
        <span className="inline-block mt-1.5 text-[8px] px-1.5 py-0.5 rounded-full uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)', backgroundColor: 'rgba(201,168,76,0.08)' }}>
          {project.category}
        </span>
      )}
    </Link>
  )
}

// ── List View ────────────────────────────────────────────────

function ListView({ manuscripts, taskCounts }: { manuscripts: Project[]; taskCounts: Map<string, number> }) {
  // Sort: Writing/Review first, then by stage
  const stageOrder: Record<string, number> = { 'Review': 0, 'Writing': 1, 'Analysis': 2, 'Data Collection': 3, 'Idea': 4, 'Published': 5 }

  const sorted = [...manuscripts].sort((a, b) => {
    const aOrder = stageOrder[a.stage || 'Idea'] ?? 4
    const bOrder = stageOrder[b.stage || 'Idea'] ?? 4
    return aOrder - bOrder
  })

  return (
    <div className="flex flex-col gap-2">
      {/* Header row */}
      <div className="grid grid-cols-12 gap-3 px-3 py-2 border-b" style={{ borderColor: 'var(--border-light)' }}>
        <span className="col-span-5 text-[10px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>Title</span>
        <span className="col-span-2 text-[10px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>Stage</span>
        <span className="col-span-2 text-[10px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>PI</span>
        <span className="col-span-1 text-[10px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>Category</span>
        <span className="col-span-1 text-[10px] uppercase tracking-wider text-right" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>Tasks</span>
        <span className="col-span-1"></span>
      </div>

      {sorted.map((p) => {
        const pi = getPersonInfo(p.pi)
        const stage = stages.find((s) => s.key === p.stage) || stages[0]
        const tc = taskCounts.get(p.slug) || 0

        return (
          <Link
            key={p.slug}
            to={`/projects/${p.slug}`}
            className="grid grid-cols-12 gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-black/[0.02]"
            style={{ textDecoration: 'none' }}
          >
            <span className="col-span-5 text-sm truncate" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
              {p.title}
            </span>
            <span className="col-span-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-mono)', color: stage.color, backgroundColor: stage.bg }}>
                {stage.label}
              </span>
            </span>
            <span className="col-span-2 flex items-center gap-1.5">
              <div style={{ width: 18, height: 18 }}>
                <Avatar name={pi.name} initials={pi.initials} photoUrl={pi.photoUrl} size="sm" variant="ice" className="!w-[18px] !h-[18px] !min-w-0 !min-h-0 !text-[6px]" />
              </div>
              <span className="text-xs" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}>
                {pi.name.split(' ').pop()}
              </span>
            </span>
            <span className="col-span-1 text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)', opacity: 0.7 }}>
              {p.category}
            </span>
            <span className="col-span-1 text-xs text-right" style={{ fontFamily: 'var(--font-mono)', color: tc > 0 ? 'var(--teal)' : 'var(--slate)', opacity: tc > 0 ? 1 : 0.3 }}>
              {tc || '-'}
            </span>
            <span className="col-span-1 flex items-center justify-end">
              <ArrowRight size={12} style={{ color: 'var(--slate)', opacity: 0.3 }} />
            </span>
          </Link>
        )
      })}

      {sorted.length === 0 && (
        <div className="text-center py-20">
          <div
            className="mx-auto mb-4"
            style={{ width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.08)' }}
          >
            <FileText size={28} style={{ color: 'var(--teal)', opacity: 0.6 }} />
          </div>
          <p className="text-base font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
            No manuscripts found
          </p>
          <p className="text-sm mt-1.5 max-w-sm mx-auto" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
            Manuscripts at every stage from idea to publication will appear here.
          </p>
        </div>
      )}
    </div>
  )
}
