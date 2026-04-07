import { BookOpen, Link2, X } from 'lucide-react'
import { useProjectPapers } from '../../hooks/useApiData'
import { useUnlinkPaper } from '../../hooks/useMutations'

interface ProjectLiteratureProps {
  projectSlug: string
  isPi: boolean
}

export default function ProjectLiterature({ projectSlug, isPi }: ProjectLiteratureProps) {
  const { data: papers = [] } = useProjectPapers(projectSlug)
  const unlinkPaper = useUnlinkPaper()

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div className="flex items-center gap-2 mb-3">
        <BookOpen size={16} style={{ color: 'var(--gold)' }} />
        <h2
          style={{
            fontWeight: 500,
            fontSize: '16px',
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          Related Literature
        </h2>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--slate)',
            opacity: 0.6,
          }}
        >
          {papers.length}
        </span>
      </div>
      <div
        style={{
          background: 'var(--ice)',
          borderRadius: '12px',
          padding: '16px 20px',
        }}
        className="detail-card"
      >
        {papers.length > 0 ? (
          <div>
            {papers.map((p) => (
              <div
                key={p.id}
                className="flex items-start gap-3 py-2.5"
                style={{ borderBottom: '1px solid rgba(201, 168, 76, 0.06)' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--ink)',
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {p.title || 'Untitled paper'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {p.journal && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--slate)',
                          opacity: 0.7,
                        }}
                      >
                        {p.journal}
                      </span>
                    )}
                    {p.pub_date && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--slate)',
                          opacity: 0.5,
                        }}
                      >
                        {p.pub_date}
                      </span>
                    )}
                  </div>
                  {p.note && (
                    <p
                      style={{
                        fontSize: '11px',
                        color: 'var(--teal)',
                        fontStyle: 'italic',
                        margin: '4px 0 0',
                      }}
                    >
                      {p.note}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {p.doi && (
                    <a
                      href={`https://doi.org/${p.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs"
                      style={{
                        color: 'var(--gold)',
                        fontSize: '10px',
                        textDecoration: 'none',
                      }}
                      title="View via DOI"
                    >
                      <Link2 size={11} />
                      DOI
                    </a>
                  )}
                  {isPi && (
                    <button
                      onClick={() => unlinkPaper.mutate({ id: p.id, project_slug: projectSlug })}
                      className="cursor-pointer p-1 rounded transition-colors"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--slate)',
                        opacity: 0.3,
                      }}
                      title="Remove link"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p
            style={{
              fontSize: '12px',
              color: 'var(--slate)',
              opacity: 0.4,
              textAlign: 'center',
              padding: '16px 0',
              margin: 0,
            }}
          >
            No papers linked yet. Link papers from the Research Digest.
          </p>
        )}
      </div>
    </div>
  )
}
