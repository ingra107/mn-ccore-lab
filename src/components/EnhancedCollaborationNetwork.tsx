import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import type { Publication } from '../data/types'

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

interface EnhancedCollaborationNetworkProps {
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

export default function EnhancedCollaborationNetwork({
  publications,
  fullPage = false,
  onNodeClick,
  onEdgeClick,
  onGraphData,
  selectedNodeId,
  selectedEdge,
  showExternal = false,
}: EnhancedCollaborationNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState({ w: 800, h: 600 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  const { nodes, edges } = useMemo(() => {
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
          // Only include external collaborators who appear with MNCCORE members
          const hasMnccoreAuthor = authors.some((other) => isMnccoreName(other))
          if (hasMnccoreAuthor) {
            relevantAuthors.push(a)
            authorPaperCount[a] = (authorPaperCount[a] || 0) + 1
            if (!authorType[a]) authorType[a] = 'external'
          }
        }
      })

      // Count co-authorships
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

    // Filter: MNCCORE members need 2+ papers, external need 3+, CLIF need 2+
    const activeMembers = Object.entries(authorPaperCount)
      .filter(([name, count]) => {
        const type = authorType[name]
        if (type === 'mnccore') return count >= 2
        if (type === 'clif') return count >= 2
        if (type === 'external') return count >= 3
        return false
      })
      .sort((a, b) => b[1] - a[1])

    // Layout with force-directed-like positioning
    const VIRTUAL_W = 800
    const VIRTUAL_H = 600
    const cx = VIRTUAL_W / 2
    const cy = VIRTUAL_H / 2

    const coreMembers = ['Ingraham NE', 'Mesfin N', 'Eddington C']
    const corePositions: Record<string, { x: number; y: number }> = {
      'Ingraham NE': { x: cx, y: cy - 50 },
      'Mesfin N': { x: cx - 60, y: cy + 40 },
      'Eddington C': { x: cx + 60, y: cy + 40 },
    }

    const mnccoreMembers = activeMembers.filter(([name]) =>
      authorType[name] === 'mnccore' && !coreMembers.includes(name)
    )
    const clifMembers = activeMembers.filter(([name]) => authorType[name] === 'clif')
    const externalMembers = activeMembers.filter(([name]) => authorType[name] === 'external')

    const nodeList: NetworkNode[] = []

    // Core trio
    coreMembers.forEach((name) => {
      const count = authorPaperCount[name] || 0
      if (count < 2) return
      const pos = corePositions[name]
      nodeList.push({
        id: name,
        name,
        displayName: name.replace(/ [A-Z]+$/, ''),
        papers: count,
        isMnccore: true,
        isClif: false,
        x: pos.x,
        y: pos.y,
      })
    })

    // MNCCORE orbit
    const mnccoreRadius = 170
    mnccoreMembers.forEach(([name, papers], idx) => {
      const angle = (idx / Math.max(mnccoreMembers.length, 1)) * Math.PI * 2 - Math.PI / 2
      nodeList.push({
        id: name,
        name,
        displayName: name.replace(/ [A-Z]+$/, ''),
        papers,
        isMnccore: true,
        isClif: false,
        x: cx + Math.cos(angle) * mnccoreRadius,
        y: cy + Math.sin(angle) * mnccoreRadius,
      })
    })

    // CLIF orbit (outer ring)
    const clifRadius = 250
    clifMembers.forEach(([name, papers], idx) => {
      const angle = (idx / Math.max(clifMembers.length, 1)) * Math.PI * 2 - Math.PI / 4
      nodeList.push({
        id: name,
        name,
        displayName: name.replace(/ [A-Z]+$/, ''),
        papers,
        isMnccore: false,
        isClif: true,
        x: cx + Math.cos(angle) * clifRadius,
        y: cy + Math.sin(angle) * clifRadius,
      })
    })

    // External orbit (outermost)
    if (showExternal) {
      const externalRadius = 320
      externalMembers.slice(0, 16).forEach(([name, papers], idx) => {
        const angle = (idx / Math.min(externalMembers.length, 16)) * Math.PI * 2
        nodeList.push({
          id: name,
          name,
          displayName: name.replace(/ [A-Z]+$/, ''),
          papers,
          isMnccore: false,
          isClif: false,
          x: cx + Math.cos(angle) * externalRadius,
          y: cy + Math.sin(angle) * externalRadius,
        })
      })
    }

    const edgeList: NetworkEdge[] = Object.entries(coauthorPairs)
      .filter(([key]) => {
        const [a, b] = key.split('|')
        return nodeList.some((n) => n.id === a) && nodeList.some((n) => n.id === b)
      })
      .map(([key, data]) => {
        const [source, target] = key.split('|')
        return { source, target, weight: data.weight, sharedPapers: data.papers }
      })
      .sort((a, b) => b.weight - a.weight)

    return { nodes: nodeList, edges: edgeList }
  }, [publications, showExternal])

  // Notify parent of graph data changes
  useEffect(() => {
    onGraphData?.(nodes, edges)
  }, [nodes, edges, onGraphData])

  // Resize handler
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleResize = () => {
      const w = container.clientWidth
      const h = fullPage ? container.clientHeight : Math.min(600, w * 0.6)
      setDimensions({ w, h })
    }

    handleResize()
    const observer = new ResizeObserver(handleResize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [fullPage])

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = dimensions.w * dpr
    canvas.height = dimensions.h * dpr
    canvas.style.width = `${dimensions.w}px`
    canvas.style.height = `${dimensions.h}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, dimensions.w, dimensions.h)

    // Apply pan and zoom transforms
    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.translate(dimensions.w / 2, dimensions.h / 2)
    ctx.scale(zoom, zoom)
    ctx.translate(-dimensions.w / 2, -dimensions.h / 2)

    const scaleX = dimensions.w / 800
    const scaleY = dimensions.h / 600

    // Determine if an edge is selected
    const edgeKey = selectedEdge
      ? [selectedEdge.source, selectedEdge.target].sort().join('|')
      : null

    // Draw edges
    edges.forEach((edge) => {
      const source = nodes.find((n) => n.id === edge.source)
      const target = nodes.find((n) => n.id === edge.target)
      if (!source || !target) return

      const thisKey = [edge.source, edge.target].sort().join('|')
      const isSelectedEdge = edgeKey === thisKey
      const isConnectedToSelected =
        selectedNodeId === source.id || selectedNodeId === target.id
      const isHighlighted =
        hovered === source.id || hovered === target.id || isConnectedToSelected || isSelectedEdge

      ctx.beginPath()
      ctx.moveTo(source.x * scaleX, source.y * scaleY)
      ctx.lineTo(target.x * scaleX, target.y * scaleY)

      if (isSelectedEdge) {
        ctx.strokeStyle = 'rgba(201, 168, 76, 0.9)'
        ctx.lineWidth = Math.min(edge.weight * 1.2, 5)
      } else if (isHighlighted) {
        ctx.strokeStyle = 'rgba(201, 168, 76, 0.5)'
        ctx.lineWidth = Math.min(edge.weight * 0.8, 4)
      } else {
        ctx.strokeStyle = selectedNodeId || selectedEdge
          ? 'rgba(201, 168, 76, 0.04)'
          : 'rgba(201, 168, 76, 0.12)'
        ctx.lineWidth = Math.min(edge.weight * 0.5, 3)
      }
      ctx.stroke()
    })

    // Draw nodes
    nodes.forEach((node) => {
      const x = node.x * scaleX
      const y = node.y * scaleY
      const r = Math.max(5, Math.min(node.papers * 1.8, 20))
      const isCore = ['Ingraham NE', 'Mesfin N', 'Eddington C'].includes(node.id)
      const isHovered = hovered === node.id
      const isSelected = selectedNodeId === node.id
      const isConnected = selectedNodeId
        ? edges.some(
            (e) =>
              (e.source === selectedNodeId && e.target === node.id) ||
              (e.target === selectedNodeId && e.source === node.id)
          )
        : false
      const isEdgeNode = selectedEdge
        ? node.id === selectedEdge.source || node.id === selectedEdge.target
        : false

      const dimmed = (selectedNodeId || selectedEdge) && !isSelected && !isConnected && !isEdgeNode && !isHovered

      // Node circle
      ctx.beginPath()
      ctx.arc(x, y, isSelected ? r + 3 : r, 0, Math.PI * 2)

      if (node.isClif && !node.isMnccore) {
        ctx.fillStyle = dimmed
          ? 'rgba(96, 165, 181, 0.15)'
          : isHovered || isSelected || isEdgeNode
            ? '#60a5b5'
            : 'rgba(96, 165, 181, 0.6)'
      } else if (!node.isMnccore && !node.isClif) {
        ctx.fillStyle = dimmed
          ? 'rgba(100, 116, 139, 0.15)'
          : isHovered || isSelected
            ? '#94a3b8'
            : 'rgba(100, 116, 139, 0.5)'
      } else if (isCore || isSelected) {
        ctx.fillStyle = dimmed ? 'rgba(201, 168, 76, 0.2)' : '#c9a84c'
      } else {
        ctx.fillStyle = dimmed
          ? 'rgba(255, 255, 255, 0.1)'
          : isHovered || isEdgeNode
            ? '#c9a84c'
            : 'rgba(255, 255, 255, 0.6)'
      }
      ctx.fill()

      // Selection ring
      if (isSelected) {
        ctx.beginPath()
        ctx.arc(x, y, r + 6, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(201, 168, 76, 0.6)'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Label
      const labelOpacity = dimmed ? 0.15 : 1
      const fontSize = isCore ? 13 : node.isClif ? 11 : !node.isMnccore ? 10 : 11
      ctx.font = `${isCore || isHovered || isSelected ? '600' : '400'} ${fontSize}px "DM Sans", sans-serif`
      ctx.fillStyle = isCore || isHovered || isSelected || isEdgeNode
        ? `rgba(255, 255, 255, ${labelOpacity})`
        : `rgba(255, 255, 255, ${0.5 * labelOpacity})`
      ctx.textAlign = 'center'
      ctx.fillText(node.displayName, x, y + r + 14)

      // Paper count on hover/select
      if (isHovered || isSelected) {
        ctx.font = '500 10px "JetBrains Mono", monospace'
        ctx.fillStyle = 'rgba(201, 168, 76, 0.8)'
        ctx.fillText(`${node.papers} papers`, x, y + r + 26)
      }
    })

    ctx.restore()
  }, [nodes, edges, hovered, dimensions, pan, zoom, selectedNodeId, selectedEdge])

  // Hit testing — find node or edge at position
  const hitTest = useCallback(
    (mx: number, my: number) => {
      const scaleX = dimensions.w / 800
      const scaleY = dimensions.h / 600

      // Transform mouse coordinates by inverse of pan/zoom
      const tx = (mx - pan.x - dimensions.w / 2) / zoom + dimensions.w / 2
      const ty = (my - pan.y - dimensions.h / 2) / zoom + dimensions.h / 2

      // Check nodes first
      for (const node of nodes) {
        const dx = tx - node.x * scaleX
        const dy = ty - node.y * scaleY
        const r = Math.max(5, Math.min(node.papers * 1.8, 20))
        if (Math.sqrt(dx * dx + dy * dy) < r + 8) {
          return { type: 'node' as const, node }
        }
      }

      // Check edges
      for (const edge of edges) {
        const source = nodes.find((n) => n.id === edge.source)
        const target = nodes.find((n) => n.id === edge.target)
        if (!source || !target) continue

        const sx = source.x * scaleX
        const sy = source.y * scaleY
        const ex = target.x * scaleX
        const ey = target.y * scaleY

        // Distance from point to line segment
        const len2 = (ex - sx) * (ex - sx) + (ey - sy) * (ey - sy)
        if (len2 === 0) continue
        let t = ((tx - sx) * (ex - sx) + (ty - sy) * (ey - sy)) / len2
        t = Math.max(0, Math.min(1, t))
        const px = sx + t * (ex - sx)
        const py = sy + t * (ey - sy)
        const dist = Math.sqrt((tx - px) * (tx - px) + (ty - py) * (ty - py))

        if (dist < 8) {
          return { type: 'edge' as const, edge }
        }
      }

      return null
    },
    [nodes, edges, dimensions, pan, zoom]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDragging) {
        setPan({
          x: panStart.x + (e.clientX - dragStart.x),
          y: panStart.y + (e.clientY - dragStart.y),
        })
        return
      }

      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const hit = hitTest(mx, my)
      setHovered(hit?.type === 'node' ? hit.node.id : null)

      canvas.style.cursor = hit ? 'pointer' : isDragging ? 'grabbing' : 'grab'
    },
    [hitTest, isDragging, dragStart, panStart]
  )

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDragging) return

      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const hit = hitTest(mx, my)
      if (hit?.type === 'node') {
        onNodeClick?.(hit.node)
        onEdgeClick?.(null)
      } else if (hit?.type === 'edge') {
        onEdgeClick?.(hit.edge)
        onNodeClick?.(null)
      } else {
        onNodeClick?.(null)
        onEdgeClick?.(null)
      }
    },
    [hitTest, isDragging, onNodeClick, onEdgeClick]
  )

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setZoom((prev) => Math.max(0.3, Math.min(3, prev * delta)))
    },
    []
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Only start drag if not clicking a node
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const hit = hitTest(mx, my)

      if (!hit) {
        setIsDragging(true)
        setDragStart({ x: e.clientX, y: e.clientY })
        setPanStart({ x: pan.x, y: pan.y })
        canvas.style.cursor = 'grabbing'
      }
    },
    [hitTest, pan]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    const canvas = canvasRef.current
    if (canvas) canvas.style.cursor = 'grab'
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{
        width: '100%',
        height: fullPage ? '100%' : undefined,
        minHeight: fullPage ? undefined : '400px',
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setHovered(null)
          setIsDragging(false)
        }}
        onClick={handleClick}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        style={{ cursor: 'grab', display: 'block' }}
      />

      {/* Zoom controls */}
      {fullPage && (
        <div
          className="absolute bottom-4 right-4 flex flex-col gap-1"
          style={{ zIndex: 10 }}
        >
          <button
            onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
            className="w-8 h-8 rounded flex items-center justify-center text-sm font-bold cursor-pointer"
            style={{
              background: 'rgba(15, 25, 35, 0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(201, 168, 76, 0.3)',
              color: 'rgba(255, 255, 255, 0.8)',
            }}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))}
            className="w-8 h-8 rounded flex items-center justify-center text-sm font-bold cursor-pointer"
            style={{
              background: 'rgba(15, 25, 35, 0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(201, 168, 76, 0.3)',
              color: 'rgba(255, 255, 255, 0.8)',
            }}
            aria-label="Zoom out"
          >
            -
          </button>
          <button
            onClick={() => {
              setZoom(1)
              setPan({ x: 0, y: 0 })
            }}
            className="w-8 h-8 rounded flex items-center justify-center text-xs cursor-pointer mt-1"
            style={{
              background: 'rgba(15, 25, 35, 0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(201, 168, 76, 0.3)',
              color: 'rgba(255, 255, 255, 0.6)',
              fontFamily: 'var(--font-sans)',
            }}
            aria-label="Reset view"
          >
            1:1
          </button>
        </div>
      )}

      {/* Legend */}
      <div
        className="absolute bottom-4 left-4 flex flex-wrap gap-3 sm:gap-4 text-xs"
        style={{ zIndex: 10 }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: '#c9a84c' }}
          />
          <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontFamily: 'var(--font-sans)', fontSize: '10px' }}>
            MNCCORE
          </span>
        </div>
        {nodes.some((n) => n.isClif) && (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: '#60a5b5' }}
            />
            <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontFamily: 'var(--font-sans)', fontSize: '10px' }}>
              CLIF
            </span>
          </div>
        )}
        {nodes.some((n) => !n.isMnccore && !n.isClif) && (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: '#64748b' }}
            />
            <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontFamily: 'var(--font-sans)', fontSize: '10px' }}>
              External
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
