import { useEffect, useState, useMemo } from 'react'
// Link removed — hero cards use <a> for reliable full-page navigation
import {
  Stethoscope,
  BarChart3,
  Brain,
  Database,
  ExternalLink,
  ArrowRight,
} from 'lucide-react'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import { useCountUp } from '../hooks/useCountUp'
import { usePublications, useProjects, useTeam, useGrants } from '../hooks/useApiData'
import NetworkBackground from '../components/NetworkBackground'
import FeaturedResearch from '../components/FeaturedResearch'
import ResearchImpact from '../components/ResearchImpact'
import CollaborationNetwork from '../components/CollaborationNetwork'
import RecentActivity from '../components/RecentActivity'
import CLIFMap from '../components/CLIFMap'
import UpcomingMeetingBanner from '../components/UpcomingMeetingBanner'
import LatestDigest from '../components/LatestDigest'
import { usePageMeta } from '../hooks/usePageMeta'

const pillars = [
  {
    icon: Stethoscope,
    title: 'Provider Variation',
    description:
      'Characterizing how individual clinician practice patterns shape ICU outcomes across diverse hospital settings.',
    color: 'var(--gold)',
    stat: '6 active studies',
  },
  {
    icon: BarChart3,
    title: 'ICU Quality Metrics',
    description:
      'Developing and validating evidence-based quality measures for critical care using multi-center data.',
    color: 'var(--teal)',
    stat: '13 consortium sites',
  },
  {
    icon: Brain,
    title: 'Clinical Decision-Making',
    description:
      'Understanding how cognitive styles and heuristics influence provider behavior at the bedside.',
    color: 'var(--maroon)',
    stat: '2 NIH-funded',
  },
  {
    icon: Database,
    title: 'Multi-Center Data Science',
    description:
      'Building open data infrastructure through the CLIF Consortium to enable reproducible ICU research.',
    color: '#5b8abf',
    stat: 'Open source',
  },
]

const affiliates = [
  {
    name: 'CLIF Consortium',
    description: 'Common Longitudinal ICU Format -- founding member',
    href: 'https://clif-icu.com/',
  },
  {
    name: 'CLIF GitHub',
    description: 'Open-source data tools and specifications',
    href: 'https://github.com/Common-Longitudinal-ICU-data-Format',
  },
  {
    name: 'UMN Department of Medicine',
    description: 'University of Minnesota institutional home',
    href: 'https://med.umn.edu/dom',
  },
  {
    name: 'Parker Healthcare Allocation Lab',
    description: 'CLIF collaborator at University of Colorado',
    href: 'https://healthcare-allocation-lab.github.io/',
  },
]

function ImpactNumber({ value, suffix }: { value: number; suffix: string }) {
  const { count, ref } = useCountUp(value, 2000)
  return (
    <span ref={ref}>
      {count}{suffix}
    </span>
  )
}

export default function Home() {
  usePageMeta(
    'MN-CCORE | Minnesota Critical Care Outcomes & Research Effort',
    'MN-CCORE Lab at the University of Minnesota. Advancing critical care through data-driven discovery, provider variation research, and the CLIF Consortium.'
  )
  const [heroVisible, setHeroVisible] = useState(false)
  const { data: publications = [] } = usePublications()
  const { data: projects = [] } = useProjects()
  const { data: team = [] } = useTeam()
  const { data: grants = [] } = useGrants()
  const pillarsRef = useScrollRevealGroup('.fade-in-up', 150)
  const affiliatesRef = useScrollRevealGroup('.fade-in-up', 100)

  const impactMetrics = useMemo(() => {
    const pubCount = publications.length || 63
    const activeProjects = projects.filter(p => p.status === 'Active').length || 6
    const teamCount = team.length || 12
    const activeGrants = grants.filter(g => !g.proposed).length || 2
    return { pubCount, activeProjects, teamCount, activeGrants }
  }, [publications, projects, team, grants])

  // JSON-LD structured data for organization
  useEffect(() => {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'ResearchOrganization',
      'name': 'MN-CCORE',
      'alternateName': 'Minnesota Critical Care Outcomes & Research Effort',
      'url': 'https://mn-ccore-lab.pages.dev',
      'description': 'Multi-center ICU research lab at the University of Minnesota',
      'parentOrganization': {
        '@type': 'Organization',
        'name': 'University of Minnesota',
      },
      'address': {
        '@type': 'PostalAddress',
        'streetAddress': '420 Delaware St SE',
        'addressLocality': 'Minneapolis',
        'addressRegion': 'MN',
        'postalCode': '55455',
      },
    }
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(jsonLd)
    document.head.appendChild(script)
    return () => {
      document.head.removeChild(script)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setHeroVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      {/* ─── Hero ─── */}
      <section
        className="relative overflow-hidden"
        style={{
          paddingTop: '80px',
          paddingBottom: '0',
          background: 'linear-gradient(160deg, oklch(0.12 0.005 250) 0%, oklch(0.14 0.005 250) 35%, oklch(0.16 0.005 250) 60%, oklch(0.18 0.005 250) 100%)',
        }}
      >
        {/* Network background */}
        <NetworkBackground />

        {/* Golden glow overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 20% 40%, rgba(201,168,76,0.12) 0%, transparent 55%), radial-gradient(ellipse at 80% 60%, rgba(45,138,138,0.08) 0%, transparent 50%)',
            animation: 'gradientShift 20s ease-in-out infinite alternate',
          }}
        />

        <style>{`
          @keyframes gradientShift {
            0% { opacity: 0.5; transform: translate(0, 0); }
            100% { opacity: 0.9; transform: translate(3%, 2%); }
          }
        `}</style>

        <div className="relative z-10 content-container" style={{ paddingBottom: 'clamp(40px, 5vw, 64px)' }}>
          {/* Eyebrow */}
          <p
            className="mb-3 transition-all duration-700"
            style={{
              fontSize: '11px',
              color: 'var(--gold)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              opacity: heroVisible ? 0.8 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(16px)',
            }}
          >
            University of Minnesota
          </p>

          {/* Title */}
          <h1
            className="transition-all duration-700 inline-flex items-baseline gap-1"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 'clamp(2.8rem, 7vw, 5.5rem)',
              lineHeight: 0.95,
              letterSpacing: '-0.03em',
              color: 'var(--ink-bright, #fff)',
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(24px)',
              transitionDelay: '100ms',
            }}
          >
            MN
            <svg viewBox="0 0 44 22" style={{ width: 'clamp(2rem, 5vw, 4rem)', height: 'auto', display: 'inline-block', verticalAlign: 'baseline', marginBottom: '0.08em' }}>
              <path
                d="M 2 11 L 8 11 L 12 3 L 17 19 L 22 7 L 27 13 L 32 9 L 42 9"
                stroke="var(--gold)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            CCORE
          </h1>

          {/* Tagline — the single value proposition */}
          <p
            className="mt-3 mb-6 transition-all duration-700"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 300,
              fontSize: 'clamp(1.15rem, 2.2vw, 1.65rem)',
              lineHeight: 1.35,
              letterSpacing: '-0.02em',
              color: 'rgba(255, 255, 255, 0.75)',
              maxWidth: '600px',
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: '200ms',
            }}
          >
            Advancing critical care through collaborative, data-driven research.
          </p>

          {/* CTA buttons */}
          <div
            className="flex flex-wrap gap-3 mb-0 transition-all duration-700"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: '300ms',
            }}
          >
            <a
              href="/publications"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm transition-all duration-200"
              style={{
                background: 'var(--gold)',
                color: '#0b1017',
                fontWeight: 500,
                textDecoration: 'none',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              Explore Research
              <ArrowRight size={15} aria-hidden="true" />
            </a>
            <a
              href="/team"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm transition-all duration-200"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'rgba(255, 255, 255, 0.85)',
                fontWeight: 400,
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.10)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)' }}
            >
              Meet the Team
            </a>
          </div>
        </div>

        {/* ─── Impact Strip ─── */}
        <div
          className="relative z-10 transition-all duration-700"
          style={{
            borderTop: '1px solid rgba(201, 168, 76, 0.25)',
            background: 'rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(12px)',
            opacity: heroVisible ? 1 : 0,
            transform: heroVisible ? 'translateY(0)' : 'translateY(12px)',
            transitionDelay: '400ms',
          }}
        >
          <div className="content-container">
            <div
              className="grid grid-cols-2 sm:grid-cols-4 py-5 sm:py-6"
              style={{ gap: 0 }}
            >
              {[
                { value: impactMetrics.pubCount, suffix: '+', label: 'Publications' },
                { value: impactMetrics.activeProjects, suffix: '', label: 'Active Projects' },
                { value: 13, suffix: '+', label: 'Consortium Sites' },
                { value: impactMetrics.teamCount, suffix: '', label: 'Team Members' },
              ].map((metric, i) => (
                <div
                  key={metric.label}
                  className="text-center px-2"
                  style={{
                    borderRight: i < 3 ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                    // On 2-col mobile, remove border on 2nd and 4th items
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
                      letterSpacing: '-0.03em',
                      color: 'var(--gold)',
                      lineHeight: 1,
                    }}
                  >
                    <ImpactNumber value={metric.value} suffix={metric.suffix} />
                  </div>
                  <div
                    style={{
                      fontSize: '10px',
                      color: 'rgba(255, 255, 255, 0.5)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginTop: '6px',
                      fontWeight: 400,
                    }}
                  >
                    {metric.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Research Pillars ─── */}
      <div className="section-cream">
        <section
          id="research-pillars"
          className="py-10 sm:py-14 lg:py-18 content-container"
          ref={pillarsRef}
        >
          <div className="mb-8 sm:mb-10 max-w-2xl">
            <p
              className="fade-in-up text-xs mb-2"
              style={{
                color: 'var(--gold)',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
              }}
            >
              What We Study
            </p>
            <h2
              className="fade-in-up mb-3"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                fontSize: 'clamp(1.8rem, 4vw, 3rem)',
                color: 'var(--ink)',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
              }}
            >
              Four pillars of critical care research
            </h2>
            <p
              className="fade-in-up text-base leading-relaxed"
              style={{ color: 'var(--slate)' }}
            >
              Our work investigates how ICU care is delivered, measured, and improved — from individual provider decisions to consortium-wide data infrastructure.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {pillars.map((pillar) => {
              const Icon = pillar.icon
              return (
                <div
                  key={pillar.title}
                  className="fade-in-up card p-6 sm:p-7 cursor-default"
                  style={{
                    borderLeft: `4px solid ${pillar.color}`,
                    borderRadius: 'var(--radius-xl)',
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="flex-shrink-0 p-3 rounded-xl"
                      style={{
                        background: `${pillar.color}15`,
                      }}
                    >
                      <Icon size={24} strokeWidth={1.5} style={{ color: pillar.color }} aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                      <h3
                        className="text-lg sm:text-xl mb-2"
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 400,
                          color: 'var(--ink)',
                        }}
                      >
                        {pillar.title}
                      </h3>
                      <p
                        className="text-sm sm:text-base leading-relaxed mb-3"
                        style={{ color: 'var(--slate)' }}
                      >
                        {pillar.description}
                      </p>
                      <span
                        className="inline-block text-xs px-2.5 py-1 rounded-full"
                        style={{
                          fontSize: '10px',
                          letterSpacing: '0.04em',
                          background: `${pillar.color}12`,
                          color: pillar.color,
                          border: `1px solid ${pillar.color}20`,
                        }}
                      >
                        {pillar.stat}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <UpcomingMeetingBanner />

      <FeaturedResearch />

      {/* ─── CLIF Consortium — Map + Context ─── */}
      <div className="section-ink">
        <section className="py-10 sm:py-14 content-container">
          <div className="mb-6 sm:mb-8 max-w-2xl">
            <p
              className="text-xs mb-2"
              style={{
                color: 'var(--gold)',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
              }}
            >
              Multi-Center Network
            </p>
            <h2
              className="mb-3"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)',
                color: 'var(--ink-bright, #fff)',
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
              }}
            >
              The CLIF Consortium
            </h2>
            <p
              className="text-sm sm:text-base leading-relaxed"
              style={{ color: 'rgba(255, 255, 255, 0.6)' }}
            >
              13 academic medical centers contributing harmonized ICU data through the Common Longitudinal ICU Format. Together, we are building the open infrastructure that makes reproducible critical care research possible.
            </p>
          </div>
        </section>
      </div>
      <CLIFMap />

      <ResearchImpact />

      <CollaborationNetwork />

      <RecentActivity />

      <LatestDigest />

      {/* ─── Funding ─── */}
      <div className="section-cream">
        <section className="py-8 sm:py-10 content-container">
          <div className="text-center mb-6">
            <p
              className="text-xs sm:text-sm mb-4"
              style={{
                color: 'var(--slate)',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                opacity: 0.7,
              }}
            >
              Research funded by
            </p>
            <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-10 lg:gap-14">
              {[
                {
                  abbr: 'NIH',
                  name: 'National Institutes of Health',
                  href: 'https://www.nih.gov/',
                  colorClass: 'funding-nih',
                },
                {
                  abbr: 'NHLBI',
                  name: 'National Heart, Lung, and Blood Institute',
                  href: 'https://www.nhlbi.nih.gov/',
                  colorClass: 'funding-nhlbi',
                },
                {
                  abbr: 'NLM',
                  name: 'National Library of Medicine',
                  href: 'https://www.nlm.nih.gov/',
                  colorClass: 'funding-nlm',
                },
              ].map((agency) => (
                <a
                  key={agency.abbr}
                  href={agency.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group text-center transition-all duration-200 hover:scale-105"
                  style={{ textDecoration: 'none' }}
                >
                  <div
                    className={`text-2xl sm:text-3xl lg:text-4xl font-bold mb-1 ${agency.colorClass}`}
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      letterSpacing: '-0.02em',
                      lineHeight: 1,
                      opacity: 0.85,
                    }}
                  >
                    {agency.abbr}
                  </div>
                  <div
                    className="text-xs"
                    style={{
                      color: 'var(--slate)',
                      maxWidth: '140px',
                      lineHeight: 1.3,
                      opacity: 0.6,
                    }}
                  >
                    {agency.name}
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* Subtle divider */}
          <div
            style={{
              height: '1px',
              background: 'linear-gradient(to right, transparent, var(--gold), transparent)',
              opacity: 0.3,
            }}
          />
        </section>
      </div>

      {/* ─── Consortium & Affiliations ─── */}
      <div style={{ background: 'var(--ice)' }}>
        <section
          className="py-8 sm:py-10 content-container"
          ref={affiliatesRef}
        >
          <div className="mb-6 sm:mb-8 max-w-2xl">
            <h2
              className="fade-in-up text-2xl sm:text-3xl mb-2"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                color: 'var(--ink)',
                letterSpacing: '-0.02em',
              }}
            >
              Consortium & Affiliations
            </h2>
            <p
              className="fade-in-up text-sm sm:text-base"
              style={{ color: 'var(--slate)' }}
            >
              We are part of a growing network of institutions committed to
              improving critical care through collaboration and open science.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {affiliates.map((affiliate) => (
              <a
                key={affiliate.name}
                href={affiliate.href}
                target="_blank"
                rel="noopener noreferrer"
                className="fade-in-up card p-5 cursor-pointer group"
                style={{ textDecoration: 'none' }}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3
                    className="text-sm font-normal"
                    style={{
                      color: 'var(--ink)',
                    }}
                  >
                    {affiliate.name}
                  </h3>
                  <ExternalLink
                    size={14}
                    className="flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{ color: 'var(--gold)' }}
                    aria-hidden="true"
                  />
                </div>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: 'var(--slate)' }}
                >
                  {affiliate.description}
                </p>
              </a>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
