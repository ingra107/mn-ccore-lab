import Avatar from './Avatar'
import { getPersonInfo } from '../data/team'
import type { Intent } from '../hooks/usePresence'

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
  /** DD-4: optional per-peer intent. Dot color picks the highest-activity
   *  state across peers (commenting > editing > viewing). Tooltip also
   *  reports intent when present. Omit for plain green "Live" behavior. */
  peerIntents?: Record<string, Intent>
}

const INTENT_LABEL: Record<Intent, string> = {
  viewing: 'viewing',
  editing: 'editing',
  commenting: 'commenting',
}

const INTENT_COLOR: Record<Intent, string> = {
  viewing: 'var(--green)',
  editing: 'var(--orange)',
  commenting: 'var(--teal-solid)',
}

function aggregateIntent(peerIntents: Record<string, Intent>): Intent {
  const values = Object.values(peerIntents)
  if (values.includes('commenting')) return 'commenting'
  if (values.includes('editing')) return 'editing'
  return 'viewing'
}

export default function PresenceAvatars({ slugs, size = '2xs', limit = 4, peerIntents }: Props) {
  if (!slugs.length) return null
  const visible = slugs.slice(0, limit)
  const extra = slugs.length - visible.length
  const dominant = peerIntents ? aggregateIntent(peerIntents) : 'viewing'
  const tooltipBase = `${slugs.length} ${INTENT_LABEL[dominant]} now`
  const tooltipNames = slugs.map((s) => {
    const intent = peerIntents?.[s]
    const name = getPersonInfo(s).name
    return intent && intent !== 'viewing' ? `${name} (${INTENT_LABEL[intent]})` : name
  }).join(', ')

  return (
    <div
      className="flex items-center"
      title={`${tooltipBase}: ${tooltipNames}`}
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
          background: INTENT_COLOR[dominant], marginRight: 4, flexShrink: 0,
          transition: 'background 300ms ease',
        }}
        aria-label={INTENT_LABEL[dominant]}
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
        {extra > 0 ? `+${extra}` : slugs.length === 1 ? INTENT_LABEL[dominant] : `${slugs.length} ${INTENT_LABEL[dominant]}`}
      </span>
    </div>
  )
}
