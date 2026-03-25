import {
  MapPin,
  Mail,
  ExternalLink,
  Users,
} from 'lucide-react'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import SectionDivider from '../components/SectionDivider'
import { usePageMeta } from '../hooks/usePageMeta'

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
  usePageMeta(
    'Contact | MN-CCORE Lab',
    'Contact the MN-CCORE Lab at the University of Minnesota. Learn about research opportunities, collaborations, and how to join our team.'
  )
  const contentRef = useScrollRevealGroup('.fade-in-up', 100)

  return (
    <>
      {/* Header */}
      <section className="pt-4 pb-6 sm:pb-8 content-container">
        <h1
          className="text-3xl sm:text-4xl lg:text-5xl mb-3 sm:mb-4"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            color: 'var(--ink)',
          }}
        >
          Contact
        </h1>
        <p
          className="text-base sm:text-lg max-w-2xl"
          style={{ color: 'var(--slate)' }}
        >
          Interested in collaborating, joining our team, or learning more about
          our research? We would love to hear from you.
        </p>
      </section>

      <SectionDivider />

      <section
        className="py-8 sm:py-12 lg:py-16 content-container"
        ref={contentRef}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left: Contact Info */}
          <div>
            <div className="fade-in-up card p-4 sm:p-6 mb-6">
              <div className="flex items-start gap-4 mb-6">
                <MapPin
                  size={20}
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: 'var(--gold)' }}
                  aria-hidden="true"
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
                    Mayo Memorial Building
                    <br />
                    420 Delaware St SE
                    <br />
                    Minneapolis, MN 55455
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Mail
                  size={20}
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: 'var(--gold)' }}
                  aria-hidden="true"
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

            {/* Google Maps Embed */}
            <div className="fade-in-up mb-6 rounded-lg overflow-hidden relative" style={{ border: '1px solid rgba(201, 168, 76, 0.15)', paddingBottom: '56.25%', height: 0 }}>
              <iframe
                title="MN-CCORE Lab Location - Mayo Memorial Building, University of Minnesota"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2822.764!2d-93.2315!3d44.9720!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x52b32d600f4e4541%3A0x6c4e4e1e4e4e4e4e!2sMayo+Memorial+Building%2C+University+of+Minnesota!5e0!3m2!1sen!2sus!4v1"
                className="absolute inset-0 w-full h-full"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
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
                      minHeight: '44px',
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
                      aria-hidden="true"
                    />
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Join Our Team */}
          <div className="fade-in-up">
            <div
              className="p-4 sm:p-6 rounded-lg"
              style={{
                background:
                  'linear-gradient(135deg, rgba(201,168,76,0.08) 0%, rgba(232,239,245,0.3) 100%)',
                border: '1px solid rgba(201, 168, 76, 0.15)',
              }}
            >
              <div className="flex items-center gap-3 mb-4 sm:mb-6">
                <Users
                  size={24}
                  style={{ color: 'var(--gold)' }}
                  aria-hidden="true"
                />
                <h2
                  className="text-xl sm:text-2xl"
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
                className="text-sm sm:text-base leading-relaxed mb-4 sm:mb-6"
                style={{ color: 'var(--slate)' }}
              >
                We are always looking for motivated researchers, medical
                students, residents, and fellows interested in critical care
                outcomes research. Our lab offers mentored research experiences
                in:
              </p>

              <ul className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-8">
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

              <div
                className="p-3 sm:p-4 rounded-lg"
                style={{
                  background: 'rgba(201, 168, 76, 0.08)',
                  border: '1px solid rgba(201, 168, 76, 0.12)',
                }}
              >
                <p
                  className="text-sm font-medium mb-2"
                  style={{ color: 'var(--ink)' }}
                >
                  Get in touch
                </p>
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
        </div>
      </section>
    </>
  )
}
