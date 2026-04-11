import { useState, useRef, useEffect } from 'react'

interface CLIFSite {
  name: string
  city: string
  x: number
  y: number
  isHome?: boolean
}

const sites: CLIFSite[] = [
  { name: 'University of Minnesota', city: 'Minneapolis, MN', x: 480, y: 175, isHome: true },
  { name: 'University of Chicago', city: 'Chicago, IL', x: 545, y: 230 },
  { name: 'Rush University', city: 'Chicago, IL', x: 540, y: 235 },
  { name: 'Northwestern University', city: 'Chicago, IL', x: 550, y: 225 },
  { name: 'Loyola University', city: 'Maywood, IL', x: 535, y: 240 },
  { name: 'University of Michigan', city: 'Ann Arbor, MI', x: 585, y: 215 },
  { name: 'University of Colorado', city: 'Denver, CO', x: 310, y: 290 },
  { name: 'Emory University', city: 'Atlanta, GA', x: 620, y: 365 },
  { name: 'Oregon Health & Science', city: 'Portland, OR', x: 130, y: 165 },
  { name: 'University of Washington', city: 'Seattle, WA', x: 140, y: 125 },
  { name: 'University of Pennsylvania', city: 'Philadelphia, PA', x: 735, y: 240 },
  { name: 'Johns Hopkins University', city: 'Baltimore, MD', x: 720, y: 260 },
  { name: 'Beth Israel Deaconess', city: 'Boston, MA', x: 770, y: 200 },
]

// Simplified US mainland outline (viewBox 0 0 960 600)
// More recognizable shape with key geographic features
const US_OUTLINE =
  'M 130 120 L 145 115 L 175 130 L 200 135 L 230 125 L 260 130 ' +
  'L 280 140 L 310 140 L 340 145 L 370 135 L 400 130 L 430 135 ' +
  'L 460 140 L 490 155 L 510 170 L 490 175 L 495 180 ' + // Top border to Great Lakes
  'L 530 175 L 555 185 L 570 195 L 590 200 L 610 210 ' + // Great Lakes area
  'L 640 210 L 660 205 L 680 210 L 710 200 L 730 195 ' + // Northeast
  'L 755 185 L 770 195 L 780 210 L 775 230 L 765 250 ' + // New England down
  'L 750 260 L 740 270 L 745 280 L 735 295 L 720 310 ' + // Mid-Atlantic
  'L 700 325 L 680 340 L 665 355 L 650 370 L 640 380 ' + // Southeast coast
  'L 620 390 L 600 395 L 575 400 L 555 410 L 530 415 ' + // Gulf coast
  'L 500 420 L 470 430 L 440 440 L 410 445 L 380 445 ' + // Gulf to TX
  'L 350 440 L 330 445 L 310 460 L 290 470 L 270 465 ' + // Texas
  'L 260 440 L 250 420 L 240 400 L 230 380 ' + // Texas-Mexico border
  'L 210 370 L 190 355 L 170 340 L 155 320 ' + // NM, AZ
  'L 130 310 L 115 290 L 100 270 L 95 250 ' + // AZ, southern CA
  'L 90 230 L 95 200 L 105 180 L 115 160 L 125 140 Z' // CA coast up

export default function CLIFMap() {
  const [hoveredSite, setHoveredSite] = useState<CLIFSite | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15 }
    )

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  const handleMouseMove = (e: React.MouseEvent, site: CLIFSite) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    // Convert SVG coords to screen-relative position within the container
    const scaleX = rect.width / 960
    const scaleY = rect.height / 600
    setTooltipPos({
      x: rect.left + site.x * scaleX - rect.left,
      y: rect.top + site.y * scaleY - rect.top,
    })
    void e // suppress unused warning
  }

  return (
    <section
      ref={sectionRef}
      className="section-ink"
      style={{ overflow: 'hidden' }}
    >
      <div
        className="py-8 sm:py-12 lg:py-16 content-container"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(30px)',
          transition: 'opacity 0.8s ease, transform 0.8s ease',
        }}
      >
        {/* Header */}
        <div className="mb-8 sm:mb-12 max-w-2xl">
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl mb-3 sm:mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              color: '#ffffff',
              lineHeight: 1.2,
            }}
          >
            CLIF Consortium Network
          </h2>
          <p
            className="text-base sm:text-lg"
            style={{
              color: 'rgba(255, 255, 255, 0.8)',
            }}
          >
            13 academic medical centers collaborating on ICU data standards
          </p>
        </div>

        {/* Map container */}
        <div className="relative w-full" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <svg
            ref={svgRef}
            viewBox="0 0 960 600"
            className="w-full h-auto"
            style={{ overflow: 'visible' }}
            aria-label="Map of CLIF Consortium sites across the United States"
            role="img"
          >
            <defs>
              {/* Pulse animation for home site */}
              <radialGradient id="pulse-gradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#c9a84c" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#c9a84c" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* US outline */}
            <path
              d={US_OUTLINE}
              fill="rgba(232, 239, 245, 0.08)"
              stroke="rgba(201, 168, 76, 0.15)"
              strokeWidth="1.5"
            />

            {/* Connection lines from UMN to each site */}
            {sites
              .filter((s) => !s.isHome)
              .map((site) => (
                <line
                  key={`line-${site.name}`}
                  x1={480}
                  y1={175}
                  x2={site.x}
                  y2={site.y}
                  stroke="rgba(201, 168, 76, 0.08)"
                  strokeWidth="0.5"
                  strokeDasharray="4 4"
                />
              ))}

            {/* Site dots */}
            {sites.map((site) => (
              <g key={site.name}>
                {/* Home site pulse rings */}
                {site.isHome && (
                  <>
                    <circle
                      cx={site.x}
                      cy={site.y}
                      r="18"
                      fill="none"
                      stroke="rgba(201, 168, 76, 0.3)"
                      strokeWidth="1"
                      className="clif-pulse-ring"
                    />
                    <circle
                      cx={site.x}
                      cy={site.y}
                      r="18"
                      fill="none"
                      stroke="rgba(201, 168, 76, 0.2)"
                      strokeWidth="1"
                      className="clif-pulse-ring-delayed"
                    />
                  </>
                )}

                {/* Dot */}
                <circle
                  cx={site.x}
                  cy={site.y}
                  r={site.isHome ? 12 : 8}
                  fill="#c9a84c"
                  stroke={site.isHome ? '#ffffff' : 'rgba(255, 255, 255, 0.3)'}
                  strokeWidth={site.isHome ? 2 : 1}
                  className="cursor-pointer"
                  style={{
                    filter: site.isHome ? 'drop-shadow(0 0 6px rgba(201, 168, 76, 0.6))' : 'none',
                    transition: 'r 0.2s ease, filter 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    setHoveredSite(site)
                    handleMouseMove(e, site)
                  }}
                  onMouseMove={(e) => handleMouseMove(e, site)}
                  onMouseLeave={() => setHoveredSite(null)}
                />

                {/* Home label */}
                {site.isHome && (
                  <text
                    x={site.x}
                    y={site.y - 20}
                    textAnchor="middle"
                    fill="rgba(201, 168, 76, 0.6)"
                    style={{
                      fontSize: '10px',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                    }}
                  >
                    UMN
                  </text>
                )}
              </g>
            ))}

            {/* Cluster labels */}
            <text
              x={542}
              y={262}
              textAnchor="middle"
              fill="rgba(255,255,255,0.7)"
              style={{
                fontSize: '11px',
              }}
            >
              Chicago
            </text>
            <text
              x={740}
              y={288}
              textAnchor="middle"
              fill="rgba(255,255,255,0.7)"
              style={{
                fontSize: '11px',
              }}
            >
              East Coast
            </text>
            <text
              x={135}
              y={190}
              textAnchor="middle"
              fill="rgba(255,255,255,0.7)"
              style={{
                fontSize: '11px',
              }}
            >
              Pacific NW
            </text>
          </svg>

          {/* Tooltip */}
          {hoveredSite && (
            <div
              className="absolute pointer-events-none z-20"
              style={{
                left: `${(tooltipPos.x / (svgRef.current?.getBoundingClientRect().width ?? 800)) * 100}%`,
                top: `${(tooltipPos.y / (svgRef.current?.getBoundingClientRect().height ?? 500)) * 100}%`,
                transform: 'translate(-50%, -120%)',
              }}
            >
              <div
                className="px-4 py-3 rounded-lg whitespace-nowrap"
                style={{
                  background: 'var(--cream)',
                  boxShadow: 'var(--shadow-card-hover)',
                  border: '1px solid rgba(201, 168, 76, 0.3)',
                }}
              >
                <p
                  className="text-sm font-semibold"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: 'var(--ink)',
                    marginBottom: '2px',
                  }}
                >
                  {hoveredSite.name}
                </p>
                <p
                  className="text-xs"
                  style={{
                    color: 'var(--slate)',
                  }}
                >
                  {hoveredSite.city}
                  {hoveredSite.isHome && (
                    <span
                      style={{
                        color: 'var(--gold)',
                        marginLeft: '8px',
                        fontSize: '10px',
                      }}
                    >
                      HOME
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div
          className="mt-8 flex items-center justify-center gap-6"
          style={{
            fontSize: '12px',
            color: 'rgba(255, 255, 255, 0.5)',
          }}
        >
          <span className="flex items-center gap-2">
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: 'var(--radius-circle)',
                background: '#c9a84c',
              }}
            />
            CLIF Consortium Sites
          </span>
          <span style={{ color: 'rgba(201, 168, 76, 0.5)' }}>
            {sites.length} Centers
          </span>
        </div>
      </div>

      {/* Pulse animation CSS */}
      <style>{`
        @keyframes clifPulse {
          0% { r: 12; opacity: 0.6; }
          100% { r: 32; opacity: 0; }
        }
        @keyframes clifPulseDelayed {
          0% { r: 12; opacity: 0.4; }
          100% { r: 40; opacity: 0; }
        }
        .clif-pulse-ring {
          animation: clifPulse 2.5s ease-out infinite;
        }
        .clif-pulse-ring-delayed {
          animation: clifPulseDelayed 2.5s ease-out infinite;
          animation-delay: 0.8s;
        }
        @media (prefers-reduced-motion: reduce) {
          .clif-pulse-ring,
          .clif-pulse-ring-delayed {
            animation: none !important;
            opacity: 0.3 !important;
            r: 18 !important;
          }
        }
      `}</style>
    </section>
  )
}
