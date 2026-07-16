import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, FolderOpen } from 'lucide-react'
import { motion } from 'framer-motion'
import { usePublications, useLinkedProjects } from '../hooks/useApiData'
import { usePageMeta } from '../hooks/usePageMeta'
import Avatar from '../components/Avatar'
import { getPersonInfo } from '../data/team'
import { PATHS } from '../constants/paths'
import { ICON_PROPS } from '../lib/iconProps'
import { ACCENT_GOLD, withAlpha } from '../lib/taskGrouping'
import { QueryErrorNote } from '../components/QueryErrorNote'
import type { Publication } from '../data/types'

const TOPIC_DISPLAY: Record<string, string> = {
  clif: 'CLIF',
  covid: 'COVID-19',
  ventilation: 'Ventilation',
  'decision-making': 'Decision-Making',
  quality: 'Quality',
  sepsis: 'Sepsis',
  disparities: 'Disparities',
}

function topicLabel(topic: string) {
  return TOPIC_DISPLAY[topic] ?? topic.charAt(0).toUpperCase() + topic.slice(1)
}

export default function PublicationDetail() {
  const { id } = useParams<{ id: string }>()
  const decodedId = id ? decodeURIComponent(id) : ''

  const { data: publications = [] } = usePublications()
  const pub = publications.find((p) => p.id === decodedId)

  usePageMeta(
    pub ? `${pub.title} | MN-CCORE` : 'Publication | MN-CCORE',
    pub?.abstract ?? 'MN-CCORE publication details.',
    'article'
  )

  if (!pub) {
    return (
      <div className="content-container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <Link
          to="/publications"
          className="inline-flex items-center gap-2 mb-6"
          style={{
            fontSize: '14px',
            color: 'var(--slate)',
            textDecoration: 'none',
            opacity: 0.85,
          }}
        >
          <ArrowLeft {...ICON_PROPS} size={16} />
          Back to Publications
        </Link>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '1.75rem',
            color: 'var(--ink)',
          }}
        >
          Publication not found
        </h1>
        <p style={{ color: 'var(--slate)', marginTop: '0.5rem' }}>
          No publication matches the ID &ldquo;{decodedId}&rdquo;.
        </p>
      </div>
    )
  }

  const statusColors: Record<string, { bg: string; color: string }> = {
    Published: { bg: 'rgba(34,197,94,0.1)', color: 'var(--green)' },
    'In Review': { bg: 'var(--gold-active)', color: 'var(--gold)' },
    'In Preparation': { bg: 'rgba(100,116,139,0.1)', color: 'var(--slate)' },
  }
  const sc = statusColors[pub.status] ?? statusColors['In Preparation']

  // Parse author slugs for avatars
  const authorSlugs = (pub.authorSlugs ?? []).slice(0, 6)
  const authorAvatars = authorSlugs.map((slug) => ({ slug, ...getPersonInfo(slug) }))

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        {/* Back link */}
        <div style={{ paddingTop: '1.5rem', marginBottom: '1.5rem' }}>
          <Link
            to="/publications"
            className="inline-flex items-center gap-2 hover:!opacity-100 transition-opacity"
            style={{
              fontSize: '14px',
              color: 'var(--slate)',
              textDecoration: 'none',
              opacity: 0.85,
            }}
          >
            <ArrowLeft {...ICON_PROPS} size={16} />
            Back to Publications
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{
                fontSize: 'var(--label-size)',
                background: 'var(--gold-active)',
                color: 'var(--gold)',
                letterSpacing: '0.04em',
              }}
            >
              {pub.year}
            </span>
            <span
              className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{
                fontSize: 'var(--label-size)',
                background: sc.bg,
                color: sc.color,
              }}
            >
              {pub.status}
            </span>
            {pub.featured && (
              <span
                className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  fontSize: 'var(--label-size)',
                  background: 'var(--teal-active)',
                  color: 'var(--teal)',
                }}
              >
                Featured
              </span>
            )}
          </div>

          {/* Title */}
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'clamp(1.25rem, 3vw, 2rem)',
              color: 'var(--ink)',
              margin: '0 0 var(--sp-md) 0',
              lineHeight: 1.2,
            }}
          >
            {pub.title}
          </h1>

          {/* Authors */}
          <p
            style={{
              fontSize: '14px',
              color: 'var(--slate)',
              margin: '0 0 6px 0',
              lineHeight: 1.5,
            }}
          >
            {pub.authors}
          </p>

          {/* Author avatars */}
          {authorAvatars.length > 0 && (
            <div className="flex items-center gap-1 mb-4 mt-2">
              {authorAvatars.map((person) => (
                <Link
                  key={person.slug}
                  to={`/team/${person.slug}`}
                  title={person.name}
                  style={{ textDecoration: 'none' }}
                >
                  <div style={{ width: 28, height: 28 }}>
                    <Avatar
                      name={person.name}
                      initials={person.initials}
                      photoUrl={person.photoUrl}
                      variant="ice"
                      size="base-sm"
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Journal */}
          <p
            style={{
              fontSize: '14px',
              color: 'var(--slate)',
              fontStyle: 'italic',
              margin: '0 0 20px 0',
            }}
          >
            {pub.journal}
          </p>

          {/* Gold rule */}
          <div
            style={{
              height: '1px',
              background: 'linear-gradient(to right, var(--gold), transparent)',
              opacity: 0.85,
              marginBottom: '2rem',
            }}
          />
        </motion.div>

        {/* Abstract + Topics + Links */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
        >
          <div
            style={{
              background: 'var(--ice)',
              borderRadius: 'var(--radius-xl)',
              padding: '20px 24px',
            }}
          >
            {pub.abstract && (
              <p
                style={{
                  fontSize: '14px',
                  color: 'var(--ink)',
                  lineHeight: 1.7,
                  margin: '0 0 var(--sp-lg) 0',
                }}
              >
                {pub.abstract}
              </p>
            )}

            {pub.topics.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {pub.topics.map((t) => (
                  <Link
                    key={t}
                    to={`/publications?topic=${encodeURIComponent(t)}`}
                    className="inline-flex items-center px-2.5 py-1 rounded-full transition-colors hover:opacity-80"
                    style={{
                      fontSize: 'var(--label-size)',
                      background: 'var(--gold-active)',
                      color: 'var(--gold)',
                      textDecoration: 'none',
                    }}
                  >
                    {topicLabel(t)}
                  </Link>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {pub.doi && (
                <a
                  href={pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:opacity-80"
                  style={{
                    background: 'var(--gold-active)',
                    color: 'var(--gold)',
                    border: `1px solid ${withAlpha(ACCENT_GOLD, 20)}`,
                    textDecoration: 'none',
                    minHeight: '32px',
                  }}
                >
                  DOI <ExternalLink {...ICON_PROPS} size={10} />
                </a>
              )}
              {pub.pubmed && (
                <a
                  href={pub.pubmed.startsWith('http') ? pub.pubmed : `https://pubmed.ncbi.nlm.nih.gov/${pub.pubmed}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:opacity-80"
                  style={{
                    background: 'var(--teal-active)',
                    color: 'var(--teal)',
                    border: '1px solid rgba(45, 138, 138, 0.15)',
                    textDecoration: 'none',
                    minHeight: '32px',
                  }}
                >
                  PubMed <ExternalLink {...ICON_PROPS} size={10} />
                </a>
              )}
            </div>
          </div>
        </motion.div>

        {/* Linked Projects */}
        <LinkedProjectsSection publicationId={decodedId} />

        {/* T-40 stub sections — Trial Reg / Related Pubs / Press. Each
            only renders when it has something useful to show. */}
        <TrialRegSection pub={pub} />
        <RelatedPublicationsSection pub={pub} allPubs={publications} />
        <PressMentionsSection pub={pub} />
      </div>
    </div>
  )
}

// ── T-40 stub sections ───────────────────────────────────────

// T-40 fields not yet on the Publication schema — the section renders
// null until a trial-registry field lands (kept as an optional shape
// rather than `any` so a future schema addition is caught by the type
// system instead of silently type-checking anything).
type PublicationWithTrialReg = Publication & { nct_id?: string; trial_registry?: string }

function TrialRegSection({ pub }: { pub: PublicationWithTrialReg }) {
  const nct = pub.nct_id || pub.trial_registry
  if (!nct) return null
  const href = nct.startsWith('http') ? nct : `https://clinicaltrials.gov/study/${nct}`
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.25 }} style={{ marginTop: '2rem' }}>
      <div className="flex items-center gap-2 mb-3">
        <ExternalLink {...ICON_PROPS} size={16} style={{ color: 'var(--gold)' }} />
        <h2 style={{ fontWeight: 500, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>Trial Registration</h2>
      </div>
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', fontSize: 'var(--value-size)', textDecoration: 'underline' }}>
        {nct}
      </a>
    </motion.div>
  )
}

function RelatedPublicationsSection({ pub, allPubs }: { pub: Publication; allPubs: Publication[] }) {
  const related = (allPubs || [])
    .filter((p) => p.id !== pub.id && (p.topics || []).some((t) => (pub.topics || []).includes(t)))
    .slice(0, 3)
  if (related.length === 0) return null
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.3 }} style={{ marginTop: '2rem' }}>
      <div className="flex items-center gap-2 mb-3">
        <FolderOpen {...ICON_PROPS} size={16} style={{ color: 'var(--teal)' }} />
        <h2 style={{ fontWeight: 500, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>Related Publications</h2>
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.75 }}>{related.length}</span>
      </div>
      <div className="flex flex-col gap-2" style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: '16px 20px' }}>
        {related.map((p) => (
          <Link
            key={p.id}
            to={`/publications/${encodeURIComponent(p.id)}`}
            className="flex items-start gap-3 py-1.5"
            style={{ textDecoration: 'none', color: 'var(--ink)', borderBottom: `1px solid ${withAlpha(ACCENT_GOLD, 6)}` }}
          >
            <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75, flexShrink: 0, minWidth: 36 }}>{p.year}</span>
            <span style={{ fontSize: 'var(--value-size)', flex: 1 }}>{p.title}</span>
          </Link>
        ))}
      </div>
    </motion.div>
  )
}

function PressMentionsSection({ pub }: { pub: Publication }) {
  // Only for recent (last 3y) publications — older papers don't need the empty slot.
  const thisYear = new Date().getFullYear()
  if (!pub.year || pub.year < thisYear - 3) return null
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.35 }} style={{ marginTop: '2rem' }}>
      <div className="flex items-center gap-2 mb-3">
        <ExternalLink {...ICON_PROPS} size={16} style={{ color: 'var(--slate)', opacity: 0.85 }} />
        <h2 style={{ fontWeight: 500, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>Press & Mentions</h2>
      </div>
      <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', opacity: 0.85, margin: 0, padding: '16px 20px', background: 'var(--ice)', borderRadius: 'var(--radius-xl)' }}>
        No press mentions yet — share this page with your network to track coverage.
      </p>
    </motion.div>
  )
}

// ── Linked Projects Section ─────────────────────────────────

const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  clif: { bg: 'var(--maroon)', text: 'var(--ink-bright, #fff)', label: 'CLIF' },
  lab: { bg: 'var(--teal)', text: 'var(--ink-bright, #fff)', label: 'Lab' },
  nate: { bg: 'var(--gold)', text: '#0f1923', label: 'Mesfin' },
}

function LinkedProjectsSection({ publicationId }: { publicationId: string }) {
  const { data: linkedProjects = [], isError, refetch } = useLinkedProjects(publicationId)

  // #507 follow-up: a bare `.length === 0` return-null used to silently
  // vanish this whole section on a thrown fetch failure too.
  if (linkedProjects.length === 0 && !isError) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.2 }}
      style={{ marginTop: '2rem' }}
    >
      {isError ? (
        <QueryErrorNote label="linked projects" onRetry={() => refetch()} />
      ) : (
      <>
      <div className="flex items-center gap-2 mb-3">
        <FolderOpen {...ICON_PROPS} size={16} style={{ color: 'var(--teal)' }} />
        <h2
          style={{
            fontWeight: 500,
            fontSize: '16px',
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          Linked Projects
        </h2>
        <span
          style={{
            fontSize: 'var(--label-size)',
            color: 'var(--slate)',
            opacity: 0.75,
          }}
        >
          {linkedProjects.length}
        </span>
      </div>
      <div
        style={{
          background: 'var(--ice)',
          borderRadius: 'var(--radius-xl)',
          padding: '16px 20px',
        }}
      >
        <div className="flex flex-col gap-2">
          {linkedProjects.map((project) => {
            const cat = CATEGORY_COLORS[project.category ?? ''] ?? {
              bg: 'var(--slate)',
              text: 'var(--ink-bright, #fff)',
              label: project.category ?? 'Other',
            }
            return (
              <Link
                key={project.link_id}
                to={PATHS.project(project.slug)}
                className="flex items-center gap-3 py-2 transition-colors"
                style={{
                  textDecoration: 'none',
                  borderBottom: `1px solid ${withAlpha(ACCENT_GOLD, 6)}`,
                }}
              >
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                  style={{ background: cat.bg, color: cat.text, letterSpacing: '0.04em' }}
                >
                  {cat.label}
                </span>
                <span
                  style={{
                    fontSize: 'var(--value-size)',
                    color: 'var(--ink)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {project.title}
                </span>
                {project.link_type && project.link_type !== 'output' && (
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[10px]"
                    style={{
                      background: 'var(--teal-active)',
                      color: 'var(--teal)',
                    }}
                  >
                    {project.link_type}
                  </span>
                )}
                {project.stage && (
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--slate)',
                      opacity: 'var(--ink-label)',
                      flexShrink: 0,
                    }}
                  >
                    {project.stage}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </div>
      </>
      )}
    </motion.div>
  )
}
