import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { useLabFacts } from '../hooks/useLabFacts'
import { PublicHead, SecHead, PersonLink } from '../components/public/PublicParts'
import { rosterPeople } from '../lib/roster'
import { areaHref } from '../lib/researchAreas'
import type { Publication } from '../data/types'

const SELECTED = 5
const RECENT = 6
const dash = '—'

function PaperRow({ p, to }: { p: Publication; to: string }) {
  return (
    <Link to={to} className="pub-row">
      <span className="pub-yr">{p.year}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="pub-rt">{p.title}</span>
        {p.journal && <span className="pub-rj">{p.journal}</span>}
      </span>
    </Link>
  )
}

export default function Home() {
  usePageMeta(
    'MN-CCORE | Minnesota Critical Care Outcomes & Research Effort',
    'MN-CCORE Lab at the University of Minnesota. We study how ICU care is delivered, measured and improved: provider variation, quality metrics and the CLIF Consortium.'
  )
  const facts = useLabFacts()

  // JSON-LD structured data for the organization
  useEffect(() => {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'ResearchOrganization',
      name: 'MN-CCORE',
      alternateName: 'Minnesota Critical Care Outcomes & Research Effort',
      url: 'https://mn-ccore-lab.pages.dev',
      description: 'Multi-center ICU research lab at the University of Minnesota',
      parentOrganization: { '@type': 'Organization', name: 'University of Minnesota' },
      address: {
        '@type': 'PostalAddress',
        streetAddress: '420 Delaware St SE',
        addressLocality: 'Minneapolis',
        addressRegion: 'MN',
        postalCode: '55455',
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

  const selected = (facts.featured.length >= 3 ? facts.featured : facts.recent).slice(0, SELECTED)
  const selectedIds = new Set(selected.map((p) => p.id))
  const recent = facts.recent.filter((p) => !selectedIds.has(p.id)).slice(0, RECENT)
  const maxYear = Math.max(1, ...facts.byYear.map((y) => y.n))
  const thisYear = facts.byYear[facts.byYear.length - 1]
  const firstYear = facts.byYear[0]

  return (
    <div className="content-container pub-foot">
      <PublicHead
        kicker="MN-CCORE · University of Minnesota"
        title={<>We study how intensive care is <em>delivered</em>, measured and improved.</>}
        lede={`MN-CCORE is a research group in the University of Minnesota Department of Medicine. Our physicians and scientists study how clinicians' decisions shape ICU outcomes, and build open data tools with ${facts.sites} hospitals to measure it.`}
      >
        <div className="pub-acts">
          <Link to="/publications" className="pub-btn pub-gold">Read the work</Link>
          <Link to="/team" className="pub-btn">Meet the team</Link>
        </div>
      </PublicHead>

      {/* The proof: live counts, fixed dark in both themes */}
      <section className="pub-band" aria-label="The lab in numbers">
        <div className="pub-band-papers">
          <b>{facts.papers ?? dash}</b>
          <small>Published papers, {firstYear.year} to {thisYear.year}</small>
          <div className="pub-bars" role="img" aria-label={`Papers per year: ${facts.byYear.map((y) => `${y.year} ${y.n}`).join(', ')}`}>
            {facts.byYear.map((y, i) => (
              <div key={y.year} className={i === facts.byYear.length - 1 ? 'pub-cur' : undefined} title={`${y.year}: ${y.n} papers${i === facts.byYear.length - 1 ? ' so far' : ''}`}>
                <span className="pub-bar-n">{y.n}</span>
                <i style={{ height: `${Math.max(4, (y.n / maxYear) * 100)}%` }} />
                <span className="pub-bar-y">{String(y.year).slice(2)}</span>
              </div>
            ))}
          </div>
        </div>
        <div><b>{facts.activeProjects ?? dash}</b><small>Active projects</small></div>
        <div><b>{facts.sites}</b><small>Hospitals sharing ICU data</small></div>
        <div><b>{facts.people}</b><small>People on the team</small></div>
        <p className="pub-band-note" style={{ margin: 0 }}>
          {facts.activeGrants
            ? <>Funded by {facts.funders.join(' and ')} through {facts.activeGrants} active {facts.activeGrants === 1 ? 'grant' : 'grants'}{facts.mechanisms.length > 0 ? ` (${facts.mechanisms.join(', ')})` : ''}. </>
            : null}
          Founding member of the CLIF Consortium. <Link to="/network">See the network</Link>
        </p>
      </section>

      <SecHead title="What we study" />
      <div className="pub-areas">
        {facts.areas.map(({ area, papers }) => (
          <Link key={area.id} to={areaHref(area)} className="pub-area">
            {papers != null && <span className="pub-n">{papers} {papers === 1 ? 'paper' : 'papers'}</span>}
            <span className="pub-rt" style={{ margin: '4px 0 0' }}>{area.label}</span>
            <p>{area.blurb}</p>
          </Link>
        ))}
      </div>

      <SecHead title="Selected work" right={<Link to="/publications">All publications</Link>} />
      <div className="pub-card" style={{ padding: 8, marginTop: 12 }}>
        {selected.map((p) => <PaperRow key={p.id} p={p} to={`/publications/${p.id}`} />)}
      </div>

      {recent.length > 0 && (
        <>
          <SecHead title="Recent" count={`newest of ${facts.papers ?? ''} papers`} />
          <div className="pub-card" style={{ padding: 8, marginTop: 12 }}>
            {recent.map((p) => (
              <Link key={p.id} to={`/publications/${p.id}`} className="pub-row pub-rrow">
                <span className="pub-yr" style={{ width: 40 }}>{p.year}</span>
                <span className="pub-rt">{p.title}</span>
                <span className="pub-meta">{p.journal}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <SecHead title="The people" count={facts.people} right={<Link to="/team">Meet the team</Link>} />
      <div className="pub-faces">
        {rosterPeople.map((m) => <PersonLink key={m.slug ?? m.name} m={m} />)}
      </div>
    </div>
  )
}
