import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ClipboardCopy, ExternalLink } from 'lucide-react'
import { usePublications, useLinkedProjects } from '../hooks/useApiData'
import { usePageMeta } from '../hooks/usePageMeta'
import { useAuth } from '../hooks/useAuth'
import { FaceDisc } from '../components/today/skin'
import { getAllMembers } from '../data/team'
import { resolveBylineAuthors } from '../lib/authorAvatars'
import { SkeletonBar } from '../components/LoadingSkeleton'
import { PATHS } from '../constants/paths'
import { QueryErrorNote } from '../components/QueryErrorNote'
import { SecHead } from '../components/public/PublicParts'
import PubRow from '../components/public/PubRow'
import type { Publication } from '../data/types'
import { topicLabel } from '../lib/topics'
import { RESEARCH_AREAS, inArea } from '../lib/researchAreas'
import { isPublished } from '../lib/publicationCounts'
import { compactStageLabel } from '../lib/projectStage'

function BackLink() {
  return (
    <Link to="/publications" className="pub-back">
      <ArrowLeft size={15} aria-hidden="true" />
      Back to publications
    </Link>
  )
}

export default function PublicationDetail() {
  const { id } = useParams<{ id: string }>()
  const decodedId = id ? decodeURIComponent(id) : ''

  const { data: publications = [], isLoading } = usePublications()
  const pub = publications.find((p) => p.id === decodedId)
  const labMembers = useMemo(() => getAllMembers(), [])

  usePageMeta(
    pub ? `${pub.title} | MN-CCORE` : 'Publication | MN-CCORE',
    pub?.abstract ?? 'MN-CCORE publication details.',
    'article'
  )

  // Loading is not "not found": a direct load used to flash the not-found
  // copy, then jump to the paper.
  if (!pub && isLoading) return <PublicationDetailSkeleton />

  if (!pub) {
    return (
      <div className="content-container pub-foot">
        <div style={{ paddingTop: 28 }}><BackLink /></div>
        <h1 className="pub-h1 pub-h1-sm" style={{ marginTop: 16 }}>Publication not found</h1>
        <p className="pub-lede">No publication matches the ID &ldquo;{decodedId}&rdquo;.</p>
      </div>
    )
  }

  // Faces come from the byline (Rule 89), never from stored author_slugs:
  // those credited non-authors and capped real ones at six (G12-5).
  const authorAvatars = resolveBylineAuthors(pub, labMembers)
    .map((a) => a.member)
    .filter((m): m is NonNullable<typeof m> => !!m)

  return (
    <div className="content-container pub-foot" style={{ maxWidth: 880 }}>
      <div style={{ paddingTop: 28 }}><BackLink /></div>

      <header style={{ marginTop: 18 }}>
        <p className="pub-kick">
          {pub.year}{isPublished(pub) ? '' : ` · ${pub.status}`}{pub.featured ? ' · Featured' : ''}
        </p>
        <h1 className="pub-h1 pub-h1-sm" style={{ fontSize: 'clamp(26px, 3.6vw, 40px)', lineHeight: 1.15, maxWidth: 'none' }}>{pub.title}</h1>
        <p className="pub-lede" style={{ fontSize: 16, lineHeight: 1.55, fontWeight: 400 }}>{pub.authors}</p>
        {authorAvatars.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
            {authorAvatars.map((person) => (
              <Link key={person.slug} to={`/team/${person.slug}`} title={person.name}>
                <FaceDisc label={person.name} initials={person.initials} photo={person.photoUrl} px={30} variant="brand" />
              </Link>
            ))}
          </div>
        )}
        {pub.journal && <p className="pub-rj" style={{ fontSize: 16, marginTop: 14 }}>{pub.journal}</p>}
      </header>

      <div className="pub-card" style={{ padding: 'clamp(16px, 3vw, 26px)', marginTop: 24 }}>
        {pub.abstract && <p className="pub-abstract">{pub.abstract}</p>}
        {pub.topics.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: pub.abstract ? 18 : 0 }}>
            {pub.topics.map((t) => (
              <Link key={t} to={`/publications?topic=${encodeURIComponent(t)}`} className="pub-chip">{topicLabel(t)}</Link>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: pub.abstract || pub.topics.length ? 18 : 0 }}>
          {pub.doi && (
            <a href={pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`} target="_blank" rel="noopener noreferrer" className="pub-btn pub-sm">
              DOI <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
          {pub.pubmed && (
            <a href={pub.pubmed.startsWith('http') ? pub.pubmed : `https://pubmed.ncbi.nlm.nih.gov/${pub.pubmed}`} target="_blank" rel="noopener noreferrer" className="pub-btn pub-sm">
              PubMed <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
          <CopyCitation pub={pub} />
          {!pub.doi && !pub.pubmed && !pub.abstract && <span className="pub-meta">No abstract or links on file yet.</span>}
        </div>
      </div>

      <LinkedProjectsSection publicationId={decodedId} />
      <TrialRegSection pub={pub} />
      <RelatedPublicationsSection pub={pub} allPubs={publications} />
    </div>
  )
}

/** Copy the citation. Moved here from the retired PublicationCard so the
 *  one-card list loses nothing; the label says whether it worked. */
function CopyCitation({ pub }: { pub: Publication }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    const doi = pub.doi ? ` ${pub.doi}` : ''
    try {
      await navigator.clipboard.writeText(`${pub.authors} (${pub.year}). ${pub.title}. ${pub.journal}.${doi}`)
      setState('copied')
    } catch {
      setState('failed')
    }
    window.setTimeout(() => setState('idle'), 2500)
  }
  return (
    <button type="button" className="pub-btn pub-sm" onClick={() => { void copy() }}>
      <ClipboardCopy size={12} aria-hidden="true" />
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy citation'}</span>
    </button>
  )
}

/** The page's own shape while the list loads: back link, kicker, two title
 *  lines, byline, journal, abstract card, at the loaded page's sizes. */
export function PublicationDetailSkeleton() {
  return (
    <div className="content-container pub-foot" style={{ maxWidth: 880 }} aria-busy="true" aria-label="Loading publication" data-testid="publication-detail-skeleton">
      <div style={{ paddingTop: 28 }}><BackLink /></div>
      <header style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SkeletonBar width={90} height={12} />
        <SkeletonBar width="92%" height={34} />
        <SkeletonBar width="64%" height={34} />
        <SkeletonBar width="80%" height={18} />
        <SkeletonBar width="40%" height={18} />
      </header>
      <div className="pub-card" style={{ padding: 'clamp(16px, 3vw, 26px)', marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {['100%', '97%', '99%', '94%', '98%', '60%'].map((w, i) => <SkeletonBar key={i} width={w} height={14} />)}
      </div>
    </div>
  )
}

// T-40 field not yet on the Publication schema; the section renders null until
// a trial-registry field lands.
type PublicationWithTrialReg = Publication & { nct_id?: string; trial_registry?: string }

function TrialRegSection({ pub }: { pub: PublicationWithTrialReg }) {
  const nct = pub.nct_id || pub.trial_registry
  if (!nct) return null
  const href = nct.startsWith('http') ? nct : `https://clinicaltrials.gov/study/${nct}`
  return (
    <section>
      <SecHead title="Trial registration" />
      <p style={{ marginTop: 12 }}>
        <a href={href} target="_blank" rel="noopener noreferrer" className="pub-link">{nct}</a>
      </p>
    </section>
  )
}

/** Papers in the same research area (the raw topic tags cover too few papers). */
function RelatedPublicationsSection({ pub, allPubs }: { pub: Publication; allPubs: Publication[] }) {
  const areas = RESEARCH_AREAS.filter((a) => inArea(pub, a))
  const related = allPubs
    .filter((p) => p.id !== pub.id && areas.some((a) => inArea(p, a)))
    .sort((a, b) => b.year - a.year)
    .slice(0, 4)
  if (related.length === 0) return null
  return (
    <section>
      <SecHead title="Related papers" count={areas.map((a) => a.label).join(', ')} />
      <div className="pub-card" style={{ padding: 8, marginTop: 12 }}>
        {related.map((p) => <PubRow key={p.id} pub={p} />)}
      </div>
    </section>
  )
}

// ── Linked projects ─────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = { clif: 'CLIF', lab: 'Lab', nate: 'Mesfin' }

// #124: `link_type` is a `paper_project_links` value (input/output/related) or,
// since #129, a `project_publications` junction role (primary/secondary/preprint).
const LINK_TYPE_LABEL: Record<string, string> = { primary: 'Published from this project' }

function LinkedProjectsSection({ publicationId }: { publicationId: string }) {
  // The linked-projects read is for members; a visitor would get a 401 and an error note.
  const { user } = useAuth()
  const { data: linkedProjects = [], isError, refetch } = useLinkedProjects(publicationId, { enabled: !!user?.isMember })

  // #507 follow-up: a bare `.length === 0` return-null used to silently vanish
  // this section on a thrown fetch failure too.
  if (linkedProjects.length === 0 && !isError) return null

  return (
    <section>
      {isError ? (
        <QueryErrorNote label="linked projects" onRetry={() => refetch()} />
      ) : (
        <>
          <SecHead title="Linked projects" count={linkedProjects.length} />
          <div className="pub-card" style={{ padding: 8, marginTop: 12 }}>
            {linkedProjects.map((project) => (
              <Link key={project.link_id} to={PATHS.project(project.slug)} className="pub-row" style={{ alignItems: 'center' }}>
                <span className="pub-chip" style={{ cursor: 'default' }}>{CATEGORY_LABEL[project.category ?? ''] ?? project.category ?? 'Other'}</span>
                <span className="pub-rt" style={{ flex: 1, minWidth: 0, fontSize: 15 }}>{project.title}</span>
                {project.link_type && project.link_type !== 'output' && (
                  <span className="pub-meta">{LINK_TYPE_LABEL[project.link_type] ?? project.link_type}</span>
                )}
                {compactStageLabel(project) && <span className="pub-meta">{compactStageLabel(project)}</span>}
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
