import { memo, useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Globe, ArrowRight } from 'lucide-react'
import BentoCard from './BentoCard'

// Approximate coordinates of CLIF consortium sites on a simplified US map
// Viewbox: 0,0 to 300,180
const CLIF_SITES = [
  { label: 'UMN (Minneapolis)', x: 170, y: 45 },
  { label: 'Northwestern', x: 182, y: 58 },
  { label: 'U Chicago', x: 184, y: 62 },
  { label: 'Rush', x: 181, y: 60 },
  { label: 'UPenn', x: 232, y: 65 },
  { label: 'Johns Hopkins', x: 236, y: 72 },
  { label: 'Emory', x: 210, y: 100 },
  { label: 'UCSF', x: 30, y: 68 },
  { label: 'UCLA', x: 35, y: 88 },
  { label: 'Michigan', x: 195, y: 55 },
  { label: 'Washington U', x: 175, y: 73 },
  { label: 'Columbia', x: 240, y: 60 },
  { label: 'OHSU', x: 32, y: 38 },
]

// Simplified US outline path
const US_PATH = 'M25,30 L50,25 L85,22 L110,25 L140,20 L165,20 L190,25 L210,30 L235,28 L255,30 L265,40 L270,55 L265,65 L260,75 L250,80 L245,90 L240,95 L230,105 L220,110 L210,115 L200,118 L185,120 L175,115 L165,110 L155,108 L145,110 L135,115 L125,118 L115,120 L105,118 L95,115 L85,118 L75,120 L65,118 L55,112 L45,108 L35,100 L30,90 L25,78 L22,65 L20,50 L22,40 Z'

function CLIFMiniCard() {
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
      { threshold: 0.2 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <BentoCard title="CLIF Consortium" subtitle="Multi-center ICU data" size="span-2" icon={Globe}>
      <div ref={containerRef} className="flex items-center gap-4" style={{ minHeight: '120px' }}>
        {/* Map */}
        <div className="flex-1 relative">
          <svg viewBox="0 0 300 140" width="100%" style={{ overflow: 'visible' }}>
            {/* US outline */}
            <path
              d={US_PATH}
              fill="none"
              stroke="var(--gold)"
              strokeWidth="1"
              opacity={0.15}
            />

            {/* Site dots */}
            {CLIF_SITES.map((site, i) => (
              <g key={site.label}>
                {/* Pulse ring */}
                <circle
                  cx={site.x}
                  cy={site.y}
                  r={animated ? 8 : 0}
                  fill="none"
                  stroke="#2d8a8a"
                  strokeWidth="0.5"
                  opacity={animated ? 0 : 0.4}
                  style={{
                    animation: animated ? `pulse-ring 3s ease-out ${i * 200}ms infinite` : 'none',
                  }}
                />
                {/* Dot */}
                <circle
                  cx={site.x}
                  cy={site.y}
                  r={animated ? 3.5 : 0}
                  fill="#2d8a8a"
                  opacity={0.85}
                  style={{
                    transition: `r 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${300 + i * 80}ms`,
                  }}
                />
                {/* Glow */}
                <circle
                  cx={site.x}
                  cy={site.y}
                  r={animated ? 6 : 0}
                  fill="#2d8a8a"
                  opacity={0.15}
                  style={{
                    transition: `r 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${300 + i * 80}ms`,
                  }}
                />
              </g>
            ))}
          </svg>

          {/* Inline keyframes for pulse */}
          <style>{`
            @keyframes pulse-ring {
              0% { r: 3.5; opacity: 0.4; }
              70% { r: 12; opacity: 0; }
              100% { r: 12; opacity: 0; }
            }
          `}</style>
        </div>

        {/* Stats + CTA */}
        <div className="flex-shrink-0 text-right" style={{ minWidth: '100px' }}>
          <div
            style={{
              fontSize: '36px',
              fontWeight: 700,
              color: 'var(--ink)',
              lineHeight: 1,
            }}
          >
            13
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--slate)',
              opacity: 0.7,
              marginTop: '4px',
            }}
          >
            sites across the US
          </div>
          <Link
            to="/nick"
            className="inline-flex items-center gap-1 mt-3"
            style={{
              fontSize: '10px',
              color: 'var(--gold)',
              textDecoration: 'none',
              transition: 'opacity 0.2s ease',
            }}
          >
            Learn more <ArrowRight size={10} />
          </Link>
        </div>
      </div>
    </BentoCard>
  )
}

export default memo(CLIFMiniCard)
