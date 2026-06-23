import { Link } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import EmptyStateArt from './EmptyStateArt'
import type { EmptyArtVariant } from './EmptyStateArt'
import { PATHS } from '../constants/paths'
import { ICON_PROPS } from '../lib/iconProps'
import { Button } from './ui/Button'

/**
 * S8 — branded entity-not-found state. Replaces the bare "<Thing> not found"
 * H1 dead ends on detail pages (`:slug` / `:id`) with a designed recovery
 * surface: lab art + the bad reference + at least two onward actions
 * (search prefilled with the slug, back to the list, plus any recent/sibling
 * links the caller passes).
 *
 * Adopt on every detail page's not-found branch.
 */
export interface EntityNotFoundLink {
  label: string
  to: string
}

interface EntityNotFoundProps {
  /** Human label, e.g. "Project" / "Meeting". */
  entityLabel: string
  /** The slug/id that failed to resolve, shown verbatim. */
  reference?: string | null
  /** Where "back" goes. */
  backTo: EntityNotFoundLink
  /** EmptyStateArt variant; defaults to 'generic'. */
  artVariant?: EmptyArtVariant
  /** Recent / sibling links for fast recovery. */
  siblings?: EntityNotFoundLink[]
}

export default function EntityNotFound({
  entityLabel,
  reference,
  backTo,
  artVariant = 'generic',
  siblings = [],
}: EntityNotFoundProps) {
  const lower = entityLabel.toLowerCase()
  const searchTo = reference
    ? `${PATHS.search}?q=${encodeURIComponent(reference)}`
    : PATHS.search

  return (
    <div className="content-container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      <Link
        to={backTo.to}
        className="inline-flex items-center gap-2 mb-6"
        style={{ fontSize: '14px', color: 'var(--slate)', textDecoration: 'none' }}
      >
        <ArrowLeft {...ICON_PROPS} size={16} />
        {backTo.label}
      </Link>

      <div style={{ maxWidth: 420 }}>
        <EmptyStateArt variant={artVariant} style={{ marginBottom: '1.25rem', opacity: 0.6 }} />
        <h1 style={{ fontWeight: 600, fontSize: '1.5rem', color: 'var(--ink)', marginBottom: '0.5rem' }}>
          {entityLabel} not found
        </h1>
        <p style={{ color: 'var(--slate)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          {reference
            ? <>No {lower} matches <span style={{ fontWeight: 500, color: 'var(--ink)' }}>“{reference}”</span>. It may have been renamed, archived, or the link is stale.</>
            : <>We couldn't find that {lower}. It may have been renamed, archived, or the link is stale.</>}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            as={Link}
            to={searchTo}
            variant="primary"
            style={{ padding: '6px 12px', fontSize: '0.875rem', fontWeight: 500, borderRadius: 'var(--radius-lg)', textDecoration: 'none' }}
          >
            <Search {...ICON_PROPS} size={14} />
            Search{reference ? ` for “${reference}”` : ''}
          </Button>
          <Button
            as={Link}
            to={backTo.to}
            variant="secondary"
            style={{ padding: '6px 12px', fontSize: '0.875rem', fontWeight: 400, borderRadius: 'var(--radius-lg)', color: 'var(--ink)', textDecoration: 'none' }}
          >
            {backTo.label}
          </Button>
        </div>

        {siblings.length > 0 && (
          <div style={{ marginTop: '1.75rem' }}>
            <p style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--slate)', opacity: 0.85, marginBottom: '0.5rem' }}>
              Recent {lower}s
            </p>
            <div className="flex flex-col gap-1">
              {siblings.map((s) => (
                <Link
                  key={s.to}
                  to={s.to}
                  className="text-sm hover:underline"
                  style={{ color: 'var(--teal)', textDecoration: 'none' }}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
