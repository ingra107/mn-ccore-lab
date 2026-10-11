const SENTIMENT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  positive: { label: 'Positive', color: 'var(--sk-t2)', bg: 'color-mix(in srgb, var(--sk-t1) 5%, transparent)' },
  negative: { label: 'Negative', color: 'var(--sk-t2)', bg: 'color-mix(in srgb, var(--sk-t1) 5%, transparent)' },
  neutral: { label: 'Neutral', color: 'var(--slate)', bg: 'rgba(100,116,139,0.08)' },
  pending: { label: 'Pending', color: 'var(--sk-t2)', bg: 'color-mix(in srgb, var(--sk-t1) 5%, transparent)' },
}

export { SENTIMENT_CONFIG }

export default function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  const config = SENTIMENT_CONFIG[sentiment || 'pending'] || SENTIMENT_CONFIG.pending
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-full"
      style={{
        fontWeight: 500,
        color: config.color,
        backgroundColor: config.bg,
      }}
    >
      {config.label}
    </span>
  )
}
