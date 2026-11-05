import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { useLabFacts } from '../hooks/useLabFacts'
import { PublicHead, SecHead, PersonLink } from '../components/public/PublicParts'
import { rosterPeople } from '../lib/roster'
import { areaHref } from '../lib/researchAreas'
import PubRow from '../components/public/PubRow'

// Public home, pick A (2026-10-30 UI pairs desk, Nick: "A: Current opening,
// short lists"): the opening and the dark band stay exactly as they are; the
// lists under them are cut hard to three papers and five faces, each with a
// link to the full list. The separate Recent list is gone: it overlapped
// Selected work (fresh-eyes critique 7) and the full list is one click away.
const SELECTED = 3
const PEOPLE = 5
const BAR_MAX_PX = 64
const dash = '—'

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
      url: 'https://mnccore.org',
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
  const people = rosterPeople.slice(0, PEOPLE)
  const morePeople = rosterPeople.length - people.length
  const maxYear = Math.max(1, ...facts.byYear.map((y) => y.n))
  const thisYear = facts.byYear[facts.byYear.length - 1]
  const firstYear = facts.byYear[0]

  return (
    <div className="content-container pub-foot">
      <PublicHead
        kicker="MN-CCORE · University of Minnesota"
        title={<>We study how intensive care is <em>delivered</em>, measured and improved.</>}
        lede={`MN-CCORE, the Minnesota Critical Care Outcomes & Research Effort, is a research group in the University of Minnesota Department of Medicine. Our physicians and scientists study how clinicians' decisions shape ICU outcomes, and build open data tools with ${facts.sites} institutions to measure it.`}
      >
        <div className="pub-acts">
          <Link to="/publications" className="pub-btn pub-gold">Read the work</Link>
          <Link to="/team" className="pub-btn">Meet the team</Link>
        </div>
      </PublicHead>

      {/* The proof: live counts, fixed dark in both themes */}
      <section className="pub-band" aria-label="The lab in numbers">
        <div><b>{facts.papersShown ?? dash}</b><small>Papers by lab members, {firstYear.year} to {thisYear.year}</small></div>
        <div><b>{facts.activeProjects ?? dash}</b><small>Active research projects</small></div>
        <div><b>{facts.sites}</b><small>Institutions sharing ICU data</small></div>
        <div><b>{facts.people}</b><small>People on the team</small></div>
        {/* Bar heights are pixels, not percent of the row: the year and count
            labels share that row, so a percent height got squeezed and a 29 drew
            nearly as tall as a 42. */}
        <div className="pub-bars" role="img" aria-label={`Papers per year: ${facts.byYear.map((y) => `${y.year} ${y.n}`).join(', ')}`}>
          {facts.byYear.map((y, i) => (
            <div key={y.year} className={i === facts.byYear.length - 1 ? 'pub-cur' : undefined} title={`${y.year}: ${y.n} papers${i === facts.byYear.length - 1 ? ' so far' : ''}`}>
              <span className="pub-bar-n">{y.n}</span>
              <i style={{ height: y.n === 0 ? 0 : Math.max(3, (y.n / maxYear) * BAR_MAX_PX) }} />
              <span className="pub-bar-y">{String(y.year).slice(2)}</span>
            </div>
          ))}
        </div>
        <p className="pub-band-note" style={{ margin: 0 }}>
          {facts.activeGrants
            ? <>Funded by {facts.funders.join(' and ')} through {facts.activeGrants} active {facts.activeGrants === 1 ? 'grant' : 'grants'}{facts.mechanisms.length > 0 ? ` (${facts.mechanisms.join(', ')})` : ''}. </>
            : null}
          Co-Chair of the CLIF Consortium. <Link to="/network">See the network</Link>
        </p>
      </section>

      <SecHead title="What we study" />
      <div className="pub-areas">
        {facts.areas.map(({ area, papers }) => (
          <Link key={area.id} to={areaHref(area, facts.byYear.map((y) => y.year))} className="pub-area">
            <span className="pub-n">{papers} {papers === 1 ? 'paper' : 'papers'} since {firstYear.year}</span>
            <span className="pub-rt" style={{ margin: '4px 0 0' }}>{area.label}</span>
            <p>{area.blurb}</p>
          </Link>
        ))}
      </div>

      <SecHead title="Selected work" right={<Link to="/publications">All publications</Link>} />
      <div className="pub-card" style={{ padding: 8, marginTop: 12 }}>
        {selected.map((p) => <PubRow key={p.id} pub={p} />)}
      </div>

      <SecHead title="The people" count={facts.people} right={<Link to="/team">Meet the team</Link>} />
      <div className="pub-faces">
        {people.map((m) => <PersonLink key={m.slug ?? m.name} m={m} />)}
        {morePeople > 0 && <Link to="/team" className="pub-person pub-more">+{morePeople} more</Link>}
      </div>
    </div>
  )
}
