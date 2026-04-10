import { memo, useMemo, useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { GitBranch } from 'lucide-react'
import BentoCard from './BentoCard'
import { usePublications } from '../../hooks/useApiData'

interface Stage {
  label: string
  status: 'In Preparation' | 'In Review' | 'Published'
  count: number
  color: string
  colorEnd: string
}

function PipelineCard() {
  const { data: publications = [] } = usePublications()
  const [animated, setAnimated] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimated(true)
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const stages = useMemo<Stage[]>(() => {
    const prep = publications.filter((p) => p.status === 'In Preparation').length
    const review = publications.filter((p) => p.status === 'In Review').length
    const published = publications.filter((p) => p.status === 'Published').length
    return [
      { label: 'In Preparation', status: 'In Preparation', count: prep, color: '#ffffff', colorEnd: '#e8e0cc' },
      { label: 'In Review', status: 'In Review', count: review, color: '#c9a84c', colorEnd: '#b8943e' },
      { label: 'Published', status: 'Published', count: published, color: '#0f1923', colorEnd: '#1a2a3d' },
    ]
  }, [publications])

  const maxCount = Math.max(...stages.map((s) => s.count), 1)

  return (
    <BentoCard title="Publication Pipeline" subtitle="From bench to print" size="span-2x2" icon={GitBranch} noLift>
      <div ref={containerRef} className="flex flex-col h-full justify-center gap-6 py-2">
        {/* Funnel visualization */}
        <div className="flex flex-col gap-5">
          {stages.map((stage, i) => {
            const widthPct = Math.max((stage.count / maxCount) * 100, 12)
            return (
              <Link
                key={stage.status}
                to={`/publications`}
                className="group block"
                style={{ textDecoration: 'none' }}
              >
                {/* Stage label + count */}
                <div className="flex items-baseline justify-between mb-1.5">
                  <span
                    style={{
                      fontSize: 'var(--value-size)',
                      fontWeight: 'var(--label-weight)',
                      color: 'var(--ink)',
                    }}
                  >
                    {stage.label}
                  </span>
                  <span
                    style={{
                      fontSize: '22px',
                      fontWeight: 700,
                      color: i === 2 ? 'var(--ink)' : 'var(--gold)',
                      lineHeight: 1,
                    }}
                  >
                    {stage.count}
                  </span>
                </div>

                {/* Bar */}
                <div
                  style={{
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(201, 168, 76, 0.06)',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: animated ? `${widthPct}%` : '0%',
                      borderRadius: '8px',
                      background: `linear-gradient(135deg, ${stage.color}, ${stage.colorEnd})`,
                      transition: `width 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 150}ms`,
                      border: i === 0 ? '1px solid rgba(201, 168, 76, 0.2)' : 'none',
                      position: 'relative',
                    }}
                  >
                    {/* Shimmer on hover */}
                    <div
                      className="opacity-0 group-hover:opacity-100"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
                        transition: 'opacity 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Flow arrows between stages */}
        <div className="flex items-center justify-center gap-2 mt-1">
          {stages.map((stage, i) => (
            <div key={stage.label} className="flex items-center gap-2">
              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--slate)',
                  opacity: 0.6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {stage.label.split(' ').pop()}
              </div>
              {i < stages.length - 1 && (
                <svg width="16" height="8" viewBox="0 0 16 8" style={{ opacity: 0.3 }}>
                  <path d="M0 4 L12 4 M10 1 L14 4 L10 7" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
                </svg>
              )}
            </div>
          ))}
        </div>

        {/* Total count */}
        <div
          className="text-center"
          style={{
            fontSize: 'var(--label-size)',
            color: 'var(--slate)',
            opacity: 'var(--ink-label)',
          }}
        >
          {publications.length} total manuscripts tracked
        </div>
      </div>
    </BentoCard>
  )
}

export default memo(PipelineCard)
