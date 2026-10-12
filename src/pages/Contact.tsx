import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { PublicHead, SecHead } from '../components/public/PublicParts'
import { RESEARCH_AREAS, areaHref } from '../lib/researchAreas'

const affiliateLinks = [
  { label: 'CLIF Consortium', href: 'https://clif-icu.com/' },
  { label: 'CLIF GitHub', href: 'https://github.com/Common-Longitudinal-ICU-data-Format' },
  { label: 'UMN Department of Medicine', href: 'https://med.umn.edu/dom' },
  { label: 'Parker Healthcare Allocation Lab', href: 'https://healthcare-allocation-lab.github.io/' },
]

export default function Contact() {
  usePageMeta(
    'Contact | MN-CCORE Lab',
    'Contact the MN-CCORE Lab at the University of Minnesota: where we are, how to write to us, and who we work with.'
  )

  return (
    <div className="content-container pub-foot">
      <PublicHead
        kicker="Contact"
        title={<>Find us, <em>write</em> to us.</>}
        lede="For a collaboration, a question about our research, or a press inquiry, email us. We read every message."
        small
      />

      <div className="pub-cols">
        <div>
          <SecHead title="Where we are" />
          <div className="pub-card" style={{ padding: 'clamp(16px, 3vw, 24px)', marginTop: 14 }}>
            <p className="pub-addr">
              University of Minnesota<br />
              Department of Medicine<br />
              Division of Pulmonary, Allergy, Critical Care &amp; Sleep Medicine<br />
              Mayo Memorial Building<br />
              420 Delaware St SE<br />
              Minneapolis, MN 55455
            </p>
            <p style={{ margin: '16px 0 0', fontSize: 15 }}>
              <a href="mailto:mnccore@umn.edu" className="pub-link">mnccore@umn.edu</a>
            </p>
          </div>
          <div className="pub-map">
            <iframe
              title="MN-CCORE Lab Location - Mayo Memorial Building, University of Minnesota"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2822.764!2d-93.2315!3d44.9720!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x52b32d600f4e4541%3A0x6c4e4e1e4e4e4e4e!2sMayo+Memorial+Building%2C+University+of+Minnesota!5e0!3m2!1sen!2sus!4v1"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>

        <div>
          <SecHead title="What we work on" />
          <div className="pub-card" style={{ padding: 8, marginTop: 14 }}>
            {RESEARCH_AREAS.map((a) => (
              <Link key={a.id} to={areaHref(a)} className="pub-row" style={{ alignItems: 'center' }}>
                <span className="pub-rt" style={{ fontSize: 16 }}>{a.label}</span>
              </Link>
            ))}
          </div>

          <SecHead title="Who we work with" />
          <div className="pub-card" style={{ padding: 8, marginTop: 14 }}>
            {affiliateLinks.map((link) => (
              <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="pub-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15 }}>{link.label}</span>
                <ExternalLink size={14} aria-hidden="true" style={{ color: 'var(--sk-t3)' }} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
