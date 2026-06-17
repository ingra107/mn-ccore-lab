import { useRef, useEffect, useState } from 'react'
import { ACCENT_GOLD, withAlpha } from '../lib/taskGrouping'

interface CLIFSite {
  name: string
  short: string
  city: string
  region: 'West' | 'Midwest' | 'Northeast' | 'Southeast'
  isHome?: boolean
}

const sites: CLIFSite[] = [
  { name: 'University of Minnesota',      short: 'UMN',     city: 'Minneapolis, MN',     region: 'Midwest', isHome: true },
  { name: 'University of Chicago',         short: 'UChicago', city: 'Chicago, IL',         region: 'Midwest' },
  { name: 'Rush University',               short: 'Rush',    city: 'Chicago, IL',         region: 'Midwest' },
  { name: 'Northwestern University',       short: 'Northwestern', city: 'Chicago, IL',    region: 'Midwest' },
  { name: 'Loyola University',             short: 'Loyola',  city: 'Maywood, IL',         region: 'Midwest' },
  { name: 'University of Michigan',        short: 'Michigan', city: 'Ann Arbor, MI',      region: 'Midwest' },
  { name: 'University of Colorado',        short: 'Colorado', city: 'Denver, CO',         region: 'West' },
  { name: 'Oregon Health & Science',       short: 'OHSU',    city: 'Portland, OR',        region: 'West' },
  { name: 'University of Washington',      short: 'UW',      city: 'Seattle, WA',         region: 'West' },
  { name: 'University of Pennsylvania',    short: 'Penn',    city: 'Philadelphia, PA',    region: 'Northeast' },
  { name: 'Johns Hopkins University',      short: 'Hopkins', city: 'Baltimore, MD',       region: 'Northeast' },
  { name: 'Beth Israel Deaconess',         short: 'BIDMC',   city: 'Boston, MA',          region: 'Northeast' },
  { name: 'Emory University',              short: 'Emory',   city: 'Atlanta, GA',         region: 'Southeast' },
]

const REGION_ORDER: CLIFSite['region'][] = ['West', 'Midwest', 'Northeast', 'Southeast']

export default function CLIFMap() {
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
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.unobserve(entry.target)
        }
      }),
      { threshold: 0.15 },
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="section-ink"
      style={{ overflow: 'hidden' }}
    >
      <div
        className="py-8 sm:py-12 lg:py-16 content-container"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'transform 0.8s ease',
        }}
      >
        <div className="mb-8 sm:mb-10 max-w-2xl">
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
            style={{ color: 'rgba(255, 255, 255, 0.85)' }}
          >
            {sites.length} academic medical centers collaborating on ICU data standards
          </p>
        </div>

        <div
          className="grid gap-5"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          }}
        >
          {REGION_ORDER.map((region) => {
            const regionSites = sites.filter((s) => s.region === region)
            if (regionSites.length === 0) return null
            return (
              <div
                key={region}
                style={{
                  padding: '20px 20px 18px',
                  borderRadius: 'var(--radius-xl)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${withAlpha(ACCENT_GOLD, 15)}`,
                }}
              >
                <div
                  className="flex items-baseline justify-between mb-4"
                  style={{ gap: 8 }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '18px',
                      fontWeight: 500,
                      color: '#ffffff',
                    }}
                  >
                    {region}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      color: withAlpha(ACCENT_GOLD, 90),
                      fontWeight: 500,
                    }}
                  >
                    {regionSites.length} {regionSites.length === 1 ? 'site' : 'sites'}
                  </span>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {regionSites.map((site) => (
                    <li
                      key={site.name}
                      className="flex items-center gap-3"
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-md)',
                        background: site.isHome ? withAlpha(ACCENT_GOLD, 12) : 'transparent',
                        border: site.isHome ? `1px solid ${withAlpha(ACCENT_GOLD, 35)}` : '1px solid transparent',
                        transition: 'background 150ms ease, border-color 150ms ease',
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          display: 'inline-block',
                          width: site.isHome ? 10 : 8,
                          height: site.isHome ? 10 : 8,
                          borderRadius: 'var(--radius-circle)',
                          background: '#dcb355',
                          boxShadow: site.isHome ? '0 0 0 3px rgba(220,179,85,0.25)' : 'none',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: site.isHome ? 600 : 500,
                            color: '#ffffff',
                            lineHeight: 1.3,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={site.name}
                        >
                          {site.name}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'rgba(255,255,255,0.75)',
                            marginTop: 1,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {site.city}
                        </div>
                      </div>
                      {site.isHome && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: '#dcb355',
                            flexShrink: 0,
                          }}
                        >
                          Home
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
