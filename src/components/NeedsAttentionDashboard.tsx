import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useManuscriptsAttention } from '../hooks/useApiData'
import { useLabPrefs } from '../hooks/useLabPrefs'
import type { ManuscriptsAttentionRow } from '../lib/api'
import { PATHS } from '../constants/paths'
import { formatShortDate } from '../lib/dateUtils'
import { parseDbUtc } from '../lib/time'
import { ICON_PROPS } from '../lib/iconProps'

export type AttentionFilter = 'revisions-overdue' | 'awaiting-review' | 'stale-drafts' | null

interface Props {
  filter: AttentionFilter
  onFilterChange: (next: AttentionFilter) => void
}

const LS_COLLAPSED = 'manuscripts.attention.collapsed'

type SubgroupKey = 'revisions-overdue' | 'awaiting-review' | 'stale-drafts'

const SUBGROUPS: Array<{
  key: SubgroupKey
  label: string
  dot: string
}> = [
  { key: 'revisions-overdue', label: 'Revisions overdue', dot: 'var(--orange)' },
  { key: 'awaiting-review', label: 'Awaiting your review', dot: 'var(--teal)' },
  { key: 'stale-drafts', label: 'Stale drafts', dot: 'var(--slate)' },
]

/**
 * T-29 grouped triage for the Manuscripts page. Three subgroups computed
 * from existing tables — no schema change. Count badges go amber at N≥5
 * per spec. If all subgroups empty, collapses to a single muted line.
 * If only one subgroup has entries, that one renders expanded and the
 * empty siblings are skipped entirely (not rendered as zero-state rows).
 * Section-level collapse persists in localStorage.
 */
export default function NeedsAttentionDashboard({ filter, onFilterChange }: Props) {
  const { prefs } = useLabPrefs()
  const { data, isLoading } = useManuscriptsAttention({
    reviewDays: prefs.manuscriptsReviewDays,
    staleDays: prefs.manuscriptsStaleDays,
  })
  const [sectionCollapsed, setSectionCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_COLLAPSED) === 'true' } catch { return false }
  })
  const [expanded, setExpanded] = useState<Set<SubgroupKey>>(() => new Set<SubgroupKey>())
  // M-10: track whether we've applied the default-expanded urgency rule yet.
  // First render sets this once data arrives, so users don't have to click
  // to triage the highest-urgency non-empty subgroup.
  const [didAutoExpand, setDidAutoExpand] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(LS_COLLAPSED, String(sectionCollapsed)) } catch { /* unavailable */ }
  }, [sectionCollapsed])

  // M-10: auto-expand the highest-urgency non-empty subgroup on first load.
  // Order: revisions-overdue > awaiting-review > stale-drafts. Adjusted during
  // render (React's "adjusting state when a prop changes" pattern) rather than
  // an effect — `didAutoExpand` is the one-shot latch guarding it.
  if (!didAutoExpand && data) {
    const { revisions_overdue: ro, awaiting_review: ar, stale_drafts: sd } = data.data
    let urgent: SubgroupKey | null = null
    if (ro.length > 0) urgent = 'revisions-overdue'
    else if (ar.length > 0) urgent = 'awaiting-review'
    else if (sd.length > 0) urgent = 'stale-drafts'
    setDidAutoExpand(true)
    if (urgent) {
      setExpanded((prev) => new Set<SubgroupKey>([...prev, urgent as SubgroupKey]))
    }
  }

  if (isLoading || !data) return null
  const { revisions_overdue, awaiting_review, stale_drafts } = data.data

  const counts: Record<SubgroupKey, number> = {
    'revisions-overdue': revisions_overdue.length,
    'awaiting-review': awaiting_review.length,
    'stale-drafts': stale_drafts.length,
  }
  const total = counts['revisions-overdue'] + counts['awaiting-review'] + counts['stale-drafts']
  const nonEmpty = SUBGROUPS.filter((g) => counts[g.key] > 0)

  if (total === 0) {
    return (
      <div
        className="mb-4 flex items-center gap-2 px-3 py-1.5"
        style={{
          fontSize: '12px', color: 'var(--muted)',
          borderRadius: 'var(--radius-md)', background: 'var(--surface-2)',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: 'var(--muted)', opacity: 0.7 }} />
        <span>Nothing needs your attention.</span>
      </div>
    )
  }

  const onlyOne = nonEmpty.length === 1
  const rows = (key: SubgroupKey): ManuscriptsAttentionRow[] => {
    if (key === 'revisions-overdue') return revisions_overdue
    if (key === 'awaiting-review') return awaiting_review
    return stale_drafts
  }

  const isExpanded = (key: SubgroupKey) => onlyOne || expanded.has(key) || filter === key
  const toggleSubgroup = (key: SubgroupKey) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {/* Section header with count + section collapse */}
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle {...ICON_PROPS} size={16} style={{ color: 'var(--gold)' }} />
        <h2 style={{ fontWeight: 600, fontSize: '16px', color: 'var(--ink)', margin: 0 }}>
          Needs your attention
        </h2>
        <CountBadge n={total} />
        <button
          type="button"
          onClick={() => setSectionCollapsed((c) => !c)}
          aria-label={sectionCollapsed ? 'Expand section' : 'Collapse section'}
          className="ml-auto inline-flex items-center gap-1 rounded"
          style={{
            border: 'none', background: 'transparent', color: 'var(--slate)',
            cursor: 'pointer', padding: '4px 6px', fontSize: '11px', opacity: 0.75,
          }}
        >
          {sectionCollapsed ? <ChevronDown {...ICON_PROPS} size={12} /> : <ChevronUp {...ICON_PROPS} size={12} />}
          <span>{sectionCollapsed ? 'Show' : 'Hide'}</span>
        </button>
      </div>

      {!sectionCollapsed && (
        <div className="rounded-xl" style={{ border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          {SUBGROUPS.filter((g) => counts[g.key] > 0).map((g, idx) => {
            const active = filter === g.key
            const openForReal = isExpanded(g.key)
            const panelId = `ms-subgroup-${g.key}-rows`
            // M-09: split chevron-toggles-expand from row-toggles-filter so a
            // user can read the expanded subgroup AND keep the full table
            // below the dashboard. Previously one button conflated both.
            const handleFilterToggle = () => {
              if (onlyOne) return
              onFilterChange(active ? null : g.key)
            }
            return (
              <div key={g.key} style={{ borderBottom: idx < nonEmpty.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div
                  className="w-full flex items-center gap-2"
                  style={{
                    padding: '10px 16px',
                    background: active ? 'var(--surface-2)' : 'transparent',
                    color: 'var(--ink)',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  {/* Chevron — expand/collapse only. M-17: aria-controls links button to panel. */}
                  {!onlyOne && (
                    <button
                      type="button"
                      onClick={() => toggleSubgroup(g.key)}
                      aria-expanded={openForReal ? 'true' : 'false'}
                      aria-controls={panelId}
                      aria-label={openForReal ? `Collapse ${g.label}` : `Expand ${g.label}`}
                      style={{
                        border: 'none', background: 'transparent', cursor: 'pointer',
                        padding: '2px', display: 'inline-flex', alignItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {openForReal
                        ? <ChevronDown {...ICON_PROPS} size={12} style={{ color: 'var(--slate)' }} />
                        : <ChevronRight {...ICON_PROPS} size={12} style={{ color: 'var(--slate)' }} />
                      }
                    </button>
                  )}
                  {/* Row body — filter toggle only. M-09. */}
                  <button
                    type="button"
                    onClick={handleFilterToggle}
                    aria-pressed={active}
                    className="flex items-center gap-2 text-left flex-1"
                    style={{
                      border: 'none', background: 'transparent',
                      cursor: onlyOne ? 'default' : 'pointer',
                      color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit',
                      padding: 0,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: g.dot, flexShrink: 0 }} />
                    <span>{g.label}</span>
                    <CountBadge n={counts[g.key]} />
                    {active && (
                      <span style={{
                        marginLeft: 'auto', fontSize: '10px', fontWeight: 500,
                        color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        Filtering
                      </span>
                    )}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {openForReal && (
                    <motion.div
                      key={`${g.key}-rows`}
                      id={panelId}
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      {rows(g.key).map((r) => renderRow(g.key, r))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}

          {/* Show all reset */}
          {filter && (
            <div
              style={{
                padding: '8px 16px',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--surface-2)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => onFilterChange(null)}
                className="text-xs"
                style={{
                  border: 'none', background: 'transparent', color: 'var(--teal)',
                  cursor: 'pointer', padding: '2px 6px', fontWeight: 500,
                }}
              >
                Show all ({total})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CountBadge({ n }: { n: number }) {
  const high = n >= 5
  return (
    <span
      style={{
        fontSize: '11px', fontWeight: 600,
        padding: '1px 8px', borderRadius: 'var(--radius-full)',
        color: high ? 'var(--gold-on-emphasis)' : 'var(--slate)',
        background: high ? 'var(--gold-emphasis)' : 'var(--surface-2)',
        letterSpacing: '0.02em', flexShrink: 0,
      }}
    >
      {n}
    </span>
  )
}

function renderRow(kind: SubgroupKey, r: ManuscriptsAttentionRow) {
  const slug = r.project_slug || r.project_id
  const href = slug
    ? (kind === 'stale-drafts' ? PATHS.project(slug) : `${PATHS.project(slug)}?tab=revisions`)
    : PATHS.manuscripts

  if (kind === 'revisions-overdue') {
    const dueLabel = r.response_due ? formatShortDate(r.response_due) : '—'
    const outstanding = Math.max(0, (r.comment_count ?? 0) - (r.resolved_count ?? 0))
    return (
      <Link
        key={r.id}
        to={href}
        className="block"
        style={{
          padding: '8px 16px 8px 36px',
          borderTop: '1px solid var(--border-subtle)',
          textDecoration: 'none',
          color: 'inherit',
          fontSize: '12px',
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 1fr) 70px 110px 130px',
          columnGap: '12px',
          alignItems: 'center',
        }}
      >
        <span style={{ color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.project_title || r.project_id}
        </span>
        <span style={{ color: 'var(--muted)' }}>R{r.round ?? ''}</span>
        <span style={{ color: 'var(--muted)' }}>{r.journal ?? '—'}</span>
        <span style={{ color: 'var(--orange)', fontWeight: 500 }}>
          Due {dueLabel}{outstanding > 0 ? ` · ${outstanding} open` : ''}
        </span>
      </Link>
    )
  }

  if (kind === 'awaiting-review') {
    const snippet = (r.comment_text ?? '').slice(0, 80)
    const ageDays = r.created_at ? Math.max(0, Math.floor((Date.now() - parseDbUtc(r.created_at).getTime()) / 86_400_000)) : 0
    return (
      <Link
        key={r.id}
        to={href}
        className="block"
        style={{
          padding: '8px 16px 8px 36px',
          borderTop: '1px solid var(--border-subtle)',
          textDecoration: 'none',
          color: 'inherit',
          fontSize: '12px',
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 2fr) 80px',
          columnGap: '12px',
          alignItems: 'center',
        }}
      >
        <span style={{ color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.project_title || r.project_id}
        </span>
        <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {snippet}
        </span>
        <span style={{ color: 'var(--teal)', fontWeight: 500 }}>
          {ageDays}d waiting
        </span>
      </Link>
    )
  }

  // stale-drafts
  const ageDays = r.updated_at ? Math.max(0, Math.floor((Date.now() - parseDbUtc(r.updated_at).getTime()) / 86_400_000)) : 0
  return (
    <Link
      key={r.id}
      to={href}
      className="block"
      style={{
        padding: '8px 16px 8px 36px',
        borderTop: '1px solid var(--border-subtle)',
        textDecoration: 'none',
        color: 'inherit',
        fontSize: '12px',
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 2fr) minmax(120px, 1fr) 110px',
        columnGap: '12px',
        alignItems: 'center',
      }}
    >
      <span style={{ color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.title || 'Untitled'}
      </span>
      <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.journal ?? 'No journal set'}
      </span>
      <span style={{ color: 'var(--muted)' }}>
        Idle {ageDays}d
      </span>
    </Link>
  )
}
