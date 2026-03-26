import { useMemo, useRef, useEffect, useState } from 'react'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { usePublications } from '../hooks/useApiData'

interface Node {
  id: string
  name: string
  papers: number
  isMnccore: boolean
  x: number
  y: number
}

interface Edge {
  source: string
  target: string
  weight: number
}

const MNCCORE_NAMES = [
  'Ingraham NE', 'Mesfin N', 'Tignanelli CJ', 'Chipman JG', 'Dudley RA',
  'Pendleton KM', 'Eddington C', 'Bromley E', 'Collins C', 'Shyu D',
  'Wacker DA', 'Trujeque J', 'MacDonald DM', 'Kalinoski M', 'Henkle BE',
  'Begnaud A', 'Safadi S', 'McEachron K',
]

export default function CollaborationNetwork() {
  const { data: publications = [] } = usePublications()
  const sectionRef = useScrollReveal<HTMLElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const dimensionsRef = useRef({ w: 800, h: 400 })

  const { nodes, edges } = useMemo(() => {
    const authorPaperCount: Record<string, number> = {}
    const coauthorPairs: Record<string, number> = {}

    const publishedPubs = publications.filter((p) => p.status === 'Published')

    publishedPubs.forEach((pub) => {
      const authors = pub.authors
        .replace(/\.$/, '')
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a && !a.includes('...') && !a.includes('et al'))

      // Only track MNCCORE members and their top collaborators
      const relevantAuthors = authors.filter(
        (a) => MNCCORE_NAMES.some((m) => a.includes(m))
      )

      // Count papers per author
      relevantAuthors.forEach((a) => {
        const match = MNCCORE_NAMES.find((m) => a.includes(m))
        if (match) {
          authorPaperCount[match] = (authorPaperCount[match] || 0) + 1
        }
      })

      // Count co-authorships between MNCCORE members
      for (let i = 0; i < relevantAuthors.length; i++) {
        for (let j = i + 1; j < relevantAuthors.length; j++) {
          const a = MNCCORE_NAMES.find((m) => relevantAuthors[i].includes(m))
          const b = MNCCORE_NAMES.find((m) => relevantAuthors[j].includes(m))
          if (a && b && a !== b) {
            const key = [a, b].sort().join('|')
            coauthorPairs[key] = (coauthorPairs[key] || 0) + 1
          }
        }
      }
    })

    // Only include members with at least 2 papers
    const activeMembers = Object.entries(authorPaperCount)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])

    // Layout: core trio (Ingraham, Mesfin, Eddington) in center triangle, others in orbit
    const cx = 400
    const cy = 200
    const coreMembers = ['Ingraham NE', 'Mesfin N', 'Eddington C']
    const corePositions: Record<string, { x: number; y: number }> = {
      'Ingraham NE': { x: cx, y: cy - 40 },
      'Mesfin N': { x: cx - 50, y: cy + 30 },
      'Eddington C': { x: cx + 50, y: cy + 30 },
    }
    const radius = 155
    const orbitMembers = activeMembers.filter(([name]) => !coreMembers.includes(name))
    const nodeList: Node[] = activeMembers.map(([name, papers]) => {
      const isCore = coreMembers.includes(name)
      if (isCore) {
        const pos = corePositions[name] ?? { x: cx, y: cy }
        return {
          id: name,
          name: name.replace(/ [A-Z]+$/, ''),
          papers,
          isMnccore: true,
          x: pos.x,
          y: pos.y,
        }
      }
      const orbitIdx = orbitMembers.findIndex(([n]) => n === name)
      const angle = (orbitIdx / orbitMembers.length) * Math.PI * 2 - Math.PI / 2
      return {
        id: name,
        name: name.replace(/ [A-Z]+$/, ''),
        papers,
        isMnccore: true,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      }
    })

    const edgeList: Edge[] = Object.entries(coauthorPairs)
      .filter(([key]) => {
        const [a, b] = key.split('|')
        return nodeList.some((n) => n.id === a) && nodeList.some((n) => n.id === b)
      })
      .map(([key, weight]) => {
        const [source, target] = key.split('|')
        return { source, target, weight }
      })
      .sort((a, b) => b.weight - a.weight)

    return { nodes: nodeList, edges: edgeList }
  }, [publications])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const container = canvas.parentElement
    if (container) {
      const w = container.clientWidth
      const h = Math.min(400, w * 0.5)
      dimensionsRef.current = { w, h }
      canvas.width = w * 2
      canvas.height = h * 2
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dims = dimensionsRef.current
    const scale = canvas.width / dims.w
    ctx.scale(scale, scale)
    ctx.clearRect(0, 0, dims.w, dims.h)

    // Adjust node positions to actual dimensions
    const scaleX = dims.w / 800
    const scaleY = dims.h / 400

    // Draw edges
    edges.forEach((edge) => {
      const source = nodes.find((n) => n.id === edge.source)
      const target = nodes.find((n) => n.id === edge.target)
      if (!source || !target) return

      const isHighlighted = hovered === source.id || hovered === target.id
      ctx.beginPath()
      ctx.moveTo(source.x * scaleX, source.y * scaleY)
      ctx.lineTo(target.x * scaleX, target.y * scaleY)
      ctx.strokeStyle = isHighlighted
        ? 'rgba(201, 168, 76, 0.6)'
        : 'rgba(201, 168, 76, 0.12)'
      ctx.lineWidth = Math.min(edge.weight * 0.5, 3) * (isHighlighted ? 1.5 : 1)
      ctx.stroke()
    })

    // Draw nodes
    nodes.forEach((node) => {
      const x = node.x * scaleX
      const y = node.y * scaleY
      const r = Math.max(4, Math.min(node.papers * 1.5, 16))
      const isCore = ['Ingraham NE', 'Mesfin N', 'Eddington C'].includes(node.id)
      const isHovered = hovered === node.id

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = isCore
        ? '#c9a84c'
        : isHovered
          ? '#c9a84c'
          : 'rgba(250, 248, 243, 0.6)'
      ctx.fill()

      // Label
      ctx.font = `${isCore || isHovered ? '600' : '400'} ${isCore ? '13' : '11'}px "DM Sans", sans-serif`
      ctx.fillStyle = isCore || isHovered
        ? '#faf8f3'
        : 'rgba(250, 248, 243, 0.5)'
      ctx.textAlign = 'center'
      ctx.fillText(node.name, x, y + r + 14)

      if (isHovered) {
        ctx.font = '500 10px "JetBrains Mono", monospace'
        ctx.fillStyle = 'rgba(201, 168, 76, 0.8)'
        ctx.fillText(`${node.papers} papers`, x, y + r + 26)
      }
    })
  }, [nodes, edges, hovered])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const dims = dimensionsRef.current
    const scaleX = dims.w / 800
    const scaleY = dims.h / 400

    let found: string | null = null
    for (const node of nodes) {
      const dx = mx - node.x * scaleX
      const dy = my - node.y * scaleY
      if (Math.sqrt(dx * dx + dy * dy) < 20) {
        found = node.id
        break
      }
    }
    setHovered(found)
  }

  return (
    <section ref={sectionRef} className="fade-in-up section-ink relative py-8 sm:py-12">
      <div
        className="absolute top-0 left-0 right-0"
        style={{ height: '1px', background: 'var(--gold)', opacity: 0.3 }}
      />

      <div className="content-container">
        <div className="text-center mb-6">
          <h2
            className="text-xl sm:text-2xl mb-2"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: '#faf8f3' }}
          >
            Collaboration Network
          </h2>
          <p
            className="text-xs"
            style={{ color: 'rgba(250, 248, 243, 0.5)' }}
          >
            MNCCORE team co-authorship connections across {publications.filter((p) => p.status === 'Published').length} published papers
          </p>
        </div>

        <div className="relative">
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: hovered ? 'pointer' : 'default' }}
          />
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0"
        style={{ height: '1px', background: 'var(--gold)', opacity: 0.3 }}
      />
    </section>
  )
}
