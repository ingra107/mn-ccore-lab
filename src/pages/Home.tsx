import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Stethoscope,
  BarChart3,
  Brain,
  Database,
  ChevronDown,
  ExternalLink,
} from 'lucide-react'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import SectionDivider from '../components/SectionDivider'

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
    description: 'Common Longitudinal ICU Format — founding member',
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

export default function Home() {
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
        {/* Topographic contour pattern */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M50 10c22 0 40 18 40 40s-18 40-40 40S10 72 10 50 28 10 50 10z' fill='none' stroke='%23c9a84c' stroke-width='0.5'/%3E%3Cpath d='M50 20c16.5 0 30 13.5 30 30s-13.5 30-30 30-30-13.5-30-30 13.5-30 30-30z' fill='none' stroke='%23c9a84c' stroke-width='0.5'/%3E%3Cpath d='M50 30c11 0 20 9 20 20s-9 20-20 20-20-9-20-20 9-20 20-20z' fill='none' stroke='%23c9a84c' stroke-width='0.5'/%3E%3Cpath d='M50 40c5.5 0 10 4.5 10 10s-4.5 10-10 10-10-4.5-10-10 4.5-10 10-10z' fill='none' stroke='%23c9a84c' stroke-width='0.5'/%3E%3C/svg%3E")`,
            backgroundSize: '200px 200px',
          }}
        />

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
          @keyframes bounceChevron {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(8px); }
          }
        `}</style>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <h1
            className="mb-6 transition-all duration-700"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 'clamp(3rem, 8vw, 6rem)',
              color: '#faf8f3',
              letterSpacing: '0.06em',
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
            }}
          >
            MN-CCORE
          </h1>

          <p
            className="mb-4 transition-all duration-700"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'clamp(1.1rem, 2.5vw, 1.6rem)',
              color: 'rgba(250, 248, 243, 0.85)',
              letterSpacing: '0.02em',
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: '200ms',
            }}
          >
            Minnesota Critical Care Outcomes & Research Effort
          </p>

          <p
            className="mb-8 transition-all duration-700"
            style={{
              fontFamily: 'var(--font-body)',
              fontStyle: 'italic',
              fontSize: 'clamp(1rem, 2vw, 1.25rem)',
              color: 'rgba(250, 248, 243, 0.6)',
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: '400ms',
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
              transitionDelay: '600ms',
            }}
          >
            University of Minnesota
          </p>

          <div className="mt-12 flex justify-center gap-4">
            <Link
              to="/team"
              className="cursor-pointer px-6 py-3 rounded-md text-sm font-semibold transition-all duration-200"
              style={{
                fontFamily: 'var(--font-body)',
                background: 'var(--gold)',
                color: '#0f1923',
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
                transitionDelay: '700ms',
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
                transitionDelay: '800ms',
              }}
            >
              Publications
            </Link>
          </div>
        </div>

        {/* Scroll chevron */}
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          style={{
            animation: 'bounceChevron 2s ease-in-out infinite',
            color: 'var(--gold)',
            opacity: 0.6,
          }}
        >
          <ChevronDown size={28} />
        </div>
      </section>

      <SectionDivider />

      {/* Research Pillars */}
      <section
        className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
        ref={pillarsRef}
      >
        <div className="mb-16 max-w-2xl">
          <h2
            className="fade-in-up text-3xl sm:text-4xl mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            Research Pillars
          </h2>
          <p
            className="fade-in-up text-lg"
            style={{ color: 'var(--slate)' }}
          >
            Our work spans four interconnected domains, each advancing the
            science of critical care delivery.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pillars.map((pillar) => {
            const Icon = pillar.icon
            return (
              <div
                key={pillar.title}
                className="fade-in-up card p-8 cursor-default"
                style={{
                  borderLeft: '4px solid var(--gold)',
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="flex-shrink-0 p-3 rounded-lg"
                    style={{
                      background: 'rgba(201, 168, 76, 0.1)',
                      color: 'var(--gold)',
                    }}
                  >
                    <Icon size={24} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3
                      className="text-xl mb-2"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        color: 'var(--ink)',
                      }}
                    >
                      {pillar.title}
                    </h3>
                    <p
                      className="text-base leading-relaxed"
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

      {/* Consortium & Affiliations */}
      <section
        className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
        ref={affiliatesRef}
      >
        <div className="mb-16 max-w-2xl">
          <h2
            className="fade-in-up text-3xl sm:text-4xl mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            Consortium & Affiliations
          </h2>
          <p
            className="fade-in-up text-lg"
            style={{ color: 'var(--slate)' }}
          >
            We are part of a growing network of institutions committed to
            improving critical care through collaboration and open science.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {affiliates.map((affiliate) => (
            <a
              key={affiliate.name}
              href={affiliate.href}
              target="_blank"
              rel="noopener noreferrer"
              className="fade-in-up card p-6 cursor-pointer group"
              style={{ textDecoration: 'none' }}
            >
              <div className="flex items-start justify-between mb-3">
                <h3
                  className="text-base font-semibold"
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
                />
              </div>
              <p
                className="text-sm leading-relaxed"
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
