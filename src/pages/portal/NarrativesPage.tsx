import { useState, useMemo } from 'react'
import { BookOpen, GitBranch, FileText, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import { useNarratives } from '../../hooks/useApiData'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'

// Brighter blue for Data Collection stage so the 10px label survives
// opacity 0.85 on near-black bg (axe AA, 2026-04-18). Was #5b8abf (4.28:1).
const STAGE_COLORS: Record<string, string> = {
  Idea: 'var(--slate)',
  'Data Collection': '#7fa8d6',
  Analysis: 'var(--teal)',
  Writing: 'var(--gold)',
  Review: 'var(--maroon)',
  Published: 'var(--green-light)',
}

const STAGE_ABBREV: Record<string, string> = {
  Idea: 'Idea',
  'Data Collection': 'Data',
  Analysis: 'Anal',
  Writing: 'Writ',
  Review: 'Rev',
  Published: 'Pub',
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
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)', opacity: 0.75 }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search arcs..."
            style={{
              fontSize: 12,
              padding: '5px 10px 5px 26px',
              borderRadius: 'var(--radius-md)',
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
                <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.75 }}>
                  {arc.projectCount} project{arc.projectCount !== 1 ? 's' : ''}
                </span>
                {arc.connectedCount > 0 && (
                  <span className="flex items-center gap-1" style={{ fontSize: 'var(--label-size)', color: 'var(--teal)' }}>
                    <GitBranch size={10} />
                    {arc.connectedCount} linked
                  </span>
                )}
              </div>

              {/* Stage pipeline — labeled so each dot's meaning is obvious */}
              <div className="flex items-center gap-2 mb-4 p-2 rounded-lg" style={{ background: 'var(--gold-hover)' }}>
                <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>
                  Pipeline
                </span>
                {arc.stageDistribution.map((s, i) => (
                  <div key={s.stage} className="flex items-center gap-1">
                    {i > 0 && <div style={{ width: 8, height: 1, background: 'var(--gold-emphasis)' }} />}
                    <div className="flex flex-col items-center" style={{ gap: 2 }}>
                      <div style={{
                        width: s.count > 0 ? 10 + s.count * 4 : 8,
                        height: s.count > 0 ? 10 + s.count * 4 : 8,
                        borderRadius: 'var(--radius-circle)',
                        background: STAGE_COLORS[s.stage] || 'var(--slate)',
                        opacity: s.count > 0 ? 1 : 0.25,
                        transition: 'all 0.2s',
                      }} title={`${s.stage}: ${s.count}`} />
                      <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.85, lineHeight: 1 }}>
                        {STAGE_ABBREV[s.stage] || s.stage}{s.count > 0 ? ` ${s.count}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
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
                    <div style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: STAGE_COLORS[p.stage] || 'var(--slate)', flexShrink: 0 }} />
                    <span style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', flex: 1 }}>
                      {p.title}
                    </span>
                    <span style={{ fontSize: '10px', color: STAGE_COLORS[p.stage], opacity: 0.85 }}>
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
                      style={{ background: 'var(--gold-active)', color: 'var(--gold)', border: '1px solid rgba(201,168,76,0.15)' }}
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
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {p.title}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75, marginLeft: 'var(--sp-sm)' }}>
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
