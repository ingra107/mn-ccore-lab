import { Eye, EyeOff } from 'lucide-react'
import { useWatchlist } from '../hooks/useWatchlist'

interface WatchButtonProps {
  id: string
  type: 'project' | 'task' | 'person' | 'meeting'
  label: string
  slug?: string
  compact?: boolean
}

export default function WatchButton({ id, type, label, slug, compact }: WatchButtonProps) {
  const { watch, unwatch, isWatching } = useWatchlist()
  const watching = isWatching(id, type)

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        if (watching) unwatch(id, type)
        else watch({ id, type, label, slug })
      }}
      title={watching ? 'Unwatch' : 'Watch for updates'}
      style={{
        background: watching ? 'rgba(45,138,138,0.08)' : 'none',
        border: watching ? '1px solid rgba(45,138,138,0.2)' : '1px solid var(--border-light)',
        borderRadius: compact ? 'var(--radius-sm)' : 'var(--radius-md)',
        padding: compact ? '2px 6px' : '4px 10px',
        cursor: 'pointer',
        color: watching ? 'var(--teal)' : 'var(--slate)',
        opacity: watching ? 1 : 0.5,
        display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)',
        fontSize: '11px',
      }}
    >
      {watching ? <Eye size={12} /> : <EyeOff size={12} />}
      {!compact && (watching ? 'Watching' : 'Watch')}
    </button>
  )
}
