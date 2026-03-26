import { useMemo, useCallback, useRef, useEffect, useState } from 'react'
import { GraphCanvas, darkTheme } from 'reagraph'
import type { GraphCanvasRef } from 'reagraph'
import type { GraphNode as ReagraphNode, GraphEdge as ReagraphEdge, InternalGraphNode, InternalGraphEdge, Theme } from 'reagraph'
import type { Publication } from '../data/types'

// Re-export the same interfaces the sidebar/filters expect
export interface NetworkNode {
  id: string
  name: string
  displayName: string
  papers: number
  isMnccore: boolean
  isClif: boolean
  x: number
  y: number
}

export interface NetworkEdge {
  source: string
  target: string
  weight: number
  sharedPapers: { title: string; year: number; id: string }[]
}

interface CollaborationGraphProps {
  publications: Publication[]
  fullPage?: boolean
  onNodeClick?: (node: NetworkNode | null) => void
  onEdgeClick?: (edge: NetworkEdge | null) => void
  onGraphData?: (nodes: NetworkNode[], edges: NetworkEdge[]) => void
  selectedNodeId?: string | null
  selectedEdge?: NetworkEdge | null
  showExternal?: boolean
}

const MNCCORE_NAMES = [
  'Ingraham NE', 'Mesfin N', 'Tignanelli CJ', 'Chipman JG', 'Dudley RA',
  'Pendleton KM', 'Eddington C', 'Bromley E', 'Collins C', 'Shyu D',
  'Wacker DA', 'Trujeque J', 'MacDonald DM', 'Kalinoski M', 'Henkle BE',
  'Begnaud A', 'Safadi S', 'McEachron K',
]

const CLIF_NAMES = [
  'Lyons PG', 'Gao CA', 'Parker WF', 'Rojas JC', 'Weissman GE',
  'Hochberg CH', 'Bhavani SV', 'Kohn R', 'Kerlin MP', 'Liu VX',
]

function isMnccoreName(name: string): boolean {
  return MNCCORE_NAMES.some((m) => name.includes(m))
}

function matchName(name: string, list: string[]): string | undefined {
  return list.find((m) => name.includes(m))
}

// Colors
const GOLD = '#c9a84c'
const CLIF_BLUE = '#5b8abf'
const EXTERNAL_GRAY = '#64748b'

// Custom dark theme matching the site design
const mnccoreTheme: Theme = {
  ...darkTheme,
  canvas: {
    background: 'transparent',
    fog: null,
  },
  node: {
    ...darkTheme.node,
    fill: GOLD,
    activeFill: GOLD,
    opacity: 1,
    selectedOpacity: 1,
    inactiveOpacity: 0.2,
    label: {
      color: '#faf8f3',
      stroke: '#0f1923',
      activeColor: '#faf8f3',
    },
  },
  ring: {
    fill: GOLD,
    activeFill: GOLD,
  },
  edge: {
    ...darkTheme.edge,
    fill: 'rgba(201, 168, 76, 0.25)',
    activeFill: GOLD,
    opacity: 1,
    selectedOpacity: 1,
    inactiveOpacity: 0.1,
    label: {
      color: '#faf8f3',
      activeColor: GOLD,
      stroke: '#0f1923',
    },
  },
  arrow: {
    fill: GOLD,
    activeFill: GOLD,
  },
  lasso: {
    background: 'rgba(201, 168, 76, 0.1)',
    border: 'rgba(201, 168, 76, 0.5)',
  },
}

export default function CollaborationGraph({
  publications,
  fullPage = false,
  onNodeClick,
  onEdgeClick,
  onGraphData,
  selectedNodeId,
  selectedEdge,
  showExternal = false,
}: CollaborationGraphProps) {
  const graphRef = useRef<GraphCanvasRef | null>(null)
  const [hasRendered, setHasRendered] = useState(false)

  // Build the network data (same logic as EnhancedCollaborationNetwork)
  const { networkNodes, networkEdges } = useMemo(() => {
    const authorPaperCount: Record<string, number> = {}
    const coauthorPairs: Record<string, { weight: number; papers: { title: string; year: number; id: string }[] }> = {}
    const authorType: Record<string, 'mnccore' | 'clif' | 'external'> = {}

    const publishedPubs = publications.filter((p) => p.status === 'Published')

    publishedPubs.forEach((pub) => {
      const authors = pub.authors
        .replace(/\.$/, '')
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a && !a.includes('...') && !a.includes('et al'))

      const relevantAuthors: string[] = []

      authors.forEach((a) => {
        const mnccoreMatch = matchName(a, MNCCORE_NAMES)
        const clifMatch = matchName(a, CLIF_NAMES)

        if (mnccoreMatch) {
          relevantAuthors.push(mnccoreMatch)
          authorPaperCount[mnccoreMatch] = (authorPaperCount[mnccoreMatch] || 0) + 1
          authorType[mnccoreMatch] = 'mnccore'
        } else if (clifMatch) {
          relevantAuthors.push(clifMatch)
          authorPaperCount[clifMatch] = (authorPaperCount[clifMatch] || 0) + 1
          if (!authorType[clifMatch]) authorType[clifMatch] = 'clif'
        } else if (showExternal) {
          const hasMnccoreAuthor = authors.some((other) => isMnccoreName(other))
          if (hasMnccoreAuthor) {
            relevantAuthors.push(a)
            authorPaperCount[a] = (authorPaperCount[a] || 0) + 1
            if (!authorType[a]) authorType[a] = 'external'
          }
        }
      })

      for (let i = 0; i < relevantAuthors.length; i++) {
        for (let j = i + 1; j < relevantAuthors.length; j++) {
          const a = relevantAuthors[i]
          const b = relevantAuthors[j]
          if (a !== b) {
            const key = [a, b].sort().join('|')
            if (!coauthorPairs[key]) {
              coauthorPairs[key] = { weight: 0, papers: [] }
            }
            coauthorPairs[key].weight += 1
            coauthorPairs[key].papers.push({ title: pub.title, year: pub.year, id: pub.id })
          }
        }
      }
    })

    // Filter thresholds: MNCCORE 2+, CLIF 2+, external 3+
    const activeMembers = Object.entries(authorPaperCount)
      .filter(([name, count]) => {
        const type = authorType[name]
        if (type === 'mnccore') return count >= 2
        if (type === 'clif') return count >= 2
        if (type === 'external') return count >= 3
        return false
      })
      .sort((a, b) => b[1] - a[1])

    const nodeList: NetworkNode[] = activeMembers.map(([name, papers]) => ({
      id: name,
      name,
      displayName: name.replace(/ [A-Z]+$/, ''),
      papers,
      isMnccore: authorType[name] === 'mnccore',
      isClif: authorType[name] === 'clif',
      x: 0,
      y: 0,
    }))

    // Limit external to 16
    const externalCount = nodeList.filter((n) => !n.isMnccore && !n.isClif).length
    const externalNames = nodeList
      .filter((n) => !n.isMnccore && !n.isClif)
      .slice(16)
      .map((n) => n.id)
    const filteredNodes = externalCount > 16
      ? nodeList.filter((n) => !externalNames.includes(n.id))
      : nodeList

    const edgeList: NetworkEdge[] = Object.entries(coauthorPairs)
      .filter(([key]) => {
        const [a, b] = key.split('|')
        return filteredNodes.some((n) => n.id === a) && filteredNodes.some((n) => n.id === b)
      })
      .map(([key, data]) => {
        const [source, target] = key.split('|')
        return { source, target, weight: data.weight, sharedPapers: data.papers }
      })
      .sort((a, b) => b.weight - a.weight)

    return { networkNodes: filteredNodes, networkEdges: edgeList }
  }, [publications, showExternal])

  // Notify parent of graph data changes
  useEffect(() => {
    onGraphData?.(networkNodes, networkEdges)
  }, [networkNodes, networkEdges, onGraphData])

  // Build a lookup from edge key to NetworkEdge for click handling
  const edgeLookup = useMemo(() => {
    const map = new Map<string, NetworkEdge>()
    networkEdges.forEach((e) => {
      // reagraph generates edge ids as "{source}-{target}"
      map.set(`${e.source}-${e.target}`, e)
      map.set(`${e.target}-${e.source}`, e)
    })
    return map
  }, [networkEdges])

  // Build a lookup from node id to NetworkNode
  const nodeLookup = useMemo(() => {
    const map = new Map<string, NetworkNode>()
    networkNodes.forEach((n) => map.set(n.id, n))
    return map
  }, [networkNodes])

  // Map to Reagraph node format
  const reagraphNodes: ReagraphNode[] = useMemo(() => {
    return networkNodes.map((node) => {
      let fill = EXTERNAL_GRAY
      if (node.isMnccore) fill = GOLD
      else if (node.isClif) fill = CLIF_BLUE

      // Size proportional to paper count
      // MNCCORE: larger base, CLIF: medium, External: smallest
      let size: number
      if (node.isMnccore) {
        size = Math.max(3, Math.min(node.papers * 1.5, 15))
      } else if (node.isClif) {
        size = Math.max(2, Math.min(node.papers * 1.0, 8))
      } else {
        size = Math.max(1.5, Math.min(node.papers * 0.8, 6))
      }

      return {
        id: node.id,
        label: node.displayName,
        fill,
        size,
        data: {
          papers: node.papers,
          isMnccore: node.isMnccore,
          isClif: node.isClif,
          affiliation: node.isMnccore ? 'mnccore' : node.isClif ? 'clif' : 'external',
        },
      }
    })
  }, [networkNodes])

  // Map to Reagraph edge format
  const reagraphEdges: ReagraphEdge[] = useMemo(() => {
    return networkEdges.map((edge) => {
      const size = Math.max(1, Math.min(edge.weight * 0.6, 4))
      return {
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        size,
        label: edge.weight > 2 ? `${edge.weight}` : undefined,
      }
    })
  }, [networkEdges])

  // Selection state for Reagraph
  const selections = useMemo(() => {
    const sel: string[] = []
    if (selectedNodeId) sel.push(selectedNodeId)
    if (selectedEdge) {
      sel.push(`${selectedEdge.source}-${selectedEdge.target}`)
    }
    return sel
  }, [selectedNodeId, selectedEdge])

  // Callbacks
  const handleNodeClick = useCallback(
    (node: InternalGraphNode) => {
      const networkNode = nodeLookup.get(node.id)
      if (networkNode) {
        onNodeClick?.(networkNode)
        onEdgeClick?.(null)
      }
    },
    [nodeLookup, onNodeClick, onEdgeClick]
  )

  const handleEdgeClick = useCallback(
    (edge: InternalGraphEdge) => {
      const networkEdge = edgeLookup.get(edge.id)
      if (networkEdge) {
        onEdgeClick?.(networkEdge)
        onNodeClick?.(null)
      }
    },
    [edgeLookup, onNodeClick, onEdgeClick]
  )

  const handleCanvasClick = useCallback(() => {
    onNodeClick?.(null)
    onEdgeClick?.(null)
  }, [onNodeClick, onEdgeClick])

  // Center graph after initial render
  useEffect(() => {
    if (reagraphNodes.length > 0 && !hasRendered) {
      const timer = setTimeout(() => {
        graphRef.current?.centerGraph()
        setHasRendered(true)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [reagraphNodes.length, hasRendered])

  // Re-center when node/edge count changes (filter change)
  const prevCountRef = useRef(reagraphNodes.length)
  useEffect(() => {
    if (reagraphNodes.length !== prevCountRef.current) {
      prevCountRef.current = reagraphNodes.length
      const timer = setTimeout(() => {
        graphRef.current?.fitNodesInView()
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [reagraphNodes.length])

  if (reagraphNodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          width: '100%',
          height: fullPage ? '100%' : '400px',
          color: 'rgba(250, 248, 243, 0.4)',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
        }}
      >
        No collaboration data for current filters
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        height: fullPage ? '100%' : '400px',
        minHeight: fullPage ? undefined : '400px',
        position: 'relative',
      }}
    >
      <GraphCanvas
        ref={graphRef}
        nodes={reagraphNodes}
        edges={reagraphEdges}
        theme={mnccoreTheme}
        layoutType="forceDirected2d"
        labelType="auto"
        sizingType="attribute"
        sizingAttribute="size"
        selections={selections}
        animated={false}
        draggable
        edgeInterpolation="curved"
        edgeArrowPosition="none"
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onCanvasClick={handleCanvasClick}
        cameraMode="pan"
        minDistance={100}
        maxDistance={30000}
        layoutOverrides={{
          linkDistance: 120,
          nodeStrength: -300,
        }}
      />

      {/* Legend */}
      <div
        className="absolute bottom-4 left-4 flex flex-wrap gap-3 sm:gap-4 text-xs"
        style={{ zIndex: 10, pointerEvents: 'none' }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: GOLD }}
          />
          <span style={{ color: 'rgba(250, 248, 243, 0.6)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
            MNCCORE
          </span>
        </div>
        {networkNodes.some((n) => n.isClif) && (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: CLIF_BLUE }}
            />
            <span style={{ color: 'rgba(250, 248, 243, 0.6)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
              CLIF
            </span>
          </div>
        )}
        {networkNodes.some((n) => !n.isMnccore && !n.isClif) && (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: EXTERNAL_GRAY }}
            />
            <span style={{ color: 'rgba(250, 248, 243, 0.6)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
              External
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
