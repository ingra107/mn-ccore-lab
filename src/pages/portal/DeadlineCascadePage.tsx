import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronRight, Filter, RotateCcw } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import PageContainer from '../../components/PageContainer'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import DeadlineCascade, { getNodeStatus } from '../../components/DeadlineCascade'
import ToggleButton from '../../components/ToggleButton'
import EmptyState from '../../components/EmptyState'
import EmptyStateArt from '../../components/EmptyStateArt'
import { PATHS } from '../../constants/paths'
import { useAllCascades, useDeadlineImpact } from '../../hooks/useApiData'
import type { CascadeGraph, DeadlineNode } from '../../lib/api'
import { ICON_PROPS } from '../../lib/iconProps'

export default function DeadlineCascadePage() {
  const navigate = useNavigate()
  const { data: allData, isLoading } = useAllCascades()
  const [filterAtRisk, setFilterAtRisk] = useState(false)
  // Progressive disclosure (principle 5, G4-6 2026-10-14): on a phone every
  // card starts folded to its summary line; 427 deadlines across 42 open cards
  // made the tab ~22,700px tall. From md up the cards start open. A tap on a
  // card's header flips it either way. The width is read once, at mount, on
  // purpose: rotating a tablet or resizing the window never re-folds or
  // re-opens cards the user is reading; a reload picks up the new width.
  const [startOpen] = useState(() => !(typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches))
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set())
  const toggleCard = useCallback((id: string) => setFlipped((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  }), [])

  // Impact simulation state
  const [impactId, setImpactId] = useState<string | null>(null)
  const [impactType, setImpactType] = useState<string | null>(null)
  const [impactDate, setImpactDate] = useState<string | null>(null)

  const { data: impactResults = [], isLoading: isLoadingImpact } = useDeadlineImpact(impactId, impactType, impactDate)

  const handleSimulateImpact = useCallback((id: string, type: string, newDate: string) => {
    setImpactId(id)
    setImpactType(type)
    setImpactDate(newDate)
  }, [])

  // Group nodes by project
  const projectGroups = useMemo(() => {
    if (!allData) return []
    const groups = new Map<string, { title: string; nodes: DeadlineNode[]; deps: typeof allData.dependencies }>()

    for (const node of allData.nodes) {
      const key = node.project_id || '__unassigned'
      if (!groups.has(key)) {
        groups.set(key, {
          title: node.project_title || 'Unassigned',
          nodes: [],
          deps: [],
        })
      }
      groups.get(key)!.nodes.push(node)
    }

    // Assign dependencies to project groups
    for (const dep of allData.dependencies) {
      // Find which project group contains the upstream node
      for (const group of groups.values()) {
        const nodeIds = new Set(group.nodes.map(n => n.id))
        if (nodeIds.has(dep.upstream_id) || nodeIds.has(dep.downstream_id)) {
          group.deps.push(dep)
        }
      }
    }

    return [...groups.entries()]
      .map(([key, group]) => ({
        projectId: key,
        title: group.title,
        graph: {
          nodes: group.nodes,
          dependencies: group.deps,
        } as CascadeGraph,
      }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [allData])

  // Stats
  const totalNodes = allData?.nodes.length || 0
  const totalDeps = allData?.dependencies.length || 0
  const chainsWithDeps = projectGroups.filter(g => g.graph.dependencies.length > 0).length

  return (
    <PageContainer>
      <PageHeader
        // P2-R2-07: page name was "Deadline Cascade" but until dependency
        // graph ships the actual content is grouped deadlines by project.
        // Renamed to match what's on screen.
        // The tab lives under Lab overview, which every tab names as its one
        // header (principle 11); what this tab shows moves to the subtitle.
        title="Lab overview"
        subtitle={totalDeps > 0
          ? `Deadline cascade: ${totalDeps} dependency ${totalDeps === 1 ? 'link' : 'links'} across ${chainsWithDeps} ${chainsWithDeps === 1 ? 'project' : 'projects'}`
          : `Deadlines by project: ${totalNodes} across ${projectGroups.length} ${projectGroups.length === 1 ? 'project' : 'projects'}`
        }
      >
        <div className="flex items-center gap-2">
          <ToggleButton
            active={filterAtRisk}
            onClick={() => setFilterAtRisk(!filterAtRisk)}
          >
            <Filter {...ICON_PROPS} size={14} />
            At Risk Only
          </ToggleButton>
          {(impactId !== null) && (
            <button
              onClick={() => { setImpactId(null); setImpactType(null); setImpactDate(null) }}
              className="tk-btn"
              title="Clear impact simulation"
              aria-label="Reset impact simulation"
            >
              <RotateCcw {...ICON_PROPS} size={13} />
              Reset
            </button>
          )}
        </div>
      </PageHeader>

      <div className="mt-5">
        {isLoading ? (
          <TableSkeleton rows={8} cols={3} />
        ) : projectGroups.length === 0 ? (
          <EmptyState
            icon={<EmptyStateArt variant="grants" />}
            title="No deadline chains yet"
            subtitle="Create dependency links between milestones and tasks to visualize cascade impacts."
            action={{ label: 'Go to Deadlines', onClick: () => navigate(PATHS.deadlines) }}
          />
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}
          >
            {projectGroups.map((group) => {
              // Skip projects with no dependencies if filter is off, or no at-risk if filter is on
              if (filterAtRisk && group.graph.dependencies.length === 0) return null
              const open = startOpen !== flipped.has(group.projectId)
              const counts = { overdue: 0, atRisk: 0, onTrack: 0 }
              for (const n of group.graph.nodes) {
                const st = getNodeStatus(n)
                if (st === 'overdue') counts.overdue++
                else if (st === 'at-risk') counts.atRisk++
                else if (st === 'on-track') counts.onTrack++
              }
              const summary = [
                counts.overdue ? `${counts.overdue} overdue` : null,
                counts.atRisk ? `${counts.atRisk} at risk` : null,
                counts.onTrack ? `${counts.onTrack} on track` : null,
              ].filter(Boolean).join(' · ') || 'all done'
              const Chev = open ? ChevronDown : ChevronRight

              return (
                <motion.div
                  key={group.projectId}
                  variants={{ hidden: { y: 8 }, visible: { y: 0 } }}
                  className="table-container"
                  style={{ overflow: 'visible' }}
                >
                  {/* Project header: the card's fold toggle and its summary line.
                      The chevron keeps its own slot on the first line; the title
                      and summary wrap beside it, never under it. A long title used
                      to wrap the whole row and leave the chevron alone on a line
                      above it (O2B, 2026-10-14; principle 14, fixed slots). */}
                  <button
                    type="button"
                    onClick={() => toggleCard(group.projectId)}
                    aria-expanded={open}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '10px 16px',
                      border: 'none',
                      borderBottom: open ? '1px solid var(--border-subtle)' : '1px solid transparent',
                      display: 'flex',
                      alignItems: 'flex-start',
                      columnGap: 'var(--sp-sm)',
                      background: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <Chev {...ICON_PROPS} size={14} aria-hidden="true" style={{ color: 'var(--sk-t3)', flexShrink: 0, marginTop: 3 }} />
                    <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 'var(--sp-sm)', rowGap: 2, minWidth: 0, flex: 1 }}>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--ink)',
                        minWidth: 0,
                        overflowWrap: 'anywhere',
                      }}>
                        {group.title}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        color: 'var(--sk-t3)',
                      }}>
                        {summary}
                        {group.graph.dependencies.length > 0 && ` · ${group.graph.dependencies.length} ${group.graph.dependencies.length === 1 ? 'link' : 'links'}`}
                      </span>
                    </span>
                  </button>

                  {/* Cascade view */}
                  {open && <div style={{ padding: 'var(--sp-sm) var(--sp-xs)' }}>
                    <DeadlineCascade
                      graph={group.graph}
                      impactResults={impactResults}
                      isLoadingImpact={isLoadingImpact}
                      onSimulateImpact={handleSimulateImpact}
                      filterAtRisk={filterAtRisk}
                      compact={false}
                    />
                  </div>}
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </div>
    </PageContainer>
  )
}
