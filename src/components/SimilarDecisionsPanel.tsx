import { History } from 'lucide-react'
import { useSimilarDecisionsById } from '../hooks/useApiData'
import SentimentBadge from './SentimentBadge'

interface Props {
  decisionId: string
  projects: { slug: string; title: string }[]
}

export default function SimilarDecisionsPanel({ decisionId, projects }: Props) {
  const { data: similar = [], isLoading } = useSimilarDecisionsById(decisionId)

  if (isLoading) {
    return (
      <div className="px-4 pb-4" style={{ borderTop: '1px dashed rgba(201,168,76,0.15)' }}>
        <p style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.5, padding: '8px 0' }}>
          Finding related decisions...
        </p>
      </div>
    )
  }

  if (similar.length === 0) {
    return (
      <div className="px-4 pb-4" style={{ borderTop: '1px dashed rgba(201,168,76,0.15)' }}>
        <p style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.5, padding: '8px 0' }}>
          No similar decisions found.
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 pb-4" style={{ borderTop: '1px dashed rgba(201,168,76,0.15)' }}>
      <div className="flex items-center gap-1.5 mt-3 mb-2">
        <History size={12} style={{ color: 'var(--gold)' }} />
        <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--gold)' }}>
          Related Decisions
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {similar.map((d) => {
          const projTitle = d.project_slug ? projects.find((p) => p.slug === d.project_slug)?.title : null
          return (
            <div
              key={d.id}
              className="p-3 rounded-lg"
              style={{ background: 'rgba(201,168,76,0.03)', border: '1px dashed rgba(201,168,76,0.12)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink)' }}>
                  {d.title}
                </span>
                {d.outcome_sentiment && d.outcome_sentiment !== 'pending' && (
                  <SentimentBadge sentiment={d.outcome_sentiment} />
                )}
                {d.relevance_score && (
                  <span
                    className="text-[9px] px-1 py-0.5 rounded"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.4 }}
                  >
                    score: {d.relevance_score}
                  </span>
                )}
              </div>
              {d.outcome && (
                <p style={{ fontSize: '12px', color: 'var(--teal)', marginTop: 2, marginBottom: 2 }}>
                  Outcome: {d.outcome}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>
                  {new Date(d.created_at).toLocaleDateString()}
                </span>
                {projTitle && (
                  <span style={{ fontSize: '10px', color: 'var(--teal)' }}>
                    {projTitle}
                  </span>
                )}
                {d.shared_tags && d.shared_tags.length > 0 && d.shared_tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[9px] px-1 py-0.5 rounded-full"
                    style={{ color: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.08)' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
