import { useState, useMemo } from 'react'
import { BookOpen, GitBranch, FileText, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import { useNarratives } from '../../hooks/useApiData'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'

const STAGE_COLORS: Record<string, string> = {
  Idea: '#64748b',
  'Data Collection': '#5b8abf',
  Analysis: '#2d8a8a',
  Writing: '#c9a84c',
  Review: '#7a0019',
  Published: 'var(--green-light)',
}

export default function NarrativesPage() {
  usePageMeta('Research Narratives | MN-CCORE Lab', 'Auto-detected research arcs across the lab.')
  const { data: narratives = [], isLoading } = useNarratives()
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [searchTerm, setSearchTerm] = useState('')

  const filteredNarratives = useMemo(() => {
    if (!searchTerm) return narratives
    const q = searchTerm.toLowerCase()
    return narratives.filter(arc =>
      arc.title.toLowerCase().includes(q) ||
      arc.projects.some((p: { title: string }) => p.title.toLowerCase().includes(q)) ||
      arc.sharedTopics.some((t: { topic: string }) => t.topic.toLowerCase().includes(q))
    )
  }, [narratives, searchTerm])

  useListKeyboardNav({ itemCount: filteredNarratives.length, focusedIndex, setFocusedIndex })

  return (
    <div>
      <PageHeader
        icon={<BookOpen size={20} />}
        title="Research Narratives"
        subtitle={`${filteredNarratives.length}${searchTerm ? ` of ${narratives.length}` : ''} research arcs`}
        count={filteredNarratives.length}
      >
        <div style={{ position: 'relative', width: 200 }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)', opacity: 0.4 }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search arcs..."
            style={{
              fontSize: 12,
              padding: '5px 10px 5px 26px',
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--surface)',
              color: 'var(--ink)',
              width: '100%',
              outline: 'none',
            }}
          />
        </div>
      </PageHeader>

      {isLoading ? (
        <TableSkeleton rows={5} cols={3} />
      ) : filteredNarratives.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={40} />}
          title={searchTerm ? 'No matching narratives' : 'No research narratives detected yet'}
          subtitle={searchTerm ? 'Try a different search term.' : 'Narratives emerge as projects and publications grow.'}
        />
      ) : (
        <div className="table-container flex flex-col gap-5 mt-5" style={{ padding: '20px' }}>
          {filteredNarratives.map((arc) => (
            <div key={arc.id} className="p-5 rounded-xl" style={{ background: 'var(--cream)', border: '1px solid var(--border-subtle)' }}>
              {/* Header */}
              <div className="flex items-center gap-2 mb-3">
                <BookOpen size={16} style={{ color: 'var(--gold)' }} />
                <h3 style={{ fontWeight: 500, fontSize: '18px', color: 'var(--ink)', margin: 0 }}>
                  {arc.title}
                </h3>
                <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.6 }}>
                  {arc.projectCount} project{arc.projectCount !== 1 ? 's' : ''}
                </span>
                {arc.connectedCount > 0 && (
                  <span className="flex items-center gap-1" style={{ fontSize: 'var(--label-size)', color: 'var(--teal)' }}>
                    <GitBranch size={10} />
                    {arc.connectedCount} linked
                  </span>
                )}
              </div>

              {/* Stage pipeline */}
              <div className="flex items-center gap-1.5 mb-4 p-2 rounded-lg" style={{ background: 'rgba(201,168,76,0.03)' }}>
                {arc.stageDistribution.map((s, i) => (
                  <div key={s.stage} className="flex items-center gap-1">
                    {i > 0 && <div style={{ width: 12, height: 1, background: 'rgba(201,168,76,0.15)' }} />}
                    <div style={{
                      width: s.count > 0 ? 10 + s.count * 4 : 8,
                      height: s.count > 0 ? 10 + s.count * 4 : 8,
                      borderRadius: 'var(--radius-circle)',
                      background: STAGE_COLORS[s.stage] || '#64748b',
                      opacity: s.count > 0 ? 1 : 0.15,
                      transition: 'all 0.2s',
                    }} title={`${s.stage}: ${s.count}`} />
                    {s.count > 0 && (
                      <span style={{ fontSize: '9px', color: STAGE_COLORS[s.stage], fontWeight: 600 }}>
                        {s.count}
                      </span>
                    )}
                  </div>
                ))}
                <span style={{ fontSize: '9px', color: 'var(--slate)', opacity: 0.4, marginLeft: 8 }}>
                  Idea → Published
                </span>
              </div>

              {/* Projects */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                {arc.projects.map((p) => (
                  <Link
                    key={p.slug}
                    to={`/projects/${p.slug}`}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: STAGE_COLORS[p.stage] || '#64748b', flexShrink: 0 }} />
                    <span style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', flex: 1 }}>
                      {p.title}
                    </span>
                    <span style={{ fontSize: '10px', color: STAGE_COLORS[p.stage], opacity: 0.7 }}>
                      {p.stage}
                    </span>
                  </Link>
                ))}
              </div>

              {/* Shared topics */}
              {arc.sharedTopics.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {arc.sharedTopics.map((t) => (
                    <span
                      key={t.topic}
                      className="px-2 py-0.5 rounded-full text-[10px]"
                      style={{ background: 'rgba(201,168,76,0.1)', color: 'var(--gold)', border: '1px solid rgba(201,168,76,0.15)' }}
                    >
                      {t.topic} ({t.count})
                    </span>
                  ))}
                </div>
              )}

              {/* Related publications */}
              {arc.relatedPubs.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FileText size={10} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />
                    <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                      Related publications
                    </span>
                  </div>
                  {arc.relatedPubs.map((p) => (
                    <Link key={p.id} to={`/publications/${p.id}`} className="block py-1" style={{ textDecoration: 'none' }}>
                      <span style={{ fontSize: '12px', color: 'var(--ink)', opacity: 0.7 }}>
                        {p.title}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.4, marginLeft: 8 }}>
                        {p.pub_date}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
