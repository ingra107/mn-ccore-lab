import { useState, useRef, useEffect } from 'react'

interface CLIFSite {
  name: string
  city: string
  state: string
  x: number
  y: number
  isHome?: boolean
}

const sites: CLIFSite[] = [
  { name: 'University of Minnesota', city: 'Minneapolis', state: 'MN', x: 465, y: 165, isHome: true },
  { name: 'University of Chicago', city: 'Chicago', state: 'IL', x: 530, y: 225 },
  { name: 'University of Colorado', city: 'Denver', state: 'CO', x: 305, y: 295 },
  { name: 'University of Michigan', city: 'Ann Arbor', state: 'MI', x: 570, y: 210 },
  { name: 'University of Pennsylvania', city: 'Philadelphia', state: 'PA', x: 735, y: 245 },
  { name: 'Rush University', city: 'Chicago', state: 'IL', x: 540, y: 232 },
  { name: 'Emory University', city: 'Atlanta', state: 'GA', x: 620, y: 355 },
  { name: 'Oregon Health & Science', city: 'Portland', state: 'OR', x: 108, y: 155 },
  { name: 'Loyola University', city: 'Maywood', state: 'IL', x: 522, y: 218 },
  { name: 'Northwestern University', city: 'Chicago', state: 'IL', x: 535, y: 240 },
  { name: 'University of Washington', city: 'Seattle', state: 'WA', x: 115, y: 115 },
  { name: 'Johns Hopkins University', city: 'Baltimore', state: 'MD', x: 720, y: 260 },
  { name: 'Beth Israel Deaconess', city: 'Boston', state: 'MA', x: 770, y: 195 },
]

// Simplified US mainland outline
const US_OUTLINE =
  'M 85,190 C 85,190 78,215 75,240 C 72,265 70,290 75,315 C 80,340 90,360 100,380 ' +
  'C 110,400 130,415 155,425 C 180,435 210,430 240,420 C 270,410 290,400 310,395 ' +
  'C 330,390 345,400 360,410 C 375,420 395,432 415,435 C 435,438 455,432 475,430 ' +
  'C 495,428 510,432 530,428 C 550,424 570,435 590,430 C 610,425 630,415 650,400 ' +
  'C 660,390 672,375 685,360 C 695,348 708,338 720,325 C 732,312 745,295 755,278 ' +
  'C 762,265 768,250 772,235 C 776,220 778,205 772,192 C 766,180 755,175 742,178 ' +
  'C 730,181 720,190 710,200 C 700,210 688,218 675,222 C 662,226 648,222 635,216 ' +
  'C 622,210 608,208 595,205 C 580,202 565,198 550,193 C 535,188 520,183 505,178 ' +
  'C 490,173 475,168 460,162 C 445,156 430,152 415,148 C 400,144 385,142 370,143 ' +
  'C 355,144 340,148 325,152 C 310,156 295,160 280,162 C 265,164 250,163 235,160 ' +
  'C 220,157 205,152 190,147 C 175,142 160,138 145,135 C 130,132 118,130 110,135 ' +
  'C 102,140 95,150 90,165 C 87,175 85,185 85,190 Z'

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
      style={{
        background: 'var(--ink)',
        overflow: 'hidden',
      }}
    >
      <div
        className="py-12 sm:py-16 lg:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
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
              fontWeight: 600,
              color: '#faf8f3',
              lineHeight: 1.2,
            }}
          >
            CLIF Consortium Network
          </h2>
          <p
            className="text-base sm:text-lg"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'rgba(250, 248, 243, 0.8)',
            }}
          >
            13 academic medical centers collaborating on ICU data standards
          </p>
        </div>

        {/* Map container */}
        <div className="relative w-full" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <svg
            ref={svgRef}
            viewBox="0 60 960 540"
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
                  x1={465}
                  y1={165}
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
                  r={site.isHome ? 7 : 5}
                  fill="#c9a84c"
                  stroke={site.isHome ? '#faf8f3' : 'rgba(250, 248, 243, 0.3)'}
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
                    y={site.y - 18}
                    textAnchor="middle"
                    fill="rgba(201, 168, 76, 0.6)"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9px',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                    }}
                  >
                    UMN
                  </text>
                )}
              </g>
            ))}
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
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
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
                    fontFamily: 'var(--font-body)',
                    color: 'var(--slate)',
                  }}
                >
                  {hoveredSite.city}, {hoveredSite.state}
                  {hoveredSite.isHome && (
                    <span
                      style={{
                        color: 'var(--gold)',
                        fontFamily: 'var(--font-mono)',
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
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'rgba(250, 248, 243, 0.5)',
          }}
        >
          <span className="flex items-center gap-2">
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
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
          0% { r: 7; opacity: 0.6; }
          100% { r: 28; opacity: 0; }
        }
        @keyframes clifPulseDelayed {
          0% { r: 7; opacity: 0.4; }
          100% { r: 35; opacity: 0; }
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
