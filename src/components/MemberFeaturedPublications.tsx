/**
 * MemberFeaturedPublications — the member-curated "Featured Articles" section
 * on a member page (PB backlog #906, schema-v106).
 *
 * Nick's 2026-07-23 ask: a member page leads with up to ten articles THAT
 * MEMBER CHOOSES, then the recency-ordered "All Publications" rollup. Nick's
 * 2026-08-01 call: the MEMBER controls the order too, not just the set — so
 * the editor has explicit up/down, and the list renders in stored order.
 *
 * Reads GET /api/team/:slug/featured-publications; writes the whole ordered
 * list back with one PUT (index becomes sort_order). Reordering, adding and
 * removing are all the same call — there is no partial-update path to keep
 * consistent.
 *
 * Editing shows ONLY on the portal route and ONLY to the member themselves or
 * a PI; `canEdit` is decided by the caller (MemberPage) and re-checked by the
 * server, which is the authority.
 *
 * When the API is unreachable the section renders NOTHING for a visitor, and
 * for an editor renders a plain "unavailable" note with editing off. It never
 * falls back to the static publication data: that data has only the lab-wide
 * `featured` flag, so showing it here would put picks on the page that the
 * member never made, and any "save" against it could not persist.
 *
 * Renders through PubRow, the one public paper card (Nick's Wave 2 pick on
 * 2026-10-13, "Published by default, one card"; source cited in PubRow). The
 * faces stay on here too, the member's own included: principle 11, one card
 * looks the same on every page.
 */

import { useMemo, useState } from 'react'
import { Star, ChevronUp, ChevronDown, X, Plus, Check } from 'lucide-react'
import type { Publication } from '../data/types'
import PubRow from './public/PubRow'
import { ICON_PROPS } from '../lib/iconProps'
import { useMemberFeaturedPublications } from '../hooks/useApiData'
import { useSetMemberFeaturedPublications } from '../hooks/useMutations'

/** Mirrors MAX_FEATURED_PUBLICATIONS in api/routes/member-featured-publications
 *  .ts. The server is the enforcer — this only stops the UI from offering an
 *  eleventh pick it knows will be rejected. */
const MAX_FEATURED = 10

// 24px is the smallest tap target (WCAG 2.5.8); these were 20px (audit G9-9).
const iconBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 2,
  minWidth: 24,
  minHeight: 24,
  cursor: 'pointer',
  color: 'var(--slate)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 0,
}

function rowStyle(): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-sm)',
    padding: '6px var(--sp-sm)',
    borderBottom: '1px solid var(--border-subtle)',
    fontSize: 'var(--text-small)',
    color: 'var(--ink)',
  }
}

function pubLabel(pub: Publication): string {
  return `${pub.title} (${pub.year})`
}

export default function MemberFeaturedPublications({
  slug,
  memberPubs,
  canEdit,
}: {
  slug: string
  /** Every publication attributed to this member — the pool the editor picks
   *  from. MemberPage already derives it; do not re-derive it here. */
  memberPubs: Publication[]
  /** Portal route AND (viewer is this member OR viewer is a PI). */
  canEdit: boolean
}) {
  const { data: featured = [], isError } = useMemberFeaturedPublications(slug)
  const save = useSetMemberFeaturedPublications(slug)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])

  const byId = useMemo(() => {
    const m = new Map<string, Publication>()
    for (const p of memberPubs) m.set(p.id, p)
    // A featured row can outlive its presence in memberPubs (author_slugs is
    // incomplete — PB #1126), so seed from the server list too or the editor
    // would silently drop picks it cannot name.
    for (const p of featured) m.set(p.id, p)
    return m
  }, [memberPubs, featured])

  const draftPubs = draft.map((id) => byId.get(id)).filter((p): p is Publication => Boolean(p))
  const candidates = memberPubs
    .filter((p) => !draft.includes(p.id))
    .sort((a, b) => b.year - a.year)

  function startEditing() {
    setDraft(featured.map((p) => p.id))
    setEditing(true)
    save.reset()
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= draft.length) return
    const next = [...draft]
    const held = next[index]
    next[index] = next[target]
    next[target] = held
    setDraft(next)
  }

  /** What the editor SHOWS is what it SAVES — never the raw draft, so an id
   *  the editor could not render can never be silently persisted. */
  function saveDraft() {
    save.mutate(draftPubs.map((p) => p.id), { onSuccess: () => setEditing(false) })
  }

  // ── API unreachable ──────────────────────────────────────────────────────
  if (isError) {
    if (!canEdit) return null
    return (
      <section className="mb-8" id="featured-publications">
        <div className="flex items-center gap-2 mb-2">
          <Star {...ICON_PROPS} size={16} style={{ color: 'var(--job-brand)' }} aria-hidden="true" />
          <h2 className="text-sm" style={{ color: 'var(--job-brand)', fontSize: 'var(--text-small)', fontWeight: 600 }}>
            Featured articles
          </h2>
        </div>
        <p style={{ fontSize: 'var(--text-small)', color: 'var(--slate)' }}>
          Featured articles are unavailable right now, so editing is off. Nothing was lost —
          reload once the site is back.
        </p>
      </section>
    )
  }

  // Nothing chosen, and either nobody who could choose or nothing to choose
  // FROM → the section does not exist. (A member with zero publications must
  // not get an empty "choose your featured articles" prompt.)
  if (!editing && featured.length === 0 && (!canEdit || memberPubs.length === 0)) return null

  return (
    <section className="mb-8" id="featured-publications">
      <div className="flex items-center gap-2 mb-4">
        <Star {...ICON_PROPS} size={16} style={{ color: 'var(--job-brand)' }} aria-hidden="true" />
        <h2
          className="text-sm"
          style={{
            color: 'var(--job-brand)',
            fontSize: 'var(--text-small)',
            fontWeight: 600,
          }}
        >
          Featured articles
        </h2>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={startEditing}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--slate)',
              fontSize: 'var(--text-label)',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            {featured.length > 0 ? 'Edit' : 'Choose your featured articles'}
          </button>
        )}
      </div>

      {/* ── read view ── */}
      {!editing && featured.length > 0 && (
        <div className="pub-card" style={{ padding: 8 }}>
          {featured.map((pub) => <PubRow key={pub.id} pub={pub} />)}
        </div>
      )}

      {/* ── edit view — in place, no navigation (design principle #3) ── */}
      {editing && (
        <div className="card" style={{ padding: 'var(--sp-md)' }}>
          <p style={{ fontSize: 'var(--text-label)', color: 'var(--slate)', marginBottom: 'var(--sp-sm)' }}>
            Pick up to {MAX_FEATURED}. The order here is the order on your page —
            the top one leads.
          </p>

          <div style={{ marginBottom: 'var(--sp-md)' }}>
            {draftPubs.length === 0 && (
              <p style={{ fontSize: 'var(--text-small)', color: 'var(--slate)', padding: '6px 0' }}>
                Nothing featured yet. Add papers from the list below.
              </p>
            )}
            {draftPubs.map((pub, i) => (
              <div key={pub.id} style={rowStyle()}>
                <span
                  style={{
                    width: 18,
                    flexShrink: 0,
                    color: 'var(--slate)',
                    fontSize: 'var(--text-label)',
                    textAlign: 'right',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>{pubLabel(pub)}</span>
                <button
                  type="button"
                  style={{ ...iconBtn, opacity: i === 0 ? 0.4 : 1 }}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`Move "${pub.title}" up`}
                  title="Move up"
                >
                  <ChevronUp {...ICON_PROPS} size={16} />
                </button>
                <button
                  type="button"
                  style={{ ...iconBtn, opacity: i === draftPubs.length - 1 ? 0.4 : 1 }}
                  disabled={i === draftPubs.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Move "${pub.title}" down`}
                  title="Move down"
                >
                  <ChevronDown {...ICON_PROPS} size={16} />
                </button>
                <button
                  type="button"
                  style={iconBtn}
                  onClick={() => setDraft(draft.filter((id) => id !== pub.id))}
                  aria-label={`Remove "${pub.title}" from featured`}
                  title="Remove"
                >
                  <X {...ICON_PROPS} size={16} />
                </button>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 'var(--text-label)', color: 'var(--slate)', marginBottom: 'var(--sp-xs)' }}>
            Your other papers ({candidates.length})
            {draft.length >= MAX_FEATURED && ` — ${MAX_FEATURED} is the limit; remove one to add another`}
          </p>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {candidates.map((pub) => (
              <div key={pub.id} style={rowStyle()}>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--slate)' }}>{pubLabel(pub)}</span>
                <button
                  type="button"
                  style={{ ...iconBtn, opacity: draft.length >= MAX_FEATURED ? 0.4 : 1 }}
                  disabled={draft.length >= MAX_FEATURED}
                  onClick={() => setDraft([...draft, pub.id])}
                  aria-label={`Feature "${pub.title}"`}
                  title="Add to featured"
                >
                  <Plus {...ICON_PROPS} size={16} />
                </button>
              </div>
            ))}
          </div>

          {save.isError && (
            <p role="alert" style={{ fontSize: 'var(--text-small)', color: 'var(--job-danger)', marginTop: 'var(--sp-sm)' }}>
              Could not save: {save.error instanceof Error ? save.error.message : 'unknown error'}
            </p>
          )}

          <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginTop: 'var(--sp-md)' }}>
            <button
              type="button"
              disabled={save.isPending}
              onClick={saveDraft}
              className="tk-btn tk-sm"
            >
              <Check {...ICON_PROPS} size={14} />
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => setEditing(false)}
              className="tk-btn tk-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
