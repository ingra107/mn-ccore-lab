import Avatar from './Avatar'
import { getPersonInfo } from '../data/team'

/**
 * Render a horizontal avatar stack for concurrent viewers of an entity.
 * Feeds from `usePresence()` — just pass the slug list.
 *
 * Max 4 avatars shown; anything beyond collapses to "+N".
 */

interface Props {
  slugs: string[]
  size?: 'xs' | '2xs' | 'sm-icon'
  limit?: number
}

export default function PresenceAvatars({ slugs, size = '2xs', limit = 4 }: Props) {
  if (!slugs.length) return null
  const visible = slugs.slice(0, limit)
  const extra = slugs.length - visible.length

  return (
    <div
      className="flex items-center"
      title={`${slugs.length} viewing now: ${slugs.map((s) => getPersonInfo(s).name).join(', ')}`}
      style={{
        background: 'var(--teal-active)',
        borderRadius: 'var(--radius-full)',
        padding: '2px 6px 2px 4px',
        fontSize: '10px',
        color: 'var(--teal)',
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: 'var(--radius-circle)',
          background: 'var(--green)', marginRight: 4, flexShrink: 0,
        }}
        aria-label="Live"
      />
      <div className="flex items-center" style={{ marginRight: 4 }}>
        {visible.map((slug, i) => {
          const info = getPersonInfo(slug)
          return (
            <div
              key={slug}
              style={{
                marginLeft: i === 0 ? 0 : -6,
                zIndex: visible.length - i,
                border: '1.5px solid var(--cream)',
                borderRadius: 'var(--radius-circle)',
                overflow: 'hidden',
                width: size === 'xs' ? 18 : 16,
                height: size === 'xs' ? 18 : 16,
              }}
            >
              <Avatar name={info.name} initials={info.initials} photoUrl={info.photoUrl} size={size} variant="ice" />
            </div>
          )
        })}
      </div>
      <span>
        {extra > 0 ? `+${extra}` : slugs.length === 1 ? 'viewing' : `${slugs.length} viewing`}
      </span>
    </div>
  )
}
