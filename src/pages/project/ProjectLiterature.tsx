import { useState, useMemo } from 'react'
import { BookOpen, Link2, X, Plus, Search } from 'lucide-react'
import { useProjectPapers, usePublications } from '../../hooks/useApiData'
import { useUnlinkPaper, useLinkPaper } from '../../hooks/useMutations'

interface ProjectLiteratureProps {
  projectSlug: string
  isPi: boolean
}

export default function ProjectLiterature({ projectSlug, isPi }: ProjectLiteratureProps) {
  const { data: papers = [] } = useProjectPapers(projectSlug)
  const unlinkPaper = useUnlinkPaper()
  const linkPaper = useLinkPaper()
  const [showLinkModal, setShowLinkModal] = useState(false)

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
        {isPi && (
          <button
            onClick={() => setShowLinkModal(true)}
            className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--teal)',
              border: '1px solid var(--teal)',
              cursor: 'pointer',
              opacity: 0.8,
            }}
          >
            <Plus size={12} />
            Link Paper
          </button>
        )}
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
                          opacity: 0.55,
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
              opacity: 0.55,
              textAlign: 'center',
              padding: '16px 0',
              margin: 0,
            }}
          >
            No papers linked yet.{isPi ? ' Click "Link Paper" to add one.' : ' Link papers from the Research Digest.'}
          </p>
        )}
      </div>

      {/* Link Paper Modal */}
      {showLinkModal && (
        <LinkPaperModal
          projectSlug={projectSlug}
          linkedPaperIds={papers.map(p => p.id)}
          onLink={(paperId) => {
            linkPaper.mutate({ paper_id: paperId, project_slug: projectSlug })
            setShowLinkModal(false)
          }}
          onClose={() => setShowLinkModal(false)}
        />
      )}
    </div>
  )
}

function LinkPaperModal({ projectSlug, linkedPaperIds, onLink, onClose }: {
  projectSlug: string
  linkedPaperIds: string[]
  onLink: (paperId: string) => void
  onClose: () => void
}) {
  const { data: allPubs = [] } = usePublications()
  const [search, setSearch] = useState('')

  const results = useMemo(() => {
    const term = search.toLowerCase().trim()
    if (!term) return allPubs.slice(0, 20)
    return allPubs.filter(p =>
      p.title.toLowerCase().includes(term) ||
      (p.journal && p.journal.toLowerCase().includes(term)) ||
      (p.authors && String(p.authors).toLowerCase().includes(term))
    ).slice(0, 20)
  }, [allPubs, search])

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ backgroundColor: 'rgba(15, 25, 35, 0.4)' }}
        onClick={onClose}
      />
      <div
        className="fixed z-50 shadow-2xl"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(520px, 90vw)',
          maxHeight: '70vh',
          backgroundColor: 'var(--cream)',
          borderRadius: '12px',
          border: '1px solid var(--border-light)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Search header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <Search size={16} style={{ color: 'var(--slate)', opacity: 0.55 }} />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search publications by title, author, or journal..."
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: 'var(--ink)', border: 'none' }}
          />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {results.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.55, textAlign: 'center', padding: '24px 0' }}>
              {search ? 'No matching publications found.' : 'No publications available.'}
            </p>
          ) : (
            results.map(pub => {
              const alreadyLinked = linkedPaperIds.includes(pub.id)
              return (
                <button
                  key={pub.id}
                  onClick={() => !alreadyLinked && onLink(pub.id)}
                  disabled={alreadyLinked}
                  className="w-full text-left px-4 py-2.5 transition-colors"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: alreadyLinked ? 'default' : 'pointer',
                    opacity: alreadyLinked ? 0.4 : 1,
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                  onMouseOver={e => { if (!alreadyLinked) (e.currentTarget.style.backgroundColor = 'rgba(45,138,138,0.05)') }}
                  onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <p style={{ fontSize: '13px', color: 'var(--ink)', margin: 0, lineHeight: 1.4 }}>
                    {pub.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {pub.journal && (
                      <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.7 }}>{pub.journal}</span>
                    )}
                    {pub.year && (
                      <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.55 }}>{pub.year}</span>
                    )}
                    {alreadyLinked && (
                      <span style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 500 }}>Already linked</span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
