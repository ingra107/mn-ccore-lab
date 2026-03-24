import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Stethoscope,
  BarChart3,
  Brain,
  Database,
  ExternalLink,
} from 'lucide-react'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import { useCountUp } from '../hooks/useCountUp'
import SectionDivider from '../components/SectionDivider'
import NetworkBackground from '../components/NetworkBackground'
import ImpactMetrics from '../components/ImpactMetrics'
import FeaturedResearch from '../components/FeaturedResearch'
import { usePageMeta } from '../hooks/usePageMeta'

const pillars = [
  {
    icon: Stethoscope,
    title: 'Provider Variation',
    description:
      'Characterizing how individual clinician practice patterns shape ICU outcomes across diverse hospital settings.',
  },
  {
    icon: BarChart3,
    title: 'ICU Quality Metrics',
    description:
      'Developing and validating evidence-based quality measures for critical care using multi-center data.',
  },
  {
    icon: Brain,
    title: 'Clinical Decision-Making',
    description:
      'Understanding how cognitive styles and heuristics influence provider behavior at the bedside.',
  },
  {
    icon: Database,
    title: 'Multi-Center Data Science',
    description:
      'Building open data infrastructure through the CLIF Consortium to enable reproducible ICU research.',
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
  { value: 13, suffix: '+', label: 'Centers' },
  { value: 80, suffix: '+', label: 'Researchers' },
  { value: 150, suffix: '+', label: 'Publications' },
]

function HeroStat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { count } = useCountUp(value, 1800, false)
  return (
    <span>
      {count}{suffix} {label}
    </span>
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

  useEffect(() => {
    const timer = setTimeout(() => setHeroVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      {/* Hero */}
      <section
        className="relative min-h-screen flex items-center justify-center overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, #0f1923 0%, #1a2a3a 40%, #2c3e50 100%)',
        }}
      >
        {/* Network background */}
        <NetworkBackground />

        {/* Animated gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 30% 50%, rgba(201,168,76,0.08) 0%, transparent 60%)',
            animation: 'gradientShift 20s ease-in-out infinite alternate',
          }}
        />

        <style>{`
          @keyframes gradientShift {
            0% { opacity: 0.4; transform: translate(0, 0); }
            100% { opacity: 0.8; transform: translate(5%, 3%); }
          }
          @keyframes scrollLine {
            0%, 100% { opacity: 0.2; transform: translateY(0); }
            50% { opacity: 0.6; transform: translateY(6px); }
          }
          @media (prefers-reduced-motion: reduce) {
            .scroll-line { animation: none !important; opacity: 0.4 !important; }
          }
        `}</style>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          {/* SVG Logo - the hero centerpiece */}
          <div
            className="mb-6 sm:mb-8 transition-all duration-700"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
            }}
          >
            <img
              src="/logos/mnccore-logo-dark.svg"
              alt="MN-CCORE - Minnesota Critical Care Outcomes & Research Effort"
              className="mx-auto"
              style={{
                height: 'clamp(60px, 12vw, 100px)',
                width: 'auto',
              }}
            />
          </div>

          <p
            className="mb-6 sm:mb-8 transition-all duration-700"
            style={{
              fontFamily: 'var(--font-body)',
              fontStyle: 'italic',
              fontSize: 'clamp(1rem, 2vw, 1.25rem)',
              color: 'rgba(250, 248, 243, 0.6)',
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: '300ms',
            }}
          >
            Advancing Critical Care Through Data-Driven Discovery
          </p>

          <p
            className="transition-all duration-700"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'rgba(201, 168, 76, 0.7)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: '500ms',
            }}
          >
            University of Minnesota
          </p>

          {/* Hero stats bar */}
          <div
            className="mt-6 sm:mt-8 mb-2 transition-all duration-700 flex justify-center items-center gap-3"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: 'rgba(201, 168, 76, 0.5)',
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: '400ms',
            }}
          >
            {heroStats.map((stat, i) => (
              <span key={stat.label} className="flex items-center gap-3">
                {i > 0 && <span aria-hidden="true">&middot;</span>}
                <HeroStat value={stat.value} suffix={stat.suffix} label={stat.label} />
              </span>
            ))}
          </div>

          <div className="mt-4 sm:mt-8 flex justify-center gap-4">
            <Link
              to="/team"
              className="cursor-pointer px-6 py-3 rounded-md text-sm font-semibold transition-all duration-200"
              style={{
                fontFamily: 'var(--font-body)',
                background: 'var(--gold)',
                color: '#0f1923',
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
                transitionDelay: '600ms',
              }}
            >
              Meet the Team
            </Link>
            <Link
              to="/publications"
              className="cursor-pointer px-6 py-3 rounded-md text-sm font-semibold transition-all duration-200"
              style={{
                fontFamily: 'var(--font-body)',
                border: '1px solid rgba(250, 248, 243, 0.3)',
                color: '#faf8f3',
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
                transitionDelay: '700ms',
              }}
            >
              Publications
            </Link>
          </div>
        </div>

        {/* Scroll indicator line */}
        <div
          className="scroll-line absolute bottom-8 left-1/2 -translate-x-1/2"
          style={{
            width: '1px',
            height: '40px',
            background: 'var(--gold)',
            animation: 'scrollLine 2s ease-in-out infinite',
          }}
          aria-hidden="true"
        />
      </section>

      <SectionDivider />

      {/* Research Pillars */}
      <section
        className="py-8 sm:py-12 lg:py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
        ref={pillarsRef}
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
            Research Pillars
          </h2>
          <p
            className="fade-in-up text-base sm:text-lg"
            style={{ color: 'var(--slate)' }}
          >
            Our work spans four interconnected domains, each advancing the
            science of critical care delivery.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {pillars.map((pillar) => {
            const Icon = pillar.icon
            return (
              <div
                key={pillar.title}
                className="fade-in-up card p-4 sm:p-6 cursor-default"
                style={{
                  borderLeft: '4px solid var(--gold)',
                }}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div
                    className="flex-shrink-0 p-2.5 sm:p-3 rounded-lg"
                    style={{
                      background: 'rgba(201, 168, 76, 0.1)',
                      color: 'var(--gold)',
                    }}
                  >
                    <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <div>
                    <h3
                      className="text-lg sm:text-xl mb-1.5 sm:mb-2"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        color: 'var(--ink)',
                      }}
                    >
                      {pillar.title}
                    </h3>
                    <p
                      className="text-sm sm:text-base leading-relaxed"
                      style={{ color: 'var(--slate)' }}
                    >
                      {pillar.description}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <SectionDivider />

      <FeaturedResearch />

      <ImpactMetrics />

      <SectionDivider />

      {/* Consortium & Affiliations */}
      <section
        className="py-8 sm:py-12 lg:py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
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
    </>
  )
}
