import {
  MapPin,
  Mail,
  ExternalLink,
  Users,
} from 'lucide-react'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import SectionDivider from '../components/SectionDivider'

const affiliateLinks = [
  { label: 'CLIF Consortium', href: 'https://clif-icu.com/' },
  {
    label: 'CLIF GitHub',
    href: 'https://github.com/Common-Longitudinal-ICU-data-Format',
  },
  { label: 'UMN Department of Medicine', href: 'https://med.umn.edu/dom' },
  {
    label: 'Parker Healthcare Allocation Lab',
    href: 'https://healthcare-allocation-lab.github.io/',
  },
]

export default function Contact() {
  const contentRef = useScrollRevealGroup('.fade-in-up', 100)

  return (
    <>
      {/* Header */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <h1
          className="text-4xl sm:text-5xl mb-4"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            color: 'var(--ink)',
          }}
        >
          Contact
        </h1>
        <p
          className="text-lg max-w-2xl"
          style={{ color: 'var(--slate)' }}
        >
          Interested in collaborating, joining our team, or learning more about
          our research? We would love to hear from you.
        </p>
      </section>

      <SectionDivider />

      <section
        className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
        ref={contentRef}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left: Contact Info */}
          <div>
            <div className="fade-in-up card p-8 mb-6">
              <div className="flex items-start gap-4 mb-6">
                <MapPin
                  size={20}
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: 'var(--gold)' }}
                />
                <div>
                  <h3
                    className="text-base font-semibold mb-2"
                    style={{
                      fontFamily: 'var(--font-body)',
                      color: 'var(--ink)',
                    }}
                  >
                    Location
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--slate)' }}
                  >
                    University of Minnesota
                    <br />
                    Department of Medicine
                    <br />
                    Division of Pulmonary, Allergy, Critical Care & Sleep Medicine
                    <br />
                    Minneapolis, MN
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Mail
                  size={20}
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: 'var(--gold)' }}
                />
                <div>
                  <h3
                    className="text-base font-semibold mb-2"
                    style={{
                      fontFamily: 'var(--font-body)',
                      color: 'var(--ink)',
                    }}
                  >
                    Email
                  </h3>
                  <a
                    href="mailto:mnccore@umn.edu"
                    className="cursor-pointer text-sm transition-colors duration-200"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--maroon)',
                    }}
                  >
                    mnccore@umn.edu
                  </a>
                </div>
              </div>
            </div>

            {/* Affiliate Links */}
            <div className="fade-in-up">
              <h3
                className="text-lg mb-4"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              >
                Affiliated Organizations
              </h3>
              <div className="space-y-2">
                {affiliateLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer flex items-center justify-between p-3 rounded-lg transition-all duration-200 group"
                    style={{
                      background: 'var(--ice)',
                      border: '1px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--gold)'
                      e.currentTarget.style.background = 'var(--gold-light)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'transparent'
                      e.currentTarget.style.background = 'var(--ice)'
                    }}
                  >
                    <span
                      className="text-sm font-medium"
                      style={{ color: 'var(--ink)' }}
                    >
                      {link.label}
                    </span>
                    <ExternalLink
                      size={14}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      style={{ color: 'var(--gold)' }}
                    />
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Join Our Team */}
          <div className="fade-in-up">
            <div
              className="p-8 rounded-lg"
              style={{
                background:
                  'linear-gradient(135deg, rgba(201,168,76,0.08) 0%, rgba(232,239,245,0.3) 100%)',
                border: '1px solid rgba(201, 168, 76, 0.15)',
              }}
            >
              <div className="flex items-center gap-3 mb-6">
                <Users
                  size={24}
                  style={{ color: 'var(--gold)' }}
                />
                <h2
                  className="text-2xl"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    color: 'var(--ink)',
                  }}
                >
                  Join Our Team
                </h2>
              </div>

              <p
                className="text-base leading-relaxed mb-6"
                style={{ color: 'var(--slate)' }}
              >
                We are always looking for motivated researchers, medical
                students, residents, and fellows interested in critical care
                outcomes research. Our lab offers mentored research experiences
                in:
              </p>

              <ul className="space-y-3 mb-8">
                {[
                  'Multi-center observational studies using the CLIF dataset',
                  'Clinical decision-making and provider behavior research',
                  'ICU quality measurement and improvement',
                  'Health services research and data science methods',
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-sm"
                    style={{ color: 'var(--ink)' }}
                  >
                    <span
                      className="flex-shrink-0 w-1.5 h-1.5 mt-2 rounded-full"
                      style={{ background: 'var(--gold)' }}
                    />
                    {item}
                  </li>
                ))}
              </ul>

              <p
                className="text-sm"
                style={{ color: 'var(--slate)' }}
              >
                To inquire about opportunities, please email{' '}
                <a
                  href="mailto:mnccore@umn.edu"
                  className="cursor-pointer font-medium transition-colors duration-200"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--maroon)',
                    fontSize: '13px',
                  }}
                >
                  mnccore@umn.edu
                </a>{' '}
                with your CV and a brief description of your research interests.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
