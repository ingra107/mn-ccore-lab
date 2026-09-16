/**
 * ProjectPublications — a project's PUBLISHED OUTPUT (#129).
 *
 * Renders the `project_publications` junction (api/routes/project-publications.ts):
 * first author / senior author / journal / year per paper, with a role chip
 * for anything that isn't the primary paper. Distinct from `ProjectLiterature`
 * (the Literature tab's `paper_project_links` reading list) — that's what the
 * project has READ; this is what the project has PRODUCED.
 *
 * Two mount points: `variant="card"` in the ProjectDetail right column
 * (compact, one-line truncated titles), `variant="list"` at the top of the
 * Literature tab (full titles, "Published from this project" label).
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpenText, X } from 'lucide-react'
import { ICON_PROPS } from '../lib/iconProps'
import AuthorAvatarStack from './AuthorAvatarStack'
import { Chip } from './ui/Chip'
import GhostSelect, { type GhostSelectOption } from './ui/GhostSelect'
import { useProjectPublications, usePublications, type ProjectPublicationDisplay } from '../hooks/useApiData'
import { useLinkProjectPublication, useUnlinkProjectPublication } from '../hooks/mutations/useProjectMutations'
import { PUBLIC_PATHS } from '../constants/paths'
import type { PublicationRole } from '../lib/api'

// Matches ProjectLinkLibrary's LABEL_STYLE (kept file-local there — a shared
// export trips react-refresh/only-export-components).
const LABEL_STYLE = {
  fontSize: '10px',
  fontWeight: 500,
  color: 'var(--slate)',
  opacity: 'var(--ink-label)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
} as const

const ROLE_OPTIONS: GhostSelectOption[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'preprint', label: 'Preprint' },
]

/** Same byline split PublicationCard.formatAuthors / resolveLabCoAuthors use:
 *  strip one trailing period, split on commas, trim, drop empties. */
function splitAuthors(authors: string): string[] {
  return authors.replace(/\.$/, '').split(',').map((s) => s.trim()).filter(Boolean)
}

function AuthorLine({ authors }: { authors: string }) {
  const segs = splitAuthors(authors)
  if (segs.length === 0) return null
  if (segs.length === 1) return <span>{segs[0]}</span>
  return (
    <span>
      {segs[0]} <span style={{ opacity: 0.7 }}>&hellip;</span> {segs[segs.length - 1]}
    </span>
  )
}

interface ProjectPublicationsProps {
  projectSlug: string
  projectTitle: string
  isPi: boolean
  variant?: 'card' | 'list'
}

export default function ProjectPublications({ projectSlug, projectTitle, isPi, variant = 'card' }: ProjectPublicationsProps) {
  const { data: links = [] } = useProjectPublications(projectSlug)
  const { data: allPubs = [] } = usePublications(undefined, { enabled: isPi })
  const linkMutation = useLinkProjectPublication(projectSlug)
  const unlinkMutation = useUnlinkProjectPublication(projectSlug)
  const [role, setRole] = useState<PublicationRole>('primary')

  const linkedIds = useMemo(() => new Set(links.map((l) => l.id)), [links])
  const pickerOptions = useMemo<GhostSelectOption[]>(
    () =>
      allPubs
        .filter((p) => !linkedIds.has(p.id))
        .map((p) => ({ value: p.id, label: `${splitAuthors(p.authors)[0] || 'Unknown'} ${p.year} — ${p.title}` })),
    [allPubs, linkedIds],
  )

  if (links.length === 0 && !isPi) return null

  const isCard = variant === 'card'

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <BookOpenText {...ICON_PROPS} size={13} style={{ color: 'var(--teal)' }} />
        <span style={LABEL_STYLE}>{isCard ? 'Published' : 'Published from this project'}</span>
        {links.length > 0 && (
          <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.75 }}>
            {links.length}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {links.map((pub) => (
          <PublicationLinkRow
            key={pub.id}
            pub={pub}
            isCard={isCard}
            isPi={isPi}
            onUnlink={() => unlinkMutation.mutate(pub.id)}
          />
        ))}

        {links.length === 0 && isPi && (
          <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', margin: 0 }}>
            No publications linked yet.
          </p>
        )}

        {isPi && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <GhostSelect
              aria-label={`Link a publication to ${projectTitle}`}
              value=""
              triggerLabel="+ Link a publication"
              triggerColor="var(--teal)"
              searchable
              maxWidth={260}
              options={pickerOptions}
              onChange={(pubId) => linkMutation.mutate({ publication_id: pubId, role })}
            />
            <GhostSelect
              aria-label="Publication role"
              value={role}
              options={ROLE_OPTIONS}
              onChange={(v) => setRole(v as PublicationRole)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function PublicationLinkRow({
  pub,
  isCard,
  isPi,
  onUnlink,
}: {
  pub: ProjectPublicationDisplay
  isCard: boolean
  isPi: boolean
  onUnlink: () => void
}) {
  return (
    <div className="group flex items-start gap-2">
      <AuthorAvatarStack pub={pub} maxVisible={3} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          to={PUBLIC_PATHS.publication(pub.id)}
          data-tip={isCard ? pub.title : undefined}
          style={{
            fontSize: 'var(--value-size)',
            color: 'var(--ink)',
            textDecoration: 'none',
            display: 'block',
            lineHeight: 1.4,
            minWidth: 0,
            ...(isCard
              ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
              : {}),
          }}
        >
          {pub.title}
        </Link>
        <div
          className="flex flex-wrap items-center gap-1.5"
          style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.85, marginTop: 2 }}
        >
          <AuthorLine authors={pub.authors} />
          {pub.journal && <span>&middot; {pub.journal}</span>}
          {pub.year ? <span>&middot; {pub.year}</span> : null}
          {pub.role !== 'primary' && (
            <Chip color="var(--slate)" bordered>
              {pub.role}
            </Chip>
          )}
          {pub.doi && (
            <a
              href={pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="link-affordance"
              style={{ color: 'var(--teal)' }}
            >
              DOI
            </a>
          )}
          {pub.pubmed && (
            <a
              href={`https://pubmed.ncbi.nlm.nih.gov/${pub.pubmed}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="link-affordance"
              style={{ color: 'var(--teal)' }}
            >
              PubMed
            </a>
          )}
        </div>
      </div>
      {isPi && (
        <button
          onClick={onUnlink}
          aria-label="Unlink"
          className="invisible group-hover:visible"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--slate)',
            opacity: 0.75,
            padding: 2,
            flexShrink: 0,
          }}
        >
          <X {...ICON_PROPS} size={12} />
        </button>
      )}
    </div>
  )
}
