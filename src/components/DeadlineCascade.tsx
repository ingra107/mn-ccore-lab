import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronDown, Calendar, ArrowRight, AlertTriangle, CheckCircle2, GitBranch } from 'lucide-react'
import type { CascadeGraph, ImpactResult, DeadlineNode } from '../lib/api'
import { formatShortDate } from '../lib/dateUtils'

// ── Status helpers ──────────────────────────────────────────

function getNodeStatus(node: DeadlineNode): 'on-track' | 'at-risk' | 'overdue' | 'completed' {
  if (node.status === 'done' || node.status === 'completed') return 'completed'
  if (!node.due_date) return 'on-track'
  const now = new Date()
  const due = new Date(node.due_date + 'T23:59:59')
  if (due < now) return 'overdue'
  const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysUntil <= 7) return 'at-risk'
  return 'on-track'
}

function statusColor(s: 'on-track' | 'at-risk' | 'overdue' | 'completed'): string {
  switch (s) {
    case 'on-track': return 'var(--teal)'
    case 'at-risk': return 'var(--gold)'
    case 'overdue': return 'var(--maroon)'
    case 'completed': return 'var(--green)'
  }
}

function statusLabel(s: 'on-track' | 'at-risk' | 'overdue' | 'completed'): string {
  switch (s) {
    case 'on-track': return 'On Track'
    case 'at-risk': return 'At Risk'
    case 'overdue': return 'Overdue'
    case 'completed': return 'Done'
  }
}

// ── Build tree from flat graph ─────────────────────────────

interface CascadeTreeNode extends DeadlineNode {
  children: CascadeTreeNode[]
  depth: number
  downstreamCount: number
  lagDays: number
}

function buildCascadeTrees(graph: CascadeGraph): CascadeTreeNode[] {
  const { nodes, dependencies } = graph
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Find which nodes have upstream (are downstream of something)
  const hasUpstream = new Set(dependencies.map(d => d.downstream_id))

  // Root nodes: nodes that appear in dependencies but have no upstream, OR all nodes if no deps
  const rootIds = dependencies.length > 0
    ? [...new Set([...dependencies.map(d => d.upstream_id), ...dependencies.map(d => d.downstream_id)])]
        .filter(id => !hasUpstream.has(id))
    : nodes.map(n => n.id)

  // Count total downstream nodes
  function countDownstream(id: string, visited: Set<string>): number {
    if (visited.has(id)) return 0
    visited.add(id)
    const children = dependencies.filter(d => d.upstream_id === id)
    let count = children.length
    for (const child of children) {
      count += countDownstream(child.downstream_id, visited)
    }
    return count
  }

  function buildNode(id: string, depth: number, lagDays: number, visited: Set<string>): CascadeTreeNode | null {
    if (visited.has(id)) return null
    visited.add(id)
    const node = nodeMap.get(id)
    if (!node) return null

    const childDeps = dependencies.filter(d => d.upstream_id === id)
    const children: CascadeTreeNode[] = []
    for (const dep of childDeps) {
      const child = buildNode(dep.downstream_id, depth + 1, dep.lag_days, visited)
      if (child) children.push(child)
    }

    return {
      ...node,
      children,
      depth,
      downstreamCount: countDownstream(id, new Set()),
      lagDays,
    }
  }

  const trees: CascadeTreeNode[] = []
  const globalVisited = new Set<string>()
  for (const rootId of rootIds) {
    const tree = buildNode(rootId, 0, 0, globalVisited)
    if (tree) trees.push(tree)
  }

  // Sort roots by due date
  trees.sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date.localeCompare(b.due_date)
  })

  return trees
}

// ── Cascade Row Component ──────────────────────────────────

function CascadeRow({
  node,
  impactResults,
  selectedId,
  onSelect,
}: {
  node: CascadeTreeNode
  impactResults: ImpactResult[]
  selectedId: string | null
  onSelect: (node: CascadeTreeNode) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const status = getNodeStatus(node)
  const color = statusColor(status)
  const hasChildren = node.children.length > 0
  const isSelected = selectedId === node.id

  const impactItem = impactResults.find(r => r.id === node.id)
  const isImpacted = !!impactItem && impactItem.shift_days !== 0

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.15 }}
        onClick={() => onSelect(node)}
        className="group"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          paddingLeft: `${12 + node.depth * 24}px`,
          cursor: 'pointer',
          borderRadius: 6,
          border: isSelected ? `1px solid ${color}` : '1px solid transparent',
          background: isImpacted
            ? 'rgba(201,168,76,0.08)'
            : isSelected
              ? 'rgba(45,138,138,0.04)'
              : 'transparent',
          transition: 'all 150ms ease',
        }}
      >
        {/* Expand/collapse */}
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
          >
            {expanded
              ? <ChevronDown size={14} style={{ color: 'var(--slate)', opacity: 0.4 }} />
              : <ChevronRight size={14} style={{ color: 'var(--slate)', opacity: 0.4 }} />
            }
          </button>
        ) : (
          <span style={{ width: 14 }} />
        )}

        {/* Status dot */}
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
          boxShadow: isImpacted ? `0 0 6px ${statusColor('at-risk')}` : 'none',
        }} />

        {/* Lag indicator for non-root nodes */}
        {node.depth > 0 && node.lagDays > 0 && (
          <span style={{
            fontSize: '9px',
            fontWeight: 500,
            color: 'var(--slate)',
            opacity: 0.5,
            background: 'rgba(148,163,184,0.08)',
            padding: '1px 5px',
            borderRadius: 3,
            flexShrink: 0,
          }}>
            +{node.lagDays}d
          </span>
        )}

        {/* Title */}
        <span style={{
          fontSize: '13px',
          fontWeight: 400,
          color: status === 'completed' ? 'var(--slate)' : 'var(--ink)',
          textDecoration: status === 'completed' ? 'line-through' : 'none',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
        }}>
          {node.title}
        </span>

        {/* Due date */}
        <span style={{
          fontSize: '11px',
          fontWeight: status === 'overdue' ? 500 : 400,
          color: status === 'overdue' ? 'var(--maroon)' : 'var(--slate)',
          opacity: status === 'overdue' ? 1 : 0.6,
          flexShrink: 0,
        }}>
          {node.due_date ? formatShortDate(node.due_date) : 'No date'}
        </span>

        {/* Impact projection */}
        {isImpacted && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              fontSize: '10px',
              fontWeight: 500,
              color: impactItem.shift_days > 0 ? 'var(--gold)' : 'var(--teal)',
              background: impactItem.shift_days > 0 ? 'rgba(201,168,76,0.12)' : 'rgba(45,138,138,0.12)',
              padding: '2px 6px',
              borderRadius: 4,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <ArrowRight size={9} />
            {impactItem.projected_date ? formatShortDate(impactItem.projected_date) : '?'}
            <span style={{ opacity: 0.7 }}>
              ({impactItem.shift_days > 0 ? '+' : ''}{impactItem.shift_days}d)
            </span>
          </motion.span>
        )}

        {/* Status badge */}
        <span style={{
          fontSize: '9px',
          fontWeight: 500,
          color,
          opacity: 0.7,
          flexShrink: 0,
        }}>
          {statusLabel(status)}
        </span>

        {/* Type badge */}
        <span style={{
          fontSize: '9px',
          fontWeight: 500,
          color: node.type === 'milestone' ? 'var(--gold)' : 'var(--teal)',
          opacity: 0.5,
          flexShrink: 0,
        }}>
          {node.type === 'milestone' ? 'Milestone' : 'Task'}
        </span>

        {/* Downstream count indicator */}
        {node.downstreamCount > 0 && (
          <span style={{
            fontSize: '9px',
            fontWeight: 500,
            color: 'var(--slate)',
            opacity: 0.4,
            background: 'rgba(148,163,184,0.06)',
            padding: '1px 5px',
            borderRadius: 3,
            flexShrink: 0,
          }}>
            {node.downstreamCount} downstream
          </span>
        )}
      </motion.div>

      {/* Children */}
      <AnimatePresence>
        {expanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: 'hidden' }}
          >
            {/* Connecting line */}
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: `${20 + node.depth * 24}px`,
                top: 0,
                bottom: 0,
                width: 1,
                background: 'rgba(255,255,255,0.1)',
              }} />
              {node.children.map(child => (
                <CascadeRow
                  key={child.id}
                  node={child}
                  impactResults={impactResults}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── What-If Panel ──────────────────────────────────────────

function WhatIfPanel({
  node,
  impactResults,
  isLoading,
  onSimulate,
  onClose,
}: {
  node: CascadeTreeNode
  impactResults: ImpactResult[]
  isLoading: boolean
  onSimulate: (newDate: string) => void
  onClose: () => void
}) {
  const [newDate, setNewDate] = useState(node.due_date || '')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25 }}
      style={{
        marginTop: 12,
        padding: 16,
        borderRadius: 8,
        border: '1px solid rgba(201,168,76,0.2)',
        background: 'rgba(201,168,76,0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={14} style={{ color: 'var(--gold)' }} />
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--gold)' }}>
            What-if: Move "{node.title}"
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '11px',
            color: 'var(--slate)',
            opacity: 0.5,
          }}
        >
          Close
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
          Current: {node.due_date ? formatShortDate(node.due_date) : 'No date'}
        </span>
        <ArrowRight size={12} style={{ color: 'var(--slate)', opacity: 0.3 }} />
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          style={{
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: 4,
            border: '1px solid rgba(201,168,76,0.3)',
            background: 'var(--cream)',
            color: 'var(--ink)',
            outline: 'none',
          }}
        />
        <button
          onClick={() => { if (newDate) onSimulate(newDate) }}
          disabled={!newDate || isLoading}
          style={{
            fontSize: '11px',
            fontWeight: 500,
            padding: '4px 12px',
            borderRadius: 4,
            border: '1px solid rgba(201,168,76,0.3)',
            background: 'rgba(201,168,76,0.1)',
            color: 'var(--gold)',
            cursor: !newDate || isLoading ? 'not-allowed' : 'pointer',
            opacity: !newDate || isLoading ? 0.5 : 1,
          }}
        >
          {isLoading ? 'Simulating...' : 'Simulate'}
        </button>
      </div>

      {/* Impact results */}
      {impactResults.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <AlertTriangle size={12} style={{ color: 'var(--gold)' }} />
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--gold)' }}>
              {impactResults.length} downstream {impactResults.length === 1 ? 'item' : 'items'} affected
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {impactResults.map(item => (
              <div key={item.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderRadius: 4,
                background: item.shift_days > 0 ? 'rgba(201,168,76,0.06)' : 'rgba(45,138,138,0.06)',
              }}>
                <span style={{ fontSize: '12px', color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                  {item.title}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.6, flexShrink: 0 }}>
                  {item.original_date ? formatShortDate(item.original_date) : 'No date'}
                </span>
                <ArrowRight size={10} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                <span style={{
                  fontSize: '10px',
                  fontWeight: 500,
                  color: item.shift_days > 0 ? 'var(--gold)' : 'var(--teal)',
                  flexShrink: 0,
                }}>
                  {formatShortDate(item.projected_date)}
                </span>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 500,
                  color: item.shift_days > 0 ? 'var(--maroon)' : 'var(--teal)',
                  opacity: 0.7,
                  flexShrink: 0,
                }}>
                  {item.shift_days > 0 ? '+' : ''}{item.shift_days}d
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {impactResults.length === 0 && !isLoading && (
        <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.5 }}>
          No downstream items would be affected.
        </span>
      )}
    </motion.div>
  )
}

// ── Main Component ─────────────────────────────────────────

interface DeadlineCascadeProps {
  graph: CascadeGraph
  impactResults?: ImpactResult[]
  isLoadingImpact?: boolean
  onSimulateImpact?: (id: string, type: string, newDate: string) => void
  filterAtRisk?: boolean
  compact?: boolean
}

export default function DeadlineCascade({
  graph,
  impactResults = [],
  isLoadingImpact = false,
  onSimulateImpact,
  filterAtRisk = false,
  compact = false,
}: DeadlineCascadeProps) {
  const [selectedNode, setSelectedNode] = useState<CascadeTreeNode | null>(null)

  const trees = useMemo(() => {
    const all = buildCascadeTrees(graph)
    if (!filterAtRisk) return all

    // Filter to only chains with at-risk or overdue nodes
    function hasAtRiskNode(node: CascadeTreeNode): boolean {
      const s = getNodeStatus(node)
      if (s === 'at-risk' || s === 'overdue') return true
      return node.children.some(c => hasAtRiskNode(c))
    }
    return all.filter(tree => hasAtRiskNode(tree))
  }, [graph, filterAtRisk])

  const handleSelect = useCallback((node: CascadeTreeNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node)
  }, [])

  const handleSimulate = useCallback((newDate: string) => {
    if (selectedNode && onSimulateImpact) {
      onSimulateImpact(selectedNode.id, selectedNode.type, newDate)
    }
  }, [selectedNode, onSimulateImpact])

  if (trees.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: compact ? '24px 16px' : '40px 20px',
        color: 'var(--slate)',
        opacity: 0.5,
      }}>
        <GitBranch size={compact ? 24 : 32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
        <p style={{ fontSize: compact ? '12px' : '13px', margin: 0 }}>
          {filterAtRisk ? 'No at-risk dependency chains' : 'No deadline dependencies yet'}
        </p>
        {!compact && (
          <p style={{ fontSize: '11px', margin: '4px 0 0', opacity: 0.6 }}>
            Link milestones and tasks to see how deadlines cascade.
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Summary bar */}
      {!compact && (
        <div style={{
          display: 'flex',
          gap: 16,
          padding: '8px 12px',
          marginBottom: 8,
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          {(() => {
            const allNodes = graph.nodes
            const overdueCount = allNodes.filter(n => getNodeStatus(n) === 'overdue').length
            const atRiskCount = allNodes.filter(n => getNodeStatus(n) === 'at-risk').length
            const onTrackCount = allNodes.filter(n => getNodeStatus(n) === 'on-track').length
            const completedCount = allNodes.filter(n => getNodeStatus(n) === 'completed').length
            return (
              <>
                {overdueCount > 0 && (
                  <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--maroon)' }} />
                    <span style={{ color: 'var(--maroon)', fontWeight: 500 }}>{overdueCount}</span>
                    <span style={{ color: 'var(--slate)', opacity: 0.5 }}>overdue</span>
                  </span>
                )}
                {atRiskCount > 0 && (
                  <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} />
                    <span style={{ color: 'var(--gold)', fontWeight: 500 }}>{atRiskCount}</span>
                    <span style={{ color: 'var(--slate)', opacity: 0.5 }}>at risk</span>
                  </span>
                )}
                <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)' }} />
                  <span style={{ color: 'var(--teal)', fontWeight: 500 }}>{onTrackCount}</span>
                  <span style={{ color: 'var(--slate)', opacity: 0.5 }}>on track</span>
                </span>
                {completedCount > 0 && (
                  <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={10} style={{ color: 'var(--green)' }} />
                    <span style={{ color: 'var(--green)', fontWeight: 500 }}>{completedCount}</span>
                    <span style={{ color: 'var(--slate)', opacity: 0.5 }}>done</span>
                  </span>
                )}
                <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.35 }}>
                  {graph.dependencies.length} {graph.dependencies.length === 1 ? 'link' : 'links'}
                </span>
              </>
            )
          })()}
        </div>
      )}

      {/* Tree */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {trees.map(tree => (
          <CascadeRow
            key={tree.id}
            node={tree}
            impactResults={impactResults}
            selectedId={selectedNode?.id || null}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* What-if panel */}
      <AnimatePresence>
        {selectedNode && onSimulateImpact && (
          <WhatIfPanel
            node={selectedNode}
            impactResults={impactResults}
            isLoading={isLoadingImpact}
            onSimulate={handleSimulate}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
