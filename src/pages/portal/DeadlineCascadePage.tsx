import { useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { GitBranch, Filter, RotateCcw } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import PageContainer from '../../components/PageContainer'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import DeadlineCascade from '../../components/DeadlineCascade'
import ToggleButton from '../../components/ToggleButton'
import EmptyState from '../../components/EmptyState'
import { useAllCascades, useDeadlineImpact } from '../../hooks/useApiData'
import type { CascadeGraph, DeadlineNode } from '../../lib/api'

export default function DeadlineCascadePage() {
  const { data: allData, isLoading } = useAllCascades()
  const [filterAtRisk, setFilterAtRisk] = useState(false)

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
      for (const [_key, group] of groups) {
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
        icon={<GitBranch size={20} />}
        // P2-R2-07: page name was "Deadline Cascade" but until dependency
        // graph ships the actual content is grouped deadlines by project.
        // Renamed to match what's on screen.
        title={totalDeps > 0 ? 'Deadline Cascade' : 'Deadlines by Project'}
        subtitle={totalDeps > 0
          ? `${totalDeps} dependency ${totalDeps === 1 ? 'link' : 'links'} across ${chainsWithDeps} ${chainsWithDeps === 1 ? 'project' : 'projects'}`
          : `${totalNodes} deadlines tracked across ${projectGroups.length} ${projectGroups.length === 1 ? 'project' : 'projects'}`
        }
      >
        <div className="flex items-center gap-2">
          <ToggleButton
            active={filterAtRisk}
            onClick={() => setFilterAtRisk(!filterAtRisk)}
          >
            <Filter size={14} />
            At Risk Only
          </ToggleButton>
          {(impactId !== null) && (
            <button
              onClick={() => { setImpactId(null); setImpactType(null); setImpactDate(null) }}
              className="inline-flex items-center gap-1.5 rounded-md border text-sm transition-colors px-3 py-1.5"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--slate)',
                background: 'none',
                cursor: 'pointer',
              }}
              title="Clear impact simulation"
              aria-label="Reset impact simulation"
            >
              <RotateCcw size={13} />
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
            icon={<GitBranch size={40} />}
            title="No deadline chains yet"
            subtitle="Create dependency links between milestones and tasks to visualize cascade impacts."
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

              return (
                <motion.div
                  key={group.projectId}
                  variants={{ hidden: { y: 8 }, visible: { y: 0 } }}
                  className="table-container"
                  style={{ overflow: 'visible' }}
                >
                  {/* Project header */}
                  <div style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-sm)',
                  }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}>
                      {group.title}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      color: 'var(--slate)',
                      opacity: 0.75,
                    }}>
                      {group.graph.nodes.length} {group.graph.nodes.length === 1 ? 'item' : 'items'}
                      {group.graph.dependencies.length > 0 && ` / ${group.graph.dependencies.length} ${group.graph.dependencies.length === 1 ? 'link' : 'links'}`}
                    </span>
                  </div>

                  {/* Cascade view */}
                  <div style={{ padding: 'var(--sp-sm) var(--sp-xs)' }}>
                    <DeadlineCascade
                      graph={group.graph}
                      impactResults={impactResults}
                      isLoadingImpact={isLoadingImpact}
                      onSimulateImpact={handleSimulateImpact}
                      filterAtRisk={filterAtRisk}
                      compact={false}
                    />
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </div>
    </PageContainer>
  )
}
