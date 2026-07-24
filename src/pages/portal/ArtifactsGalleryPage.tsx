// ArtifactsGalleryPage — /portal/artifacts (Artifacts Reference Gallery).
//
// Design ref: docs/superpowers/specs/2026-07-23-artifacts-reference-gallery-design.md.
//
// The durable shelf of curated, reusable artifacts. A tag-chip filter bar sits
// above a responsive card grid. An artifact appears here iff it carries >=1
// collection tag (the tag IS the curation gate) — untagged ephemeral Hermes
// deliverables stay off the shelf automatically. Team-login page; each artifact
// keeps its own team/public visibility for external sharing.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, ArrowRight, Sparkles, Search } from 'lucide-react'
import PageContainer from '../../components/PageContainer'
import EmptyState from '../../components/EmptyState'
import HermesMark from '../../components/HermesMark'
import { Chip } from '../../components/ui/Chip'
import { TextSkeleton } from '../../components/LoadingSkeleton'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useArtifactGallery, useArtifactTags } from '../../hooks/useArtifacts'
import { PATHS } from '../../constants/paths'
import { formatRelativeTime } from '../../lib/dateUtils'
import { getPersonInfo } from '../../data/team'
import { ICON_PROPS } from '../../lib/iconProps'
import { filterArtifacts } from './artifactGalleryFilter'

export default function ArtifactsGalleryPage() {
  usePageMeta('Artifacts · MN-CCORE', 'Curated, reusable lab reference artifacts')

  // Load the whole tagged gallery once; the chip bar filters client-side (union
  // semantics — an artifact shows if it carries ANY selected tag). "All" (no
  // selection) shows everything. The server ?tag= filter exists for direct links.
  const { data: artifacts = [], isLoading } = useArtifactGallery()
  const { data: tagCounts = [] } = useArtifactTags()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggle = (tag: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })

  // Free-text search over what the gallery feed actually carries: title, tags,
  // and the creator's name. Bodies are deliberately NOT in the feed (an html
  // artifact runs to tens of KB and every card would pay for it), so this does
  // not search inside an artifact — see the note above the input.
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => filterArtifacts(artifacts, selected, query), [artifacts, selected, query])

  return (
    <PageContainer>
      <div style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
        {/* ── Header ── */}
        <div className="flex items-start gap-3" style={{ marginBottom: '1rem' }}>
          <div
            className="flex-shrink-0 flex items-center justify-center"
            style={{ width: 36, height: 36, borderRadius: 'var(--radius-lg)', background: 'var(--gold-active)', color: 'var(--gold)' }}
          >
            <FileText {...ICON_PROPS} size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--ink)', margin: 0, lineHeight: 1.25 }}>
              Artifacts
            </h1>
            <p style={{ fontSize: 13, color: 'var(--slate)', opacity: 0.85, margin: '2px 0 0' }}>
              Curated, reusable reference artifacts. Tag an artifact to shelve it here.
            </p>
          </div>
        </div>

        {/* ── Search ── narrows by title, tag, or who made it. Composes with
            the tag chips below (search AND tag), so you can search inside a
            shelf. Does not reach inside an artifact's body. */}
        <div style={{ position: 'relative', marginBottom: '0.9rem', maxWidth: 420 }}>
          <Search
            {...ICON_PROPS}
            size={15}
            style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)', opacity: 0.7, pointerEvents: 'none' }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artifacts by title, tag, or author"
            aria-label="Search artifacts"
            style={{
              width: '100%',
              fontSize: 13,
              padding: '7px 11px 7px 32px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--ice)',
              color: 'var(--ink)',
            }}
          />
        </div>

        {/* ── Tag-chip filter bar (multi-select; "All" default) ── */}
        {tagCounts.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by tag" style={{ marginBottom: '1.25rem' }}>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              aria-pressed={selected.size === 0 ? 'true' : 'false'}
              className="cursor-pointer"
              style={chipButtonStyle(selected.size === 0)}
            >
              All
            </button>
            {tagCounts.map(({ tag, count }) => {
              const on = selected.has(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag)}
                  aria-pressed={on ? 'true' : 'false'}
                  className="cursor-pointer"
                  style={chipButtonStyle(on)}
                >
                  {tag}
                  <span style={{ opacity: 0.6, marginLeft: 4 }}>{count}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* ── Grid / states ── */}
        {isLoading ? (
          <div style={gridStyle}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="detail-card" style={cardStyle}>
                <TextSkeleton lines={3} />
              </div>
            ))}
          </div>
        ) : artifacts.length === 0 ? (
          <div className="detail-card" style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)' }}>
            <EmptyState
              icon={<FileText size={28} />}
              title="No shelved artifacts yet"
              subtitle="Tag an artifact (in-Hub on its page, or with the --tag flag on publish/save) to add it to the gallery."
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="detail-card" style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)' }}>
            <EmptyState
              icon={<FileText size={28} />}
              title="Nothing matches"
              subtitle={
                query.trim()
                  ? `No artifact matches "${query.trim()}"${selected.size ? ' under the selected tag(s)' : ''}. Titles, tags, and authors are searched — not the text inside an artifact.`
                  : 'No artifact carries the selected tag(s). Clear the filter to see all.'
              }
              action={{
                label: query.trim() ? 'Clear search and filter' : 'Clear filter',
                onClick: () => { setQuery(''); setSelected(new Set()) },
              }}
            />
          </div>
        ) : (
          <div style={gridStyle}>
            {filtered.map((a) => {
              const creator = getPersonInfo(a.created_by)
              return (
                <Link
                  key={a.id}
                  to={PATHS.artifact(a.id)}
                  className="detail-card artifact-card"
                  style={{ ...cardStyle, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {/* Title */}
                  <div className="flex items-start gap-2">
                    <FileText {...ICON_PROPS} size={16} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 2 }} />
                    <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: 0, lineHeight: 1.35 }}>
                      {a.title}
                    </h2>
                  </div>

                  {/* Tag chips */}
                  {a.tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {a.tags.map((t) => (
                        <Chip key={t} color="var(--teal)" pill size="xs">{t}</Chip>
                      ))}
                    </div>
                  )}

                  {/* Meta row: author · updated · Open */}
                  <div className="flex items-center gap-2" style={{ marginTop: 'auto', fontSize: 11, color: 'var(--slate)' }}>
                    {a.created_by === 'claude-ai' ? (
                      <span className="inline-flex items-center gap-1" style={{ color: 'var(--gold)', fontWeight: 500 }}>
                        <HermesMark size={12} variant="avatar" /> Hermes
                      </span>
                    ) : (
                      <span>{creator.name}</span>
                    )}
                    {a.content_type === 'html' && (
                      <span className="inline-flex items-center gap-1" style={{ color: 'var(--teal)', opacity: 0.85 }}>
                        <Sparkles {...ICON_PROPS} size={10} /> interactive
                      </span>
                    )}
                    <span style={{ opacity: 0.7 }}>· {formatRelativeTime(a.updated_at)}</span>
                    <span className="inline-flex items-center gap-1" style={{ marginLeft: 'auto', color: 'var(--teal)', fontWeight: 500 }}>
                      Open <ArrowRight {...ICON_PROPS} size={11} />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </PageContainer>
  )
}

// ── local style helpers ─────────────────────────────────────────────────────
const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 'var(--sp-md)',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--ice)',
  borderRadius: 'var(--radius-xl)',
  padding: '1rem 1.15rem',
  border: '1px solid var(--border-subtle)',
  minHeight: 120,
}

/** Filter-chip button appearance — active = teal fill, inactive = subtle border. */
function chipButtonStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 12,
    fontWeight: 500,
    padding: '4px 12px',
    borderRadius: 'var(--radius-full)',
    background: active ? 'var(--teal-active)' : 'transparent',
    color: active ? 'var(--teal)' : 'var(--slate)',
    border: `1px solid ${active ? 'var(--teal)' : 'var(--border-subtle)'}`,
  }
}
