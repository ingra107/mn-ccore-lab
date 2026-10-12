/**
 * PublicParts -- the small pieces every public page shares (s68): the serif
 * page head, the section head, and a person as a face with a role. Styles are
 * in styles/public.css; the public Layout wraps every page in `.pub`.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FaceDisc } from '../today/skin'
import { displayName } from '../../lib/nameUtils'
import type { TeamMember } from '../../data/types'

/** Kicker, serif headline, lede. `h1` may carry an <em> for the one gold word. */
export function PublicHead({ kicker, title, lede, small = false, children }: {
  kicker?: string
  title: ReactNode
  lede?: ReactNode
  small?: boolean
  children?: ReactNode
}) {
  return (
    <header className="pub-top">
      {kicker && <p className="pub-kick">{kicker}</p>}
      <h1 className={`pub-h1${small ? ' pub-h1-sm' : ''}`}>{title}</h1>
      {lede && <p className="pub-lede">{lede}</p>}
      {children}
    </header>
  )
}

export function SecHead({ title, count, right, id }: { title: ReactNode; count?: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div className="pub-sec">
      <h2 id={id}>{title}</h2>
      {count != null && count !== '' && <span className="pub-sec-c">{count}</span>}
      {right != null && <span className="pub-sec-r">{right}</span>}
    </div>
  )
}

/** A team member as a ringed face, name and role, linking to their page. */
export function PersonLink({ m, px = 44 }: { m: TeamMember; px?: number }) {
  const slug = m.slug ?? ''
  const name = slug ? displayName(slug) : m.name
  const face = <FaceDisc initials={m.initials} photo={m.photoUrl} label={name} px={px} variant="brand" decorative />
  const text = (
    <span style={{ minWidth: 0 }}>
      <span className="pub-pn">{name}</span>
      <span className="pub-pr">{m.role}</span>
    </span>
  )
  return slug
    ? <Link to={`/team/${slug}`} className="pub-person">{face}{text}</Link>
    : <span className="pub-person">{face}{text}</span>
}
