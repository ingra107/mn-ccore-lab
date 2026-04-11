import { useState, useMemo } from 'react'
import { BookOpen, Link2, X, Plus, Search, Loader2, CheckCircle2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
            fontWeight: 'var(--label-weight)',
            fontSize: '16px',
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          Related Literature
        </h2>
        <span
          style={{
            fontSize: 'var(--label-size)',
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
          borderRadius: 'var(--radius-xl)',
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
                      fontSize: 'var(--value-size)',
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
                          opacity: 'var(--ink-label)',
                        }}
                      >
                        {p.pub_date}
                      </span>
                    )}
                  </div>
                  {p.note && (
                    <p
                      style={{
                        fontSize: 'var(--label-size)',
                        color: 'var(--teal)',
                        fontStyle: 'italic',
                        margin: 'var(--sp-xs) 0 0',
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
              opacity: 'var(--ink-label)',
              textAlign: 'center',
              padding: 'var(--sp-lg) 0',
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
  const queryClient = useQueryClient()
  const { data: allPubs = [] } = usePublications()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'search' | 'doi'>('search')
  const [doi, setDoi] = useState('')
  const [doiData, setDoiData] = useState<{ title: string; authors: string; journal: string; year: number } | null>(null)
  const [doiLoading, setDoiLoading] = useState(false)
  const [doiError, setDoiError] = useState('')

  const createAndLink = useMutation({
    mutationFn: async (data: { title: string; authors: string; journal: string; year: number; doi: string }) => {
      const res = await fetch('/api/publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, status: 'Published' }),
      })
      const json = await res.json() as { data: { id: string } }
      return json.data.id
    },
    onSuccess: (paperId) => {
      onLink(paperId)
      queryClient.invalidateQueries({ queryKey: ['publications'] })
    },
  })

  const lookupDoi = async () => {
    const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//, '')
    if (!cleanDoi) return
    setDoiLoading(true)
    setDoiError('')
    setDoiData(null)
    try {
      const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`)
      if (!res.ok) throw new Error('DOI not found')
      const json = await res.json()
      const work = json.message
      const authors = (work.author || []).map((a: { family?: string; given?: string }) => `${a.family || ''}${a.given ? ' ' + a.given[0] : ''}`).join(', ')
      const journal = work['container-title']?.[0] || work.publisher || ''
      const year = work.published?.['date-parts']?.[0]?.[0] || work.created?.['date-parts']?.[0]?.[0] || new Date().getFullYear()
      setDoiData({ title: work.title?.[0] || '', authors, journal, year })
    } catch {
      setDoiError('Could not find paper. Check the DOI and try again.')
    }
    setDoiLoading(false)
  }

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
          maxHeight: '75vh',
          backgroundColor: 'var(--cream)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Tab header */}
        <div className="flex items-center border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            onClick={() => setTab('search')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: tab === 'search' ? 'var(--teal)' : 'var(--slate)',
              borderBottom: tab === 'search' ? '2px solid var(--teal)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            <Search size={13} />
            Search Existing
          </button>
          <button
            onClick={() => setTab('doi')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: tab === 'doi' ? 'var(--teal)' : 'var(--slate)',
              borderBottom: tab === 'doi' ? '2px solid var(--teal)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            <Link2 size={13} />
            Add by DOI
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 'var(--sp-sm) var(--sp-md)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Search tab */}
        <div style={{ display: tab === 'search' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <Search size={14} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />
            <input
              autoFocus={tab === 'search'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by title, author, or journal..."
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: 'var(--ink)', border: 'none' }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-xs) 0' }}>
            {results.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--slate)', opacity: 'var(--ink-label)', textAlign: 'center', padding: 'var(--sp-xl) 0' }}>
                {search ? 'No matching publications. Try the DOI tab to add a new one.' : 'No publications available.'}
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
                      background: 'none', border: 'none',
                      cursor: alreadyLinked ? 'default' : 'pointer',
                      opacity: alreadyLinked ? 0.4 : 1,
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                    onMouseOver={e => { if (!alreadyLinked) (e.currentTarget.style.backgroundColor = 'rgba(45,138,138,0.05)') }}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <p style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', margin: 0, lineHeight: 1.4 }}>{pub.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {pub.journal && <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.7 }}>{pub.journal}</span>}
                      {pub.year && <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>{pub.year}</span>}
                      {alreadyLinked && <span style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 'var(--label-weight)' }}>Already linked</span>}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* DOI tab */}
        <div style={{ display: tab === 'doi' ? 'flex' : 'none', flexDirection: 'column', flex: 1, padding: '16px 20px', gap: '12px' }}>
          <p style={{ fontSize: '12px', color: 'var(--slate)', margin: 0 }}>
            Enter a DOI to auto-fill citation data from CrossRef.
          </p>
          <div className="flex gap-2">
            <input
              autoFocus={tab === 'doi'}
              value={doi}
              onChange={e => setDoi(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') lookupDoi() }}
              placeholder="10.1234/example or https://doi.org/..."
              className="flex-1 text-sm px-3 py-2 rounded-lg border bg-transparent"
              style={{ color: 'var(--ink)', borderColor: 'var(--border-subtle)' }}
            />
            <button
              onClick={lookupDoi}
              disabled={doiLoading || !doi.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium"
              style={{
                backgroundColor: 'var(--teal)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                opacity: doiLoading || !doi.trim() ? 0.5 : 1,
              }}
            >
              {doiLoading ? <Loader2 size={14} className="animate-spin" /> : null}
              Auto-Fill
            </button>
          </div>

          {doiError && (
            <p style={{ fontSize: '12px', color: 'var(--maroon)', margin: 0 }}>{doiError}</p>
          )}

          {doiData && (
            <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--ice)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 size={14} style={{ color: 'var(--green)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'var(--green)' }}>Citation found</span>
              </div>
              <p style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', margin: 0, fontWeight: 'var(--label-weight)', lineHeight: 1.4 }}>
                {doiData.title}
              </p>
              <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', margin: 0 }}>
                {doiData.authors}
              </p>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.7, fontStyle: 'italic' }}>{doiData.journal}</span>
                <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>{doiData.year}</span>
              </div>
              <button
                onClick={() => {
                  const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//, '')
                  createAndLink.mutate({ ...doiData, doi: cleanDoi })
                }}
                disabled={createAndLink.isPending}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium w-fit"
                style={{
                  backgroundColor: 'var(--teal)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  opacity: createAndLink.isPending ? 0.5 : 1,
                }}
              >
                <Plus size={14} />
                {createAndLink.isPending ? 'Adding...' : 'Add & Link to Project'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
