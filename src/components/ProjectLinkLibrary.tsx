/**
 * ProjectLinkLibrary — the project page's ONE Links card.
 *
 * WHY THIS EXISTS (Nick, 2026-08-25): "the project page should have all links
 * and documents and artifacts with time stamps and such but only the current
 * ones should be used." Before it, the page rendered only the three
 * denormalized key_link_1/2/3 slots via KeyLinksEditor, while task cards
 * inherited the WHOLE unbounded links table — exactly backwards.
 *
 * ONE CARD, NOT TWO (#2091, 2026-09-24). The first cut stacked this list under
 * its own "Documents & Links" heading directly below the "Key Links" strip, so
 * a pinned link rendered twice under two near-identical headings (8 of the 11
 * populated project slots in prod were also rows here) and Nick: "i still can
 * never find all these links on the projects page". Now the pinned slots are
 * the top row of this card (the `pinnedEditor` the page passes in), the
 * library lists every OTHER current row, and the archive sits collapsed at the
 * bottom. The two stores stay distinct on purpose — pinned vs library is
 * Nick's 2026-07-21 decision (Context/Decisions/2026-07-21-project-links-model-
 * and-tag-parity.md), and he declined a merged starred list that day — so this
 * merges the RENDERING, not the data model.
 *
 * ARCHIVE / RESTORE (#2089). Each stored row carries an icon-only archive
 * control, and each archived row a restore control, posting to
 * POST /api/links/:id/role. Archive is not delete: an archived row stays live
 * here, dated, and drops off task cards (handleGetTaskLinks filters role='key').
 * Derived rows (primary_folder / github_url / box_url) have no stored row, so
 * they carry no control.
 *
 * Dates: `updated_at` is the archive stamp for an archived link; `created_at`
 * is when a current one was filed. Both render through `formatDbLocal`.
 */

import type { ReactNode } from 'react'
import { Archive, ArchiveRestore, Link2 } from 'lucide-react'
import StoredLinkChip from './StoredLinkChip'
import CollapsibleSection from './CollapsibleSection'
import { Button } from './ui/Button'
import { canChangeRole, partitionForProjectPage } from '../lib/projectLinkLibrary'
import { formatDbLocal } from '../lib/time'
import { ICON_PROPS } from '../lib/iconProps'
import type { StoredLink } from '../hooks/useApiData'

import { LABEL_STYLE } from './ui/labelStyle'

type Role = 'key' | 'archive'

function LinkRow({
  link,
  dateField,
  onSetRole,
}: {
  link: StoredLink
  dateField: 'created_at' | 'updated_at'
  onSetRole?: (link: StoredLink, role: Role) => void
}) {
  const date = formatDbLocal(link[dateField], 'date')
  const archived = link.role === 'archive'
  const label = archived ? 'Restore link' : 'Archive link'
  return (
    <div className="group flex items-center justify-between gap-2">
      <StoredLinkChip link={link} />
      <span className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
        {date && (
          // --muted, not a dimmed --slate: the opacity policy floors secondary
          // text at 0.85 and reserves 0.55-0.70 for decoration.
          <span style={{ fontSize: '10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            {date}
          </span>
        )}
        {onSetRole && canChangeRole(link) && (
          <Button
            variant="ghost"
            onClick={() => onSetRole(link, archived ? 'key' : 'archive')}
            data-tip={label}
            aria-label={`${label}: ${link.short_title || link.canonical_url}`}
            className="tip opacity-60 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            style={{ color: 'var(--slate)', padding: 0, display: 'grid' }}
          >
            {archived
              ? <ArchiveRestore {...ICON_PROPS} size={12} />
              : <Archive {...ICON_PROPS} size={12} />}
          </Button>
        )}
      </span>
    </div>
  )
}

interface Props {
  links: StoredLink[] | undefined
  isLoading?: boolean
  /** URLs the host already renders as pinned chips; matching rows are not repeated below. */
  slotUrls?: ReadonlyArray<string | null | undefined>
  /** The pinned-slot editor (KeyLinksEditor on the project page), rendered as the card's top row. */
  pinnedEditor?: ReactNode
  onSetRole?: (link: StoredLink, role: Role) => void
}

export default function ProjectLinkLibrary({ links, isLoading, slotUrls = [], pinnedEditor, onSetRole }: Props) {
  const { current, archived } = isLoading
    ? { current: [], archived: [] }
    : partitionForProjectPage(links ?? [], slotUrls)
  // With no pinned row to host, an empty library renders nothing at all.
  if (!pinnedEditor && current.length === 0 && archived.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link2 {...ICON_PROPS} size={13} style={{ color: 'var(--teal)' }} />
        <span style={LABEL_STYLE}>Links</span>
      </div>

      {pinnedEditor}

      {current.length > 0 && (
        <div className="flex flex-col gap-1.5" style={{ marginTop: pinnedEditor ? '10px' : 0 }}>
          {current.map((link) => (
            <LinkRow key={link.id} link={link} dateField="created_at" onSetRole={onSetRole} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div style={{ marginTop: pinnedEditor || current.length > 0 ? '10px' : 0 }}>
          <CollapsibleSection
            title="Archived"
            icon={<Archive {...ICON_PROPS} size={11} style={{ color: 'var(--slate)' }} />}
            badge={archived.length}
            storageKey="project-links-archived"
          >
            {/* No wrapper opacity: it multiplies into every child (the design
                system forbids compound opacity). */}
            <div className="flex flex-col gap-1.5">
              {archived.map((link) => (
                <LinkRow key={link.id} link={link} dateField="updated_at" onSetRole={onSetRole} />
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  )
}
