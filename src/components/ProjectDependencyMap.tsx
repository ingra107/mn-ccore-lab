/**
 * ProjectDependencyMap — SVG visualization of project relationships.
 *
 * Circular layout with stage-colored nodes and typed directional arrows.
 * No heavy 3D library — pure SVG + Framer Motion for transitions.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Project } from '../data/types'
import type { DependencyRow } from '../hooks/useApiData'

// ── Stage colors ───────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  Idea: '#64748b',
  'Data Collection': '#5b8abf',
  Analysis: '#2d8a8a',
  Writing: '#c9a84c',
  Review: '#7a0019',
  Published: 'var(--green-light)',
}

// ── Relationship arrow colors ──────────────────────────────

const REL_COLORS: Record<string, string> = {
  feeds_into: '#c9a84c',
  blocks: '#7a0019',
  shares_data: '#2d8a8a',
  related_to: '#64748b',
}

const REL_LABELS: Record<string, string> = {
  feeds_into: 'feeds into',
  blocks: 'blocks',
  shares_data: 'shares data',
  related_to: 'related to',
}

// ── Layout ─────────────────────────────────────────────────

interface NodeLayout {
  slug: string
  x: number
  y: number
  title: string
  stage: string
  abbrev: string
}

function getAbbrev(title: string): string {
  const words = title.split(/[\s\-:]+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function layoutNodes(projects: Project[], width: number, height: number): NodeLayout[] {
  const n = projects.length
  if (n === 0) return []

  const cx = width / 2
  const cy = height / 2
  const r = Math.min(cx, cy) - 50

  return projects.map((p, i) => ({
    slug: p.slug,
    x: cx + r * Math.cos((2 * Math.PI * i) / n - Math.PI / 2),
    y: cy + r * Math.sin((2 * Math.PI * i) / n - Math.PI / 2),
    title: p.title,
    stage: p.stage || 'Idea',
    abbrev: getAbbrev(p.title),
  }))
}

// ── Arrow path between two nodes (curved) ──────────────────

function getArrowPath(
  from: NodeLayout,
  to: NodeLayout,
  nodeRadius: number,
): { path: string; midX: number; midY: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist === 0) return { path: '', midX: from.x, midY: from.y }

  // Shorten both ends by node radius
  const ux = dx / dist
  const uy = dy / dist
  const startX = from.x + ux * nodeRadius
  const startY = from.y + uy * nodeRadius
  const endX = to.x - ux * (nodeRadius + 8) // extra offset for arrowhead
  const endY = to.y - uy * (nodeRadius + 8)

  // Curve control point (perpendicular offset)
  const curveOffset = dist * 0.15
  const cpX = (startX + endX) / 2 - uy * curveOffset
  const cpY = (startY + endY) / 2 + ux * curveOffset

  const midX = cpX
  const midY = cpY

  return {
    path: `M ${startX} ${startY} Q ${cpX} ${cpY} ${endX} ${endY}`,
    midX,
    midY,
  }
}

// ── Component ──────────────────────────────────────────────

interface Props {
  projects: Project[]
  dependencies: DependencyRow[]
}

export default function ProjectDependencyMap({ projects, dependencies }: Props) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 500 })

  // Responsive sizing
  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth
        setDimensions({ width: w, height: Math.min(500, Math.max(350, w * 0.7)) })
      }
    }
    updateSize()
    const ro = new ResizeObserver(updateSize)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Only include projects that are part of at least one dependency
  const connectedSlugs = useMemo(() => {
    const slugs = new Set<string>()
    for (const dep of dependencies) {
      slugs.add(dep.from_slug)
      slugs.add(dep.to_slug)
    }
    return slugs
  }, [dependencies])

  const connectedProjects = useMemo(() => {
    return projects.filter((p) => connectedSlugs.has(p.slug))
  }, [projects, connectedSlugs])

  const nodes = useMemo(
    () => layoutNodes(connectedProjects, dimensions.width, dimensions.height),
    [connectedProjects, dimensions],
  )

  const nodeMap = useMemo(() => {
    const m = new Map<string, NodeLayout>()
    for (const n of nodes) m.set(n.slug, n)
    return m
  }, [nodes])

  const nodeRadius = 22

  const highlightedSlugs = useMemo(() => {
    if (!hoveredNode) return null
    const slugs = new Set<string>([hoveredNode])
    for (const dep of dependencies) {
      if (dep.from_slug === hoveredNode || dep.to_slug === hoveredNode) {
        slugs.add(dep.from_slug)
        slugs.add(dep.to_slug)
      }
    }
    return slugs
  }, [hoveredNode, dependencies])

  const getNodeOpacity = useCallback(
    (slug: string) => {
      if (!highlightedSlugs) return 1
      return highlightedSlugs.has(slug) ? 1 : 0.2
    },
    [highlightedSlugs],
  )

  const getEdgeOpacity = useCallback(
    (dep: DependencyRow) => {
      if (hoveredEdge === dep.id) return 1
      if (!hoveredNode) return 0.6
      if (dep.from_slug === hoveredNode || dep.to_slug === hoveredNode) return 1
      return 0.1
    },
    [hoveredNode, hoveredEdge],
  )

  if (dependencies.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--sp-xl)',
          textAlign: 'center',
          background: 'var(--ice)',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        <p
          style={{
            fontSize: '14px',
            color: 'var(--slate)',
            opacity: 'var(--ink-label)',
            margin: 0,
          }}
        >
          No project dependencies defined yet.
        </p>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        style={{ display: 'block', borderRadius: 'var(--radius-xl)', background: 'var(--ice)' }}
      >
        {/* Arrow marker defs */}
        <defs>
          {Object.entries(REL_COLORS).map(([type, color]) => (
            <marker
              key={type}
              id={`arrow-${type}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          ))}
        </defs>

        {/* Edges */}
        {dependencies.map((dep) => {
          const from = nodeMap.get(dep.from_slug)
          const to = nodeMap.get(dep.to_slug)
          if (!from || !to) return null

          const { path } = getArrowPath(from, to, nodeRadius)
          const color = REL_COLORS[dep.relationship_type] || REL_COLORS.related_to
          const isDashed = dep.relationship_type === 'related_to'
          const opacity = getEdgeOpacity(dep)

          return (
            <g key={dep.id}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={hoveredEdge === dep.id ? 3 : 2}
                strokeDasharray={isDashed ? '6 4' : undefined}
                markerEnd={`url(#arrow-${dep.relationship_type})`}
                opacity={opacity}
                style={{ transition: 'opacity 0.2s, stroke-width 0.2s' }}
                onMouseEnter={() => setHoveredEdge(dep.id)}
                onMouseLeave={() => setHoveredEdge(null)}
                cursor="pointer"
              />
              {/* Invisible wider path for easier hover */}
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                onMouseEnter={() => setHoveredEdge(dep.id)}
                onMouseLeave={() => setHoveredEdge(null)}
                cursor="pointer"
              />
            </g>
          )
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const fill = STAGE_COLORS[node.stage] || STAGE_COLORS.Idea
          const opacity = getNodeOpacity(node.slug)

          return (
            <g
              key={node.slug}
              onMouseEnter={() => setHoveredNode(node.slug)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
              opacity={opacity}
            >
              {/* Shadow */}
              <circle
                cx={node.x}
                cy={node.y + 2}
                r={nodeRadius}
                fill="rgba(0,0,0,0.08)"
              />
              {/* Node circle */}
              <circle
                cx={node.x}
                cy={node.y}
                r={nodeRadius}
                fill={fill}
                stroke={hoveredNode === node.slug ? '#fff' : 'rgba(255,255,255,0.2)'}
                strokeWidth={hoveredNode === node.slug ? 3 : 1.5}
              />
              {/* Abbreviation */}
              <text
                x={node.x}
                y={node.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#fff"
                fontFamily="var(--font-sans)"
                fontSize="11"
                fontWeight="700"
                style={{ pointerEvents: 'none' }}
              >
                {node.abbrev}
              </text>
              {/* Label below */}
              <text
                x={node.x}
                y={node.y + nodeRadius + 14}
                textAnchor="middle"
                fill="var(--ink)"
                fontFamily="var(--font-body)"
                fontSize="10"
                style={{ pointerEvents: 'none' }}
              >
                {node.title.length > 18 ? node.title.slice(0, 16) + '...' : node.title}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Hover tooltip for edges */}
      <AnimatePresence>
        {hoveredEdge && (() => {
          const dep = dependencies.find((d) => d.id === hoveredEdge)
          if (!dep) return null
          const from = nodeMap.get(dep.from_slug)
          const to = nodeMap.get(dep.to_slug)
          if (!from || !to) return null

          return (
            <motion.div
              key={hoveredEdge}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'absolute',
                bottom: '8px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--ink)',
                color: 'var(--cream)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-lg)',
                fontSize: '12px',
                whiteSpace: 'nowrap',
                boxShadow: 'var(--shadow-elevated)',
                zIndex: 'var(--z-sticky)',
              }}
            >
              <strong>{from.title}</strong>
              {' '}
              <span style={{ opacity: 0.85 }}>{REL_LABELS[dep.relationship_type] || dep.relationship_type}</span>
              {' '}
              <strong>{to.title}</strong>
              {dep.note && <span style={{ opacity: 'var(--ink-label)', marginLeft: '6px' }}>-- {dep.note}</span>}
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* Hover tooltip for nodes */}
      <AnimatePresence>
        {hoveredNode && !hoveredEdge && (() => {
          const node = nodeMap.get(hoveredNode)
          if (!node) return null
          const incoming = dependencies.filter((d) => d.to_slug === hoveredNode)
          const outgoing = dependencies.filter((d) => d.from_slug === hoveredNode)

          return (
            <motion.div
              key={hoveredNode}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'absolute',
                bottom: '8px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--ink)',
                color: 'var(--cream)',
                padding: '8px 14px',
                borderRadius: 'var(--radius-lg)',
                fontSize: '12px',
                boxShadow: 'var(--shadow-elevated)',
                zIndex: 'var(--z-sticky)',
                maxWidth: '300px',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '2px' }}>{node.title}</div>
              <div style={{ opacity: 0.85, fontSize: '10px' }}>
                {node.stage} &middot; {incoming.length} incoming &middot; {outgoing.length} outgoing
              </div>
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* Legend */}
      <div
        className="flex flex-wrap items-center gap-4 mt-3"
        style={{ padding: '0 var(--sp-xs)' }}
      >
        <span
          style={{
            fontSize: '10px',
            color: 'var(--slate)',
            opacity: 'var(--ink-label)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Arrows:
        </span>
        {Object.entries(REL_LABELS).map(([type, label]) => (
          <span
            key={type}
            className="inline-flex items-center gap-1.5"
            style={{ fontSize: '10px', color: 'var(--slate)' }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '16px',
                height: '3px',
                background: REL_COLORS[type],
                borderRadius: 'var(--radius-sm)',
                ...(type === 'related_to' ? { backgroundImage: `repeating-linear-gradient(90deg, ${REL_COLORS[type]} 0px, ${REL_COLORS[type]} 4px, transparent 4px, transparent 7px)`, background: 'none' } : {}),
              }}
            />
            {label}
          </span>
        ))}
        <span style={{ marginLeft: '8px', fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Stages:
        </span>
        {Object.entries(STAGE_COLORS).map(([stage, color]) => (
          <span
            key={stage}
            className="inline-flex items-center gap-1"
            style={{ fontSize: '10px', color: 'var(--slate)' }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: 'var(--radius-circle)',
                background: color,
              }}
            />
            {stage}
          </span>
        ))}
      </div>
    </div>
  )
}
