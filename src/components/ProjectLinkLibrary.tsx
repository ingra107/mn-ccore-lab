/**
 * ProjectLinkLibrary — the project's full link table, dated and grouped by role.
 *
 * WHY THIS EXISTS (Nick, 2026-08-25): "the project page should have all links
 * and documents and artifacts with time stamps and such but only the current
 * ones should be used." Before this, the project page rendered only the three
 * denormalized key_link_1/2/3 slots via KeyLinksEditor, while task cards
 * inherited the WHOLE unbounded links table — exactly backwards. A project with
 * five links showed three on its own page and all five on every one of its
 * tasks, superseded ones included.
 *
 * The two halves of the fix:
 *   1. handleGetTaskLinks filters inherited project links to role='key', so a
 *      superseded link stops following the project onto task cards.
 *   2. This component renders EVERY live row, archived ones in a collapsed
 *      group — which is what keeps archive distinct from delete. Without it,
 *      re-roling a link would hide it everywhere and "archive" would just be a
 *      slower tombstone.
 *
 * Dates: `updated_at` is when the row last changed (its archive stamp, for an
 * archived link); `created_at` is when it was first filed. Both come from D1
 * via FE_LINKS_COLS, and both render through `formatDbLocal`, the canonical
 * stored-timestamp chokepoint.
 */

import { Archive, Link2 } from 'lucide-react'
import StoredLinkChip from './StoredLinkChip'
import CollapsibleSection from './CollapsibleSection'
import { partitionByRole } from '../lib/projectLinkLibrary'
import { formatDbLocal } from '../lib/time'
import { ICON_PROPS } from '../lib/iconProps'
import type { StoredLink } from '../hooks/useApiData'

const LABEL_STYLE = {
  fontSize: '10px',
  fontWeight: 500,
  color: 'var(--slate)',
  opacity: 'var(--ink-label)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
} as const

function LinkRow({ link, dateField }: { link: StoredLink; dateField: 'created_at' | 'updated_at' }) {
  const date = formatDbLocal(link[dateField], 'date')
  return (
    <div className="flex items-baseline justify-between gap-2">
      <StoredLinkChip link={link} />
      {date && (
        // --muted, not a dimmed --slate: the opacity policy floors secondary
        // text at 0.85 and reserves 0.55-0.70 for decoration, and an opacity
        // here would compound with any parent that sets one.
        <span style={{ fontSize: '10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {date}
        </span>
      )}
    </div>
  )
}

interface Props {
  links: StoredLink[] | undefined
  isLoading?: boolean
}

export default function ProjectLinkLibrary({ links, isLoading }: Props) {
  if (isLoading) return null
  const { current, archived } = partitionByRole(links ?? [])
  if (current.length === 0 && archived.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link2 {...ICON_PROPS} size={13} style={{ color: 'var(--teal)' }} />
        <span style={LABEL_STYLE}>Documents &amp; Links</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {current.map((link) => (
          <LinkRow key={link.id} link={link} dateField="created_at" />
        ))}
      </div>

      {archived.length > 0 && (
        <div style={{ marginTop: current.length > 0 ? '10px' : 0 }}>
          <CollapsibleSection
            title="Archived"
            icon={<Archive {...ICON_PROPS} size={11} style={{ color: 'var(--slate)' }} />}
            badge={archived.length}
            storageKey="project-links-archived"
          >
            {/* No wrapper opacity: it multiplies into every child (the design
                system forbids compound opacity). The collapsed group and its
                Archive icon already carry the "superseded" signal. */}
            <div className="flex flex-col gap-1.5">
              {archived.map((link) => (
                <LinkRow key={link.id} link={link} dateField="updated_at" />
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  )
}
