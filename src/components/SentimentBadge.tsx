const SENTIMENT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  positive: { label: 'Positive', color: 'var(--teal)', bg: 'rgba(45,138,138,0.08)' },
  negative: { label: 'Negative', color: 'var(--maroon)', bg: 'rgba(128,0,0,0.08)' },
  neutral: { label: 'Neutral', color: 'var(--slate)', bg: 'rgba(100,116,139,0.08)' },
  pending: { label: 'Pending', color: 'var(--gold)', bg: 'rgba(201,168,76,0.08)' },
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
