import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'
import { usePublications } from '../hooks/useApiData'
import { usePageMeta } from '../hooks/usePageMeta'
import Avatar from '../components/Avatar'
import { getPersonInfo } from '../data/team'

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
            opacity: 0.7,
          }}
        >
          <ArrowLeft size={16} />
          Back to Publications
        </Link>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
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
    Published: { bg: 'rgba(34,197,94,0.1)', color: 'var(--green, #22c55e)' },
    'In Review': { bg: 'rgba(201,168,76,0.1)', color: 'var(--gold)' },
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
              opacity: 0.7,
            }}
          >
            <ArrowLeft size={16} />
            Back to Publications
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{
                fontSize: '11px',
                background: 'rgba(201, 168, 76, 0.1)',
                color: 'var(--gold)',
                letterSpacing: '0.04em',
              }}
            >
              {pub.year}
            </span>
            <span
              className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{
                fontSize: '11px',
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
                  fontSize: '11px',
                  background: 'rgba(45,138,138,0.1)',
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
              fontWeight: 800,
              fontSize: 'clamp(1.25rem, 3vw, 2rem)',
              color: 'var(--ink)',
              margin: '0 0 12px 0',
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
                      size="sm"
                      variant="ice"
                      className="!w-7 !h-7 !min-w-0 !min-h-0 !text-[8px]"
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
              opacity: 0.3,
              marginBottom: '2rem',
            }}
          />
        </motion.div>

        {/* Abstract + Topics + Links */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div
            style={{
              background: 'var(--ice)',
              borderRadius: '12px',
              padding: '20px 24px',
            }}
          >
            {pub.abstract && (
              <p
                style={{
                  fontSize: '14px',
                  color: 'var(--ink)',
                  lineHeight: 1.7,
                  margin: '0 0 16px 0',
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
                      fontSize: '11px',
                      background: 'rgba(201, 168, 76, 0.1)',
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
                    background: 'rgba(201, 168, 76, 0.1)',
                    color: 'var(--gold)',
                    border: '1px solid rgba(201, 168, 76, 0.2)',
                    textDecoration: 'none',
                    minHeight: '32px',
                  }}
                >
                  DOI <ExternalLink size={10} />
                </a>
              )}
              {pub.pubmed && (
                <a
                  href={pub.pubmed.startsWith('http') ? pub.pubmed : `https://pubmed.ncbi.nlm.nih.gov/${pub.pubmed}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:opacity-80"
                  style={{
                    background: 'rgba(45, 138, 138, 0.08)',
                    color: 'var(--teal)',
                    border: '1px solid rgba(45, 138, 138, 0.15)',
                    textDecoration: 'none',
                    minHeight: '32px',
                  }}
                >
                  PubMed <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
