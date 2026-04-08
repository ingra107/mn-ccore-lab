import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Printer, Copy, FileText } from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useCVData } from '../hooks/useCVData'
import type { CVData } from '../hooks/useCVData'

// ── Helpers ──────────────────────────────────────────────────

function formatDateRange(start: string | null, end: string | null): string {
  const fmt = (d: string) => {
    const date = new Date(d + 'T12:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }
  if (!start && !end) return ''
  if (start && end) return `${fmt(start)} - ${fmt(end)}`
  if (start) return `${fmt(start)} - Present`
  return ''
}

function formatYearRange(start: string | null, end: string | null): string {
  const y = (d: string) => new Date(d + 'T12:00:00').getFullYear().toString()
  if (!start && !end) return ''
  if (start && end) return `${y(start)}-${y(end)}`
  if (start) return `${y(start)}-Present`
  return ''
}

function roleLabel(pi: string, slug: string): string {
  if (pi === slug) return 'PI'
  return 'Co-Investigator'
}

// ── Publication Citation ─────────────────────────────────────

function CitationBlock({ pub, index }: { pub: CVData['publications'][0]; index: number }) {
  return (
    <div className="cv-citation mb-3" style={{ paddingLeft: '2rem', textIndent: '-2rem' }}>
      <span
        className="cv-citation-number"
        style={{ fontSize: '12px', color: 'var(--slate)', marginRight: '0.5rem' }}
      >
        {index}.
      </span>
      <span style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--ink)' }}>
        {pub.authors}.{' '}
        <span style={{ fontStyle: 'italic' }}>"{pub.title}."</span>{' '}
        {pub.journal && <>{pub.journal}. </>}
        {pub.year}.
        {pub.doi && (
          <>
            {' '}
            <a
              href={pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="cv-doi-link"
              style={{ color: 'var(--teal)', textDecoration: 'none', fontSize: '12px' }}
            >
              DOI: {pub.doi.replace(/^https?:\/\/doi\.org\//, '')}
            </a>
          </>
        )}
        {!pub.doi && pub.pmid && (
          <>
            {' '}
            <a
              href={`https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="cv-doi-link"
              style={{ color: 'var(--teal)', textDecoration: 'none', fontSize: '12px' }}
            >
              PMID: {pub.pmid}
            </a>
          </>
        )}
        {pub.status !== 'Published' && (
          <span
            style={{
              fontSize: '11px',
              color: 'var(--gold)',
              marginLeft: '0.5rem',
            }}
          >
            [{pub.status}]
          </span>
        )}
      </span>
    </div>
  )
}

// ── Grant Block ──────────────────────────────────────────────

function GrantBlock({ grant, slug }: { grant: CVData['grants'][0]; slug: string }) {
  return (
    <div
      className="cv-grant mb-4 pl-4"
      style={{ borderLeft: '2px solid var(--gold)' }}
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          style={{
            fontSize: '12px',
            color: 'var(--gold)',
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          {grant.mechanism}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--slate)' }}>
          ({grant.agency})
        </span>
        <span style={{ fontSize: '11px', color: 'var(--slate)' }}>
          {formatYearRange(grant.start_date, grant.end_date)}
        </span>
      </div>
      <h4
        className="mt-1"
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--ink)',
          lineHeight: 1.4,
        }}
      >
        {grant.title}
      </h4>
      <div className="flex items-center gap-3 mt-1">
        <span style={{ fontSize: '11px', color: 'var(--slate)' }}>
          Role: {roleLabel(grant.pi, slug)}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--slate)' }}>
          {formatDateRange(grant.start_date, grant.end_date)}
        </span>
      </div>
    </div>
  )
}

// ── Section Header ───────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="cv-section-header mb-4 mt-10 pb-2" style={{ borderBottom: '2px solid var(--gold)' }}>
      <h2
        style={{
          fontSize: '18px',
          fontWeight: 500,
          color: 'var(--ink)',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        {children}
      </h2>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────

export default function CVPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data, isLoading, error } = useCVData(slug || '')

  usePageMeta(
    data ? `CV - ${data.member.name} | MN-CCORE` : 'CV | MN-CCORE',
    data
      ? `Curriculum Vitae for ${data.member.name}${data.member.credentials ? `, ${data.member.credentials}` : ''}.`
      : 'Academic CV export.'
  )

  // Group publications by year
  const pubsByYear = useMemo(() => {
    if (!data?.publications) return []
    const groups: Record<number, CVData['publications']> = {}
    for (const pub of data.publications) {
      if (!groups[pub.year]) groups[pub.year] = []
      groups[pub.year].push(pub)
    }
    return Object.entries(groups)
      .map(([year, pubs]) => ({ year: Number(year), pubs }))
      .sort((a, b) => b.year - a.year)
  }, [data?.publications])

  // Separate active vs pending grants
  const activeGrants = useMemo(
    () => (data?.grants || []).filter((g) => !g.proposed),
    [data?.grants]
  )
  const pendingGrants = useMemo(
    () => (data?.grants || []).filter((g) => g.proposed),
    [data?.grants]
  )

  // Global publication counter
  const totalPubs = data?.publications?.length || 0

  if (isLoading) {
    return (
      <div className="content-container" style={{ paddingTop: '4rem', textAlign: 'center' }}>
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto"
          style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }}
        />
        <p className="mt-4 text-sm" style={{ color: 'var(--slate)' }}>
          Loading CV data...
        </p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="content-container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <Link
          to={`/team/${slug || ''}`}
          className="inline-flex items-center gap-2 mb-6"
          style={{
            fontSize: '14px',
            color: 'var(--slate)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={16} /> Back to Profile
        </Link>
        <h1
          style={{
            fontWeight: 800,
            fontSize: '1.75rem',
            color: 'var(--ink)',
          }}
        >
          CV data not available
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--slate)' }}>
          Could not load CV data for this team member.
        </p>
      </div>
    )
  }

  const { member } = data
  const displayName = member.credentials
    ? `${member.name}, ${member.credentials}`
    : member.name

  // Word count across all CV text
  const wordCount = useMemo(() => {
    let text = `${member.name} ${member.title || ''} ${member.department || ''}`
    for (const pub of data.publications) {
      text += ` ${pub.authors} ${pub.title} ${pub.journal || ''}`
    }
    for (const grant of data.grants) {
      text += ` ${grant.title} ${grant.mechanism} ${grant.agency}`
    }
    return text.split(/\s+/).filter(Boolean).length
  }, [data, member])

  const [copied, setCopied] = useState(false)

  const copyAsText = () => {
    const lines: string[] = [
      displayName,
      member.title || '',
      member.department || '',
      'University of Minnesota',
      '',
      '--- PUBLICATIONS ---',
      '',
    ]
    let idx = 1
    for (const group of pubsByYear) {
      lines.push(String(group.year))
      for (const pub of group.pubs) {
        lines.push(`${idx}. ${pub.authors}. "${pub.title}." ${pub.journal || ''} ${pub.year}.${pub.doi ? ` doi:${pub.doi}` : ''}`)
        idx++
      }
      lines.push('')
    }
    if (activeGrants.length > 0 || pendingGrants.length > 0) {
      lines.push('--- RESEARCH SUPPORT ---', '')
      if (activeGrants.length > 0) {
        lines.push('Active:')
        for (const g of activeGrants) {
          lines.push(`  ${g.mechanism} (${g.agency}) - ${g.title}`)
        }
        lines.push('')
      }
      if (pendingGrants.length > 0) {
        lines.push('Pending:')
        for (const g of pendingGrants) {
          lines.push(`  ${g.mechanism} (${g.agency}) - ${g.title}`)
        }
        lines.push('')
      }
    }
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div className="content-container cv-page" style={{ paddingBottom: '4rem' }}>
        {/* Back link */}
        <div className="no-print" style={{ paddingTop: '1.5rem', marginBottom: '1rem' }}>
          <Link
            to={`/team/${slug || ''}`}
            className="inline-flex items-center gap-2"
            style={{
              fontSize: '14px',
              color: 'var(--slate)',
              textDecoration: 'none',
              opacity: 0.7,
            }}
          >
            <ArrowLeft size={16} /> Back to Profile
          </Link>
        </div>

        {/* ── Header ── */}
        <header className="cv-header mb-6" style={{ borderBottom: '3px solid var(--gold)', paddingBottom: '1.5rem' }}>
          <h1
            className="cv-name"
            style={{
              fontSize: '28px',
              fontWeight: 800,
              color: 'var(--ink)',
              lineHeight: 1.2,
              marginBottom: '0.25rem',
            }}
          >
            {displayName}
          </h1>
          {member.title && (
            <p
              style={{
                fontSize: '15px',
                color: 'var(--ink)',
                lineHeight: 1.4,
              }}
            >
              {member.title}
            </p>
          )}
          {member.department && (
            <p
              style={{
                fontSize: '14px',
                color: 'var(--slate)',
                lineHeight: 1.4,
              }}
            >
              {member.department}
            </p>
          )}
          <p
            style={{
              fontSize: '14px',
              color: 'var(--slate)',
              lineHeight: 1.4,
            }}
          >
            University of Minnesota
          </p>

          {/* Action buttons */}
          <div className="no-print mt-4 flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md cursor-pointer transition-all duration-200"
              style={{
                fontSize: '12px',
                fontWeight: 500,
                background: 'var(--ice)',
                color: 'var(--ink)',
                border: '1px solid rgba(201, 168, 76, 0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--gold)'
                e.currentTarget.style.background = 'rgba(201, 168, 76, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(201, 168, 76, 0.3)'
                e.currentTarget.style.background = 'var(--ice)'
              }}
            >
              <Printer size={14} />
              Print / Save as PDF
            </button>
            <button
              type="button"
              onClick={copyAsText}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md cursor-pointer transition-all duration-200"
              style={{
                fontSize: '12px',
                fontWeight: 500,
                background: 'none',
                color: copied ? 'var(--green)' : 'var(--slate)',
                border: '1px solid var(--border-light)',
              }}
            >
              {copied ? <FileText size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy as Text'}
            </button>
            <span
              className="text-[10px] px-2 py-1 rounded"
              style={{ color: 'var(--slate)', opacity: 0.55, background: 'rgba(148,163,184,0.06)' }}
            >
              ~{wordCount.toLocaleString()} words
            </span>
          </div>
        </header>

        {/* ── Publications ── */}
        {totalPubs > 0 && (
          <section className="cv-section">
            <SectionHeader>
              Publications ({totalPubs})
            </SectionHeader>
            {pubsByYear.map(({ year, pubs }) => {
              // Calculate global index offset for this year group
              let globalOffset = 0
              for (const group of pubsByYear) {
                if (group.year > year) globalOffset += group.pubs.length
              }
              return (
                <div key={year} className="mb-6">
                  <h3
                    className="mb-2"
                    style={{
                      fontSize: '15px',
                      fontWeight: 400,
                      color: 'var(--gold)',
                    }}
                  >
                    {year}
                  </h3>
                  {pubs.map((pub, i) => (
                    <CitationBlock key={pub.id} pub={pub} index={globalOffset + i + 1} />
                  ))}
                </div>
              )
            })}
          </section>
        )}

        {/* ── Research Support ── */}
        {(activeGrants.length > 0 || pendingGrants.length > 0) && (
          <section className="cv-section">
            <SectionHeader>Research Support</SectionHeader>

            {activeGrants.length > 0 && (
              <div className="mb-6">
                <h3
                  className="mb-3"
                  style={{
                    fontSize: '12px',
                    fontWeight: 400,
                    color: 'var(--slate)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Active
                </h3>
                {activeGrants.map((grant) => (
                  <GrantBlock key={grant.id} grant={grant} slug={slug || ''} />
                ))}
              </div>
            )}

            {pendingGrants.length > 0 && (
              <div className="mb-6">
                <h3
                  className="mb-3"
                  style={{
                    fontSize: '12px',
                    fontWeight: 400,
                    color: 'var(--slate)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Pending
                </h3>
                {pendingGrants.map((grant) => (
                  <GrantBlock key={grant.id} grant={grant} slug={slug || ''} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Mentees ── */}
        {data.mentees && data.mentees.length > 0 && (
          <section className="cv-section">
            <SectionHeader>Trainees & Mentees</SectionHeader>
            <div className="space-y-2">
              {data.mentees.map((mentee) => (
                <div key={mentee.slug} className="flex items-baseline gap-3">
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}
                  >
                    {mentee.name}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--slate)',
                    }}
                  >
                    {mentee.role}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Print Styles ── */}
      <style>{`
        @media print {
          /* Hide site chrome */
          nav, footer, .no-print, button[aria-label="Scroll to top"] {
            display: none !important;
          }

          /* Reset page */
          body {
            font-family: 'Times New Roman', 'Georgia', serif !important;
            font-size: 11pt !important;
            color: black !important;
            background: white !important;
            -webkit-print-color-adjust: exact;
          }

          /* Page margins */
          @page {
            margin: 0.75in 1in;
          }

          /* Remove all backgrounds and shadows */
          * {
            background: transparent !important;
            box-shadow: none !important;
            text-shadow: none !important;
          }

          /* Main container: remove padding from layout nav offset */
          main#main-content {
            padding-top: 0 !important;
          }

          .cv-page {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* Header */
          .cv-name {
            font-family: 'Times New Roman', serif !important;
            font-size: 18pt !important;
            font-weight: bold !important;
            color: black !important;
          }

          .cv-header {
            border-bottom: 2px solid black !important;
            padding-bottom: 8pt !important;
            margin-bottom: 12pt !important;
          }

          .cv-header p {
            font-family: 'Times New Roman', serif !important;
            color: #333 !important;
            font-size: 11pt !important;
          }

          /* Section headers */
          .cv-section-header {
            border-bottom: 1px solid black !important;
            margin-top: 16pt !important;
            margin-bottom: 8pt !important;
          }

          .cv-section-header h2 {
            font-family: 'Times New Roman', serif !important;
            font-size: 13pt !important;
            font-weight: bold !important;
            color: black !important;
            text-transform: uppercase !important;
            letter-spacing: 0.05em !important;
          }

          /* Year headers */
          .cv-section h3 {
            font-family: 'Times New Roman', serif !important;
            font-size: 11pt !important;
            font-weight: bold !important;
            color: black !important;
          }

          /* Citations */
          .cv-citation {
            font-family: 'Times New Roman', serif !important;
            font-size: 10pt !important;
            line-height: 1.4 !important;
            color: black !important;
            margin-bottom: 4pt !important;
          }

          .cv-citation span {
            font-family: 'Times New Roman', serif !important;
            font-size: 10pt !important;
            color: black !important;
          }

          .cv-citation-number {
            font-family: 'Times New Roman', serif !important;
            font-size: 10pt !important;
            color: black !important;
          }

          .cv-doi-link {
            font-family: 'Times New Roman', serif !important;
            font-size: 9pt !important;
            color: #333 !important;
            text-decoration: none !important;
          }

          /* Grants */
          .cv-grant {
            border-left: 1px solid #999 !important;
            padding-left: 8pt !important;
            margin-bottom: 8pt !important;
          }

          .cv-grant span, .cv-grant h4 {
            font-family: 'Times New Roman', serif !important;
            color: black !important;
          }

          .cv-grant h4 {
            font-size: 10pt !important;
          }

          .cv-grant span {
            font-size: 9pt !important;
          }

          /* Page breaks */
          .cv-section {
            page-break-inside: avoid;
          }

          /* Links: show URL */
          a[href]::after {
            content: none !important;
          }
        }
      `}</style>
    </>
  )
}
