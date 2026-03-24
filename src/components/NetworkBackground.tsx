import { useMemo } from 'react'

interface Node {
  id: number
  cx: number
  cy: number
  r: number
  opacity: number
  duration: number
  delay: number
  dx: number
  dy: number
}

function generateNodes(count: number): Node[] {
  const nodes: Node[] = []
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: i,
      cx: Math.random() * 100,
      cy: Math.random() * 100,
      r: 1.5 + Math.random() * 1.5,
      opacity: 0.06 + Math.random() * 0.04,
      duration: 15 + Math.random() * 15,
      delay: -(Math.random() * 20),
      dx: (Math.random() - 0.5) * 6,
      dy: (Math.random() - 0.5) * 6,
    })
  }
  return nodes
}

function generateEdges(nodes: Node[], threshold: number) {
  const edges: { x1: number; y1: number; x2: number; y2: number; opacity: number }[] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].cx - nodes[j].cx
      const dy = nodes[i].cy - nodes[j].cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < threshold) {
        const opacity = 0.03 + (1 - dist / threshold) * 0.02
        edges.push({
          x1: nodes[i].cx,
          y1: nodes[i].cy,
          x2: nodes[j].cx,
          y2: nodes[j].cy,
          opacity,
        })
      }
    }
  }
  return edges
}

export default function NetworkBackground() {
  const { nodes, edges, keyframes } = useMemo(() => {
    const n = generateNodes(25)
    const e = generateEdges(n, 25)

    // Generate unique keyframe definitions for each node
    const kf = n
      .map(
        (node) => `
      @keyframes networkFloat${node.id} {
        0%, 100% { transform: translate(0, 0); }
        33% { transform: translate(${node.dx}px, ${node.dy * 0.6}px); }
        66% { transform: translate(${node.dx * -0.4}px, ${node.dy}px); }
      }
    `
      )
      .join('\n')

    return { nodes: n, edges: e, keyframes: kf }
  }, [])

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <style>{`
        ${keyframes}
        @media (prefers-reduced-motion: reduce) {
          .network-node { animation: none !important; }
        }
      `}</style>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {edges.map((edge, i) => (
          <line
            key={`edge-${i}`}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke="#c9a84c"
            strokeWidth="0.1"
            opacity={edge.opacity}
          />
        ))}
        {nodes.map((node) => (
          <circle
            key={`node-${node.id}`}
            className="network-node"
            cx={node.cx}
            cy={node.cy}
            r={node.r}
            fill="#c9a84c"
            opacity={node.opacity}
            style={{
              animation: `networkFloat${node.id} ${node.duration}s ease-in-out ${node.delay}s infinite`,
              transformOrigin: `${node.cx}px ${node.cy}px`,
            }}
          />
        ))}
      </svg>
    </div>
  )
}
