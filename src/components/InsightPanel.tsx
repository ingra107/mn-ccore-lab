import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useInsightSuggestions } from '../hooks/useApiData'

interface InsightPanelProps {
  projectSlug: string
}

export default function InsightPanel({ projectSlug }: InsightPanelProps) {
  const { data: suggestions = [] } = useInsightSuggestions(projectSlug)

  const top3 = suggestions.slice(0, 3)
  if (top3.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.2 }}
      style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} style={{ color: 'var(--teal)' }} />
        <span
          style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--teal)',
            fontWeight: 600,
          }}
        >
          Related Projects
        </span>
        <span
          style={{
            fontSize: '10px',
            color: 'var(--slate)',
            opacity: 'var(--ink-label)',
            fontStyle: 'italic',
          }}
        >
          AI-detected connections
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {top3.map((s) => {
          const reasons = s.reason.split(' | ')
          return (
            <Link
              key={s.slug}
              to={`/projects/${s.slug}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
              style={{
                background: 'var(--ice)',
                border: '1px solid rgba(45,138,138,0.08)',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(45,138,138,0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(45,138,138,0.08)'
              }}
            >
              {/* Strength indicator */}
              <div
                style={{
                  width: 3,
                  height: 28,
                  borderRadius: 2,
                  background: `rgba(45,138,138,${Math.max(0.2, s.strength)})`,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 'var(--value-size)',
                    fontWeight: 500,
                    color: 'var(--ink)',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.title}
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {reasons.slice(0, 2).map((r, i) => (
                    <span
                      key={i}
                      className="inline-block px-1.5 py-0.5 rounded text-[10px]"
                      style={{
                        background: 'rgba(45,138,138,0.08)',
                        color: 'var(--teal)',
                      }}
                    >
                      {r}
                    </span>
                  ))}
                  {reasons.length > 2 && (
                    <span
                      style={{ fontSize: '10px', color: 'var(--slate)', opacity: 'var(--ink-label)' }}
                    >
                      +{reasons.length - 2}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </motion.div>
  )
}
