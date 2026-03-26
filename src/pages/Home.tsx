import { useEffect, useState } from 'react'
// Link removed — hero cards use <a> for reliable full-page navigation
import {
  Stethoscope,
  BarChart3,
  Brain,
  Database,
  ExternalLink,
  Handshake,
  GraduationCap,
  TrendingUp,
  ArrowRight,
} from 'lucide-react'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import { useCountUp } from '../hooks/useCountUp'
import NetworkBackground from '../components/NetworkBackground'
import ImpactMetrics from '../components/ImpactMetrics'
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

const heroStats = [
  { value: 13, suffix: '+', label: 'ICU Centers', detail: 'in the CLIF Consortium' },
  { value: 80, suffix: '+', label: 'Researchers', detail: 'across institutions' },
  { value: 56, suffix: '+', label: 'Publications', detail: 'in top journals' },
]

const pathways = [
  {
    icon: Handshake,
    title: 'Collaborate',
    description: 'Join our multi-center research network',
    to: '/team',
    accent: 'var(--gold)',
  },
  {
    icon: GraduationCap,
    title: 'Join Our Team',
    description: 'Training and mentorship opportunities',
    to: '/contact',
    accent: 'var(--teal)',
  },
  {
    icon: TrendingUp,
    title: 'Research Impact',
    description: 'Data, publications, and outcomes',
    to: '/dashboard',
    accent: 'var(--maroon)',
  },
]

function HeroStat({ value, suffix }: { value: number; suffix: string }) {
  const { count } = useCountUp(value, 1800, false)
  return (
    <span>{count}{suffix}</span>
  )
}

export default function Home() {
  usePageMeta(
    'MN-CCORE | Minnesota Critical Care Outcomes & Research Effort',
    'MN-CCORE Lab at the University of Minnesota. Advancing critical care through data-driven discovery, provider variation research, and the CLIF Consortium.'
  )
  const [heroVisible, setHeroVisible] = useState(false)
  const pillarsRef = useScrollRevealGroup('.fade-in-up', 150)
  const affiliatesRef = useScrollRevealGroup('.fade-in-up', 100)

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
      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{
          paddingTop: '100px',
          paddingBottom: 'clamp(48px, 6vw, 80px)',
          background: 'linear-gradient(160deg, #0f1923 0%, #152233 35%, #1a2a3a 60%, #243447 100%)',
        }}
      >
        {/* Network background */}
        <NetworkBackground />

        {/* Animated gradient overlay — golden glow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 20% 40%, rgba(201,168,76,0.1) 0%, transparent 55%), radial-gradient(ellipse at 80% 60%, rgba(45,138,138,0.06) 0%, transparent 50%)',
            animation: 'gradientShift 20s ease-in-out infinite alternate',
          }}
        />

        {/* Bottom fade to cream */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24"
          style={{
            background: 'linear-gradient(to top, var(--cream), transparent)',
            opacity: 0.15,
          }}
        />

        <style>{`
          @keyframes gradientShift {
            0% { opacity: 0.5; transform: translate(0, 0); }
            100% { opacity: 0.9; transform: translate(3%, 2%); }
          }
        `}</style>

        <div className="relative z-10 content-container">
          {/* Typography-first hero — left-aligned for editorial feel */}
          <div className="max-w-4xl">
            <p
              className="mb-3 sm:mb-4 transition-all duration-700"
              style={{
                fontFamily: 'var(--font-mono)',
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

            <h1
              className="transition-all duration-700"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 'clamp(2.8rem, 7vw, 5.5rem)',
                lineHeight: 0.95,
                letterSpacing: '-0.02em',
                color: '#faf8f3',
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(24px)',
                transitionDelay: '100ms',
              }}
            >
              MN-CCORE
            </h1>

            <p
              className="mt-2 sm:mt-3 mb-6 sm:mb-8 transition-all duration-700"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'clamp(1rem, 2vw, 1.3rem)',
                lineHeight: 1.5,
                color: 'rgba(250, 248, 243, 0.6)',
                maxWidth: '540px',
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
                transitionDelay: '200ms',
              }}
            >
              Advancing critical care through data-driven discovery, multi-center collaboration, and open science.
            </p>

            {/* Stats — inline, editorial */}
            <div
              className="flex flex-wrap gap-6 sm:gap-10 mb-10 sm:mb-14 transition-all duration-700"
              style={{
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
                transitionDelay: '300ms',
              }}
            >
              {heroStats.map((stat) => (
                <div key={stat.label}>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)',
                    fontWeight: 700,
                    color: 'var(--gold)',
                    lineHeight: 1,
                  }}>
                    <HeroStat value={stat.value} suffix={stat.suffix} />
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'rgba(250, 248, 243, 0.5)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginTop: '4px',
                  }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Audience pathway cards */}
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 transition-all duration-700"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: '400ms',
            }}
          >
            {pathways.map((path) => {
              const Icon = path.icon
              return (
                <a
                  key={path.title}
                  href={path.to}
                  className="hero-pathway group rounded-xl p-5 sm:p-6 flex items-center gap-4 transition-all duration-300"
                  style={{
                    textDecoration: 'none',
                    background: 'rgba(250, 248, 243, 0.04)',
                    border: '1px solid rgba(250, 248, 243, 0.08)',
                    backdropFilter: 'blur(8px)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(250, 248, 243, 0.08)'
                    e.currentTarget.style.borderColor = `${path.accent}55`
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(250, 248, 243, 0.04)'
                    e.currentTarget.style.borderColor = 'rgba(250, 248, 243, 0.08)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div
                    className="flex-shrink-0 p-3 rounded-lg"
                    style={{ background: `${path.accent}18` }}
                  >
                    <Icon size={22} strokeWidth={1.5} style={{ color: path.accent }} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3
                      className="text-base font-semibold"
                      style={{ fontFamily: 'var(--font-body)', fontWeight: 600, color: '#faf8f3', lineHeight: 1.2 }}
                    >
                      {path.title}
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(250, 248, 243, 0.45)' }}>
                      {path.description}
                    </p>
                  </div>
                  <ArrowRight
                    size={16}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-1"
                    style={{ color: path.accent }}
                    aria-hidden="true"
                  />
                </a>
              )
            })}
          </div>
        </div>
      </section>

      {/* Sections alternate backgrounds */}

      {/* Research Pillars — narrative structure */}
      <div className="section-cream">
        <section
          id="research-pillars"
          className="py-12 sm:py-16 lg:py-24 content-container"
          ref={pillarsRef}
        >
        <div className="mb-10 sm:mb-14 lg:mb-18 max-w-2xl">
          <p
            className="fade-in-up text-xs mb-3"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--gold)',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
            }}
          >
            What We Study
          </p>
          <h2
            className="fade-in-up mb-4 sm:mb-5"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'clamp(1.8rem, 4vw, 3rem)',
              color: 'var(--ink)',
              lineHeight: 1.1,
            }}
          >
            Four pillars of critical care research
          </h2>
          <p
            className="fade-in-up text-base sm:text-lg leading-relaxed"
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
                  borderRadius: '12px',
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
                        fontWeight: 600,
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
                        fontFamily: 'var(--font-mono)',
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

      <ImpactMetrics />

      <ResearchImpact />

      <CollaborationNetwork />

      <CLIFMap />

      <RecentActivity />

      <LatestDigest />

      {/* Funding */}
      <div className="section-cream">
        <section className="py-8 sm:py-12 lg:py-16 content-container">
          <div className="text-center mb-6 sm:mb-8">
            <p
              className="text-xs sm:text-sm mb-4"
              style={{
                fontFamily: 'var(--font-mono)',
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
                      fontFamily: 'var(--font-body)',
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

      {/* Consortium & Affiliations */}
      <div style={{ background: 'var(--ice)' }}>
        <section
          className="py-8 sm:py-12 lg:py-16 content-container"
          ref={affiliatesRef}
        >
          <div className="mb-8 sm:mb-12 lg:mb-16 max-w-2xl">
            <h2
              className="fade-in-up text-2xl sm:text-3xl lg:text-4xl mb-3 sm:mb-4"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              Consortium & Affiliations
            </h2>
            <p
              className="fade-in-up text-base sm:text-lg"
              style={{ color: 'var(--slate)' }}
            >
              We are part of a growing network of institutions committed to
              improving critical care through collaboration and open science.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {affiliates.map((affiliate) => (
              <a
                key={affiliate.name}
                href={affiliate.href}
                target="_blank"
                rel="noopener noreferrer"
                className="fade-in-up card p-5 sm:p-6 cursor-pointer group"
                style={{ textDecoration: 'none' }}
              >
                <div className="flex items-start justify-between mb-2 sm:mb-3">
                  <h3
                    className="text-sm sm:text-base font-semibold"
                    style={{
                      fontFamily: 'var(--font-body)',
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
                  className="text-xs sm:text-sm leading-relaxed"
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
