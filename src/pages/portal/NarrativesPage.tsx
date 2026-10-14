import { useState, useMemo } from 'react'
import { BookOpen, GitBranch, FileText, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import PageContainer from '../../components/PageContainer'
import EmptyState from '../../components/EmptyState'
import { TableSkeleton } from '../../components/LoadingSkeleton'
import { useNarratives } from '../../hooks/useApiData'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav'
import { PATHS } from '../../constants/paths'
import { stageColor } from '../../lib/stageNormalize'
import { stageCountLabel } from '../../lib/projectStage'
import { ICON_PROPS } from '../../lib/iconProps'
import { QueryErrorNote } from '../../components/QueryErrorNote'

// An arc's pipeline is its PRODUCTS by kind and stage, and each project shows
// its home product's stage (contract phase step 1; the Worker sends the ladder
// words). stageColor() (shared) colors manuscript rungs along the teal ramp; any
// other kind reads slate. Text about a rung stays gray.

function rungColor(kind: string | null, stage: string | null): string {
  return kind === 'manuscript' && stage ? stageColor(stage) : 'var(--slate)'
}

// Every rung reads "<kind> · <stage>" in full. Manuscript rungs used clipped
// 3-4 letter labels ('Anal 4', 'Writ 9') beside full names on every other
// kind; one anatomy for every rung (principle 4, O2B 2026-10-14).
function rungLabel(r: { kind_label: string; stage_label: string }): string {
  return `${r.kind_label} · ${r.stage_label}`
}

export default function NarrativesPage() {
  usePageMeta('Research Narratives · MN-CCORE', 'Auto-detected research arcs across the lab.')
  const { data: narratives = [], isLoading, isError, refetch } = useNarratives()
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
    <PageContainer>
      <PageHeader
        title="Research Narratives"
        subtitle={`${filteredNarratives.length}${searchTerm ? ` of ${narratives.length}` : ''} research arcs`}
        count={filteredNarratives.length}
      >
        <div style={{ position: 'relative', width: 200 }}>
          <Search {...ICON_PROPS} size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)', opacity: 0.75 }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search arcs..."
            style={{
              fontSize: 12,
              padding: '5px 10px 5px 26px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--field-edge)',
              backgroundColor: 'var(--sk-card)',
              color: 'var(--ink)',
              width: '100%',
              outline: 'none',
            }}
          />
        </div>
      </PageHeader>

      {isLoading ? (
        <TableSkeleton rows={5} cols={3} />
      ) : isError ? (
        <div className="flex items-center justify-center py-10">
          <QueryErrorNote label="research narratives" onRetry={() => refetch()} />
        </div>
      ) : filteredNarratives.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={40} />}
          title={searchTerm ? 'No matching narratives' : 'No research narratives detected yet'}
          subtitle={searchTerm ? 'Try a different search term.' : 'Narratives emerge as projects and publications grow.'}
        />
      ) : (
        <div className="flex flex-col gap-5 mt-5">
          {filteredNarratives.map((arc) => (
            <div key={arc.id} className="p-5 rounded-xl sk-mat">
              {/* Header */}
              <div className="flex items-center gap-2 mb-3">
                <BookOpen {...ICON_PROPS} size={16} style={{ color: 'var(--sk-t3)' }} />
                <h3 style={{ fontWeight: 500, fontSize: '18px', color: 'var(--ink)', margin: 0 }}>
                  {arc.title}
                </h3>
                <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.75 }}>
                  {arc.projectCount} project{arc.projectCount !== 1 ? 's' : ''}
                </span>
                {arc.connectedCount > 0 && (
                  <span className="flex items-center gap-1" style={{ fontSize: 'var(--label-size)', color: 'var(--sk-t3)' }}>
                    <GitBranch {...ICON_PROPS} size={10} />
                    {arc.connectedCount} linked
                  </span>
                )}
              </div>

              {/* Stage pipeline — labeled so each dot's meaning is obvious.
                  Wraps: an arc can carry 16 rungs, about 1,080px, and a phone
                  must never scroll sideways. No connector dashes between
                  rungs: on a wrapped row each new line started with an
                  orphan dash (O2B, 2026-10-14); the gap separates them. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
                <span style={{ fontSize: '12px', color: 'var(--slate)', marginRight: 4 }}>
                  Pipeline
                </span>
                {arc.stageDistribution.map((s) => (
                  <div key={`${s.kind}:${s.stage}`} className="flex items-center">
                    <div className="flex flex-col items-center" style={{ gap: 2 }}>
                      <div style={{
                        width: s.count > 0 ? 10 + s.count * 4 : 8,
                        height: s.count > 0 ? 10 + s.count * 4 : 8,
                        borderRadius: 'var(--radius-circle)',
                        background: rungColor(s.kind, s.stage),
                        opacity: s.count > 0 ? 1 : 0.25,
                        transition: 'all 0.2s',
                      }} title={`${stageCountLabel(s)}: ${s.count}`} />
                      <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.85, lineHeight: 1 }}>
                        {rungLabel(s)}{s.count > 0 ? ` ${s.count}` : ''}
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
                    to={PATHS.project(p.slug)}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: rungColor(p.home_kind, p.home_stage), flexShrink: 0 }} />
                    {/* The title keeps most of the row; the stage label gives way
                        (truncates, full text on hover) so a long title is not
                        squeezed to one word per line on a phone. */}
                    <span style={{ fontSize: 'var(--value-size)', color: 'var(--ink)', flex: 1, minWidth: 0 }}>
                      {p.title}
                    </span>
                    <span
                      title={p.stage_label}
                      style={{ fontSize: '10px', color: 'var(--sk-t3)', maxWidth: '40%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {p.stage_label}
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
                      style={{ background: 'transparent', color: 'var(--sk-t2)', border: '1px solid var(--sk-line2)' }}
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
                    <FileText {...ICON_PROPS} size={10} style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }} />
                    <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                      Related publications
                    </span>
                  </div>
                  {arc.relatedPubs.map((p) => (
                    <Link key={p.id} to={`/publications/${p.id}`} className="block py-1" style={{ textDecoration: 'none' }}>
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {p.title}
                      </span>
                      {p.year != null && (
                        <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75, marginLeft: 'var(--sp-sm)' }}>
                          {p.year}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
