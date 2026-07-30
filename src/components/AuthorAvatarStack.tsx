import { useState } from 'react'
import type { Publication } from '../data/types'
import { getAllMembers } from '../data/team'
import { resolveLabCoAuthors } from '../lib/authorAvatars'
import Avatar from './Avatar'

const AVATAR_PX = 18 // matches Avatar size="sm-icon" container, so the +N badge lines up
const OVERLAP_PX = 8 // resting overlap between adjacent avatars

/**
 * Overlapping mini-avatar stack for a publication's lab-member co-authors
 * (#906, Nick 2026-07-23). First author renders frontmost (highest z-index)
 * and leftmost; hovering the group spreads every avatar apart and scales
 * them up so they're readable, then collapses back on mouse-leave.
 *
 * Decorative, not informational: the full author byline is already visible
 * as text on every card this renders inside (design principle #2 - show
 * each piece of info once per view), so the stack is `aria-hidden` and each
 * avatar carries a native `title` tooltip for sighted mouse users instead of
 * a second screen-reader announcement of names already read from the text.
 */
export default function AuthorAvatarStack({
  pub,
  maxVisible = 5,
}: {
  pub: Pick<Publication, 'authors' | 'authorSlugs'>
  maxVisible?: number
}) {
  const [hovered, setHovered] = useState(false)
  const authors = resolveLabCoAuthors(pub, getAllMembers())

  if (authors.length === 0) return null

  const visible = authors.slice(0, maxVisible)
  const overflow = authors.length - visible.length

  return (
    <div
      aria-hidden="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        cursor: 'default',
      }}
    >
      {visible.map((a, i) => (
        <div
          key={a.slug}
          title={a.name}
          style={{
            position: 'relative',
            zIndex: visible.length - i,
            marginLeft: i === 0 ? 0 : hovered ? 4 : -OVERLAP_PX,
            transform: hovered ? 'scale(1.35)' : 'scale(1)',
            transition: `margin var(--duration-moderate, 200ms) var(--ease-out), transform var(--duration-moderate, 200ms) var(--ease-out)`,
            borderRadius: '9999px',
            boxShadow: '0 0 0 2px var(--page-bg, #fff)',
          }}
        >
          <Avatar name={a.name} initials={a.initials} photoUrl={a.photoUrl} size="sm-icon" variant="ice" />
        </div>
      ))}
      {overflow > 0 && (
        <span
          title={`${overflow} more lab co-author${overflow === 1 ? '' : 's'}`}
          style={{
            position: 'relative',
            zIndex: 0,
            marginLeft: hovered ? 4 : -OVERLAP_PX,
            width: AVATAR_PX,
            height: AVATAR_PX,
            borderRadius: '9999px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '9px',
            fontWeight: 600,
            color: 'var(--slate)',
            background: 'var(--ice)',
            boxShadow: '0 0 0 2px var(--page-bg, #fff)',
            transition: `margin var(--duration-moderate, 200ms) var(--ease-out)`,
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
