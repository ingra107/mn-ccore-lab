import { getPersonInfo } from '../data/team'

interface TypingIndicatorProps {
  slugs: string[]
  className?: string
  style?: React.CSSProperties
}

export default function TypingIndicator({ slugs, className, style }: TypingIndicatorProps) {
  if (slugs.length === 0) return null
  const label = slugs.length === 1
    ? `${getPersonInfo(slugs[0]).name.split(' ')[0]} is typing…`
    : `${slugs.length} people are typing…`
  return (
    <p
      className={className}
      style={{
        color: 'var(--teal)',
        opacity: 0.85,
        fontStyle: 'italic',
        fontSize: '10px',
        margin: 0,
        ...style,
      }}
    >
      {label}
    </p>
  )
}
