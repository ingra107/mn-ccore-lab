import { useMemo, useState, useEffect, useRef } from 'react'
import { Tags } from 'lucide-react'
import BentoCard from './BentoCard'
import { usePublications } from '../../hooks/useApiData'

const TOPIC_DISPLAY: Record<string, string> = {
  clif: 'CLIF',
  covid: 'COVID-19',
  ventilation: 'Ventilation',
  'decision-making': 'Decision-Making',
  quality: 'Quality',
  sepsis: 'Sepsis',
  disparities: 'Disparities',
}

const TOPIC_BUBBLE_COLORS: Record<string, string> = {
  clif: '#3b82f6',
  covid: '#dc2626',
  ventilation: '#16a34a',
  'decision-making': '#9333ea',
  quality: '#d97706',
  sepsis: '#db2777',
  disparities: '#0284c7',
}

interface BubbleData {
  topic: string
  label: string
  count: number
  color: string
  radius: number
  x: number
  y: number
}

function packBubbles(data: BubbleData[], width: number, height: number): BubbleData[] {
  // Simple circle-packing: place largest first, push smaller ones away from center
  const sorted = [...data].sort((a, b) => b.radius - a.radius)
  const placed: BubbleData[] = []
  const cx = width / 2
  const cy = height / 2

  sorted.forEach((bubble, i) => {
    if (i === 0) {
      bubble.x = cx
      bubble.y = cy
      placed.push(bubble)
      return
    }

    // Try positions in a spiral pattern
    let bestX = cx
    let bestY = cy
    let bestDist = Infinity

    for (let angle = 0; angle < Math.PI * 8; angle += 0.2) {
      const r = 5 + angle * 4
      const testX = cx + Math.cos(angle) * r
      const testY = cy + Math.sin(angle) * r

      // Check collisions with placed bubbles
      let valid = true
      let minSep = Infinity
      for (const p of placed) {
        const dx = testX - p.x
        const dy = testY - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = bubble.radius + p.radius + 3
        if (dist < minDist) {
          valid = false
          break
        }
        minSep = Math.min(minSep, dist - bubble.radius - p.radius)
      }

      if (valid) {
        // Check bounds
        if (
          testX - bubble.radius < 4 || testX + bubble.radius > width - 4 ||
          testY - bubble.radius < 4 || testY + bubble.radius > height - 4
        ) continue

        const distFromCenter = Math.sqrt((testX - cx) ** 2 + (testY - cy) ** 2)
        if (distFromCenter < bestDist) {
          bestDist = distFromCenter
          bestX = testX
          bestY = testY
        }
      }
    }

    bubble.x = bestX
    bubble.y = bestY
    placed.push(bubble)
  })

  return placed
}

export default function TopicBubblesCard() {
  const { data: publications = [] } = usePublications()
  const [hovered, setHovered] = useState<string | null>(null)
  const [animated, setAnimated] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // Fallback: always animate after 800ms even if observer doesn't fire
    const fallback = setTimeout(() => setAnimated(true), 800)
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimated(true)
          clearTimeout(fallback)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => { observer.disconnect(); clearTimeout(fallback) }
  }, [])

  const bubbles = useMemo(() => {
    const topicCounts: Record<string, number> = {}
    publications.forEach((p) => {
      p.topics.forEach((t) => {
        topicCounts[t] = (topicCounts[t] || 0) + 1
      })
    })

    const maxCount = Math.max(...Object.values(topicCounts), 1)
    const WIDTH = 220
    const HEIGHT = 160

    const data: BubbleData[] = Object.entries(topicCounts).map(([topic, count]) => ({
      topic,
      label: TOPIC_DISPLAY[topic] ?? topic.charAt(0).toUpperCase() + topic.slice(1),
      count,
      color: TOPIC_BUBBLE_COLORS[topic] ?? '#c9a84c',
      radius: 14 + (count / maxCount) * 26,
      x: 0,
      y: 0,
    }))

    return packBubbles(data, WIDTH, HEIGHT)
  }, [publications])

  return (
    <BentoCard title="Research Topics" subtitle="By publication count" size="span-1" icon={Tags}>
      <div ref={containerRef} className="relative" style={{ width: '100%', height: '170px' }}>
        <svg
          viewBox="0 0 220 160"
          width="100%"
          height="100%"
          style={{ overflow: 'visible' }}
        >
          {bubbles.map((b, i) => (
            <g
              key={b.topic}
              onMouseEnter={() => setHovered(b.topic)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={b.x}
                cy={b.y}
                r={animated ? b.radius : 0}
                fill={b.color}
                opacity={hovered === null || hovered === b.topic ? 0.75 : 0.25}
                style={{
                  transition: `r 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * 80}ms, opacity 0.2s ease`,
                }}
              />
              {/* Label — show on hover or if bubble is large enough */}
              {(hovered === b.topic || b.radius > 28) && animated && (
                <text
                  x={b.x}
                  y={b.y - (hovered === b.topic ? 4 : 2)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: hovered === b.topic ? '10px' : '8px',
                    fill: '#fff',
                    fontWeight: 600,
                    pointerEvents: 'none',
                  }}
                >
                  {b.label}
                </text>
              )}
              {hovered === b.topic && animated && (
                <text
                  x={b.x}
                  y={b.y + 10}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    fill: '#fff',
                    fontWeight: 400,
                    pointerEvents: 'none',
                    opacity: 0.8,
                  }}
                >
                  {b.count} paper{b.count !== 1 ? 's' : ''}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </BentoCard>
  )
}
