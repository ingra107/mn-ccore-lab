import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { User } from 'lucide-react'
import type { Publication } from '../data/types'
import { getAllMembers } from '../data/team'
import { resolveBylineAuthors, type BylineAuthor } from '../lib/authorAvatars'
import { PUBLIC_PATHS } from '../constants/paths'
import { ICON_PROPS } from '../lib/iconProps'
import Avatar from './Avatar'

/**
 * The byline as a list of people rather than a run of text (#133, Nick
 * 2026-09-16: "we should have the authors with face picture and name in a
 * column on the right maybe after title? then you can click on them. If its
 * NOT someone in our MNCCORE group you can just have a blank photo so its
 * clear that people in our Lab are the ones with their photo").
 *
 * The blank silhouette is the whole point: it is what makes a lab member's
 * real photo read as a signal instead of decoration. So an outside author
 * gets a flat neutral glyph -- NOT `Avatar`'s generated portrait, which is
 * coloured and carries initials and would compete with the photos it is
 * supposed to set off.
 *
 * Lab members link to their team page; outside authors are plain text,
 * because there is nowhere to send the reader.
 *
 * This replaces the #906 avatar stack, now deleted. That stack answered
 * "which of us is on this paper" with an aria-hidden row of overlapping
 * photos: it could not show an outside author at all, so there was nothing to
 * stand out FROM, and none of it was clickable.
 */

const BLANK_PX = 20

function BlankFace() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: BLANK_PX,
        height: BLANK_PX,
        borderRadius: '9999px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--ice)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--slate)',
        opacity: 0.55,
        flexShrink: 0,
      }}
    >
      <User {...ICON_PROPS} size={11} />
    </span>
  )
}

function AuthorFace({ author }: { author: BylineAuthor }) {
  if (!author.member) return <BlankFace />
  return (
    <span style={{ width: BLANK_PX, height: BLANK_PX, flexShrink: 0, display: 'inline-flex' }}>
      <Avatar
        name={author.member.name}
        initials={author.member.initials}
        photoUrl={author.member.photoUrl}
        size="xs"
        variant="ice"
      />
    </span>
  )
}

function AuthorName({ author }: { author: BylineAuthor }) {
  const style = {
    fontSize: '11px',
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    minWidth: 0,
  }
  if (!author.member) {
    return <span style={{ ...style, color: 'var(--slate)' }}>{author.name}</span>
  }
  return (
    <Link
      to={PUBLIC_PATHS.publicMember(author.member.slug)}
      onClick={(e) => e.stopPropagation()}
      className="link-affordance"
      style={{ ...style, color: 'var(--ink)', fontWeight: 500, textDecoration: 'none' }}
    >
      {author.member.name}
    </Link>
  )
}

export default function AuthorColumn({
  pub,
  maxVisible = 6,
  layout = 'column',
}: {
  pub: Pick<Publication, 'authors'>
  /** Authors shown before the "+N more" toggle. */
  maxVisible?: number
  /** `column` stacks one author per line; `row` wraps them inline for dense
   *  surfaces like the project publications card. */
  layout?: 'column' | 'row'
}) {
  const [showAll, setShowAll] = useState(false)
  // Memoized: this component mounts once per publication row (list/grid of
  // cards), and getAllMembers() rebuilds the whole team roster on every call.
  // Without this, any unrelated parent re-render (search typing, a sibling's
  // state change) re-derives the roster and re-scans authors for every
  // visible card. Same pattern as SearchPage.tsx's `useMemo(() => getAllMembers(), [])`.
  const members = useMemo(() => getAllMembers(), [])
  const authors = useMemo(() => resolveBylineAuthors(pub, members), [pub, members])

  if (authors.length === 0) return null

  const visible = showAll ? authors : authors.slice(0, maxVisible)
  const overflow = authors.length - visible.length

  return (
    <ul
      style={{
        display: 'flex',
        flexDirection: layout === 'column' ? 'column' : 'row',
        flexWrap: layout === 'column' ? 'nowrap' : 'wrap',
        gap: layout === 'column' ? 4 : '4px 10px',
        margin: 0,
        padding: 0,
        listStyle: 'none',
        minWidth: 0,
      }}
    >
      {visible.map((a, i) => (
        <li
          key={`${a.name}-${i}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}
        >
          <AuthorFace author={a} />
          <AuthorName author={a} />
        </li>
      ))}
      {(overflow > 0 || showAll) && (
        <li style={{ display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setShowAll((v) => !v)
            }}
            className="cursor-pointer"
            style={{
              fontSize: '10px',
              color: 'var(--teal)',
              background: 'none',
              border: 'none',
              padding: 0,
              // Line the label up under the names, not under the faces.
              marginLeft: layout === 'column' ? BLANK_PX + 6 : 0,
            }}
          >
            {showAll ? 'Show fewer' : `+${overflow} more`}
          </button>
        </li>
      )}
    </ul>
  )
}
