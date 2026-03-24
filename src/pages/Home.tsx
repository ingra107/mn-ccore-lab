import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Stethoscope,
  BarChart3,
  Brain,
  Database,
  ExternalLink,
  Users,
  BookOpen,
  FlaskConical,
  Mail,
} from 'lucide-react'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import { useCountUp } from '../hooks/useCountUp'
import SectionDivider from '../components/SectionDivider'
import NetworkBackground from '../components/NetworkBackground'
import ImpactMetrics from '../components/ImpactMetrics'
import FeaturedResearch from '../components/FeaturedResearch'
import CLIFMap from '../components/CLIFMap'
import { usePageMeta } from '../hooks/usePageMeta'

const pillars = [
  {
    icon: Stethoscope,
    title: 'Provider Variation',
    description:
      'Characterizing how individual clinician practice patterns shape ICU outcomes across diverse hospital settings.',
    color: 'var(--gold)',
  },
  {
    icon: BarChart3,
    title: 'ICU Quality Metrics',
    description:
      'Developing and validating evidence-based quality measures for critical care using multi-center data.',
    color: 'var(--teal)',
  },
  {
    icon: Brain,
    title: 'Clinical Decision-Making',
    description:
      'Understanding how cognitive styles and heuristics influence provider behavior at the bedside.',
    color: 'var(--maroon)',
  },
  {
    icon: Database,
    title: 'Multi-Center Data Science',
    description:
      'Building open data infrastructure through the CLIF Consortium to enable reproducible ICU research.',
    color: '#5b8abf',
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
    <span>{count}{suffix}{label ? ` ${label}` : ''}</span>
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
      {/* Hero — compact, dense, no wasted space */}
      <section
        className="relative overflow-hidden pb-12 sm:pb-16"
        style={{
          paddingTop: '140px',
          background: 'linear-gradient(135deg, #0f1923 0%, #1a2a3a 40%, #2c3e50 100%)',
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
        `}</style>

        <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
          {/* SVG Logo */}
          <div
            className="mb-4 sm:mb-6 transition-all duration-700"
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
                height: 'clamp(80px, 15vw, 150px)',
                width: 'auto',
              }}
            />
          </div>

          <p
            className="mb-4 sm:mb-6 transition-all duration-700"
            style={{
              fontFamily: 'var(--font-body)',
              fontStyle: 'italic',
              fontSize: 'clamp(1.1rem, 2.5vw, 1.4rem)',
              color: 'rgba(250, 248, 243, 0.7)',
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: '200ms',
            }}
          >
            Advancing Critical Care Through Data-Driven Discovery
          </p>

          <p
            className="mb-6 transition-all duration-700"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: 'rgba(201, 168, 76, 0.7)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: '300ms',
            }}
          >
            University of Minnesota
          </p>

          {/* Stats — prominent, CLIF-style */}
          <div
            className="mb-8 transition-all duration-700 flex justify-center items-center gap-4 sm:gap-6"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: '400ms',
            }}
          >
            {heroStats.map((stat) => (
              <div
                key={stat.label}
                className="px-5 py-3 rounded-lg text-center"
                style={{ background: 'rgba(250, 248, 243, 0.08)', border: '1px solid rgba(201, 168, 76, 0.15)' }}
              >
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700, color: 'var(--gold)' }}>
                  <HeroStat value={stat.value} suffix={stat.suffix} label="" />
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(250, 248, 243, 0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div
            className="mb-10 sm:mb-12 flex flex-wrap justify-center gap-3 sm:gap-4 transition-all duration-700"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
              transitionDelay: '500ms',
            }}
          >
            <Link
              to="/team"
              className="cursor-pointer px-8 py-4 rounded-md text-base font-semibold transition-all duration-200"
              style={{ fontFamily: 'var(--font-body)', background: 'var(--gold)', color: '#0f1923' }}
            >
              Meet the Team
            </Link>
            <Link
              to="/publications"
              className="cursor-pointer px-8 py-4 rounded-md text-base font-semibold transition-all duration-200"
              style={{ fontFamily: 'var(--font-body)', border: '1px solid rgba(250, 248, 243, 0.3)', color: '#faf8f3' }}
            >
              Publications
            </Link>
            <button
              onClick={() => document.getElementById('research-pillars')?.scrollIntoView({ behavior: 'smooth' })}
              className="cursor-pointer px-8 py-4 rounded-md text-base font-semibold transition-all duration-200"
              style={{ fontFamily: 'var(--font-body)', background: 'transparent', border: '1px solid var(--gold)', color: 'var(--gold)' }}
            >
              Our Research
            </button>
          </div>

          {/* Action cards — INSIDE hero, dark variant */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto">
            {[
              { icon: Users, title: 'Our Team', description: 'Meet the researchers', to: '/team' },
              { icon: BookOpen, title: 'Publications', description: 'Research in top journals', to: '/publications' },
              { icon: FlaskConical, title: 'Active Projects', description: '18 ongoing studies', to: '/nick' },
              { icon: Mail, title: 'Contact & Join', description: 'Get involved', to: '/contact' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.title}
                  to={item.to}
                  className="cursor-pointer rounded-lg p-4 sm:p-5 text-center transition-all duration-200 group"
                  style={{
                    textDecoration: 'none',
                    background: 'rgba(250, 248, 243, 0.05)',
                    border: '1px solid rgba(201, 168, 76, 0.15)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(201, 168, 76, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(201, 168, 76, 0.4)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(250, 248, 243, 0.05)'
                    e.currentTarget.style.borderColor = 'rgba(201, 168, 76, 0.15)'
                  }}
                >
                  <Icon
                    size={24}
                    strokeWidth={1.5}
                    className="mx-auto mb-2"
                    style={{ color: 'var(--gold)' }}
                    aria-hidden="true"
                  />
                  <h3
                    className="text-sm sm:text-base font-semibold mb-0.5"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 600, color: '#faf8f3' }}
                  >
                    {item.title}
                  </h3>
                  <p className="text-xs" style={{ color: 'rgba(250, 248, 243, 0.5)' }}>
                    {item.description}
                  </p>
                </Link>
            )
          })}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Research Pillars */}
      <section
        id="research-pillars"
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
                className="fade-in-up card p-5 sm:p-6 cursor-default"
                style={{
                  borderLeft: `4px solid ${pillar.color}`,
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

      <CLIFMap />

      <SectionDivider />

      {/* Consortium & Affiliations */}
      <div style={{ background: 'var(--ice)' }}>
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
      </div>
    </>
  )
}
