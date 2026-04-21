import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, RefreshCw } from 'lucide-react'
import BentoCard from './BentoCard'
import { useInsightConnections } from '../../hooks/useApiData'
import { useQueryClient } from '@tanstack/react-query'
import { PATHS } from '../../constants/paths'

function InsightsCard() {
  const { data: connections = [], isLoading } = useInsightConnections()
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const top5 = connections.slice(0, 5)

  async function handleRefresh() {
    setRefreshing(true)
    await queryClient.invalidateQueries({ queryKey: ['insight-connections'] })
    setTimeout(() => setRefreshing(false), 600)
  }

  return (
    <BentoCard
      title="Cross-Project Insights"
      subtitle={`${connections.length} connections found`}
      size="span-2"
      icon={Sparkles}
    >
      {/* Refresh button */}
      <div className="flex items-center justify-end mb-2" style={{ marginTop: '-4px' }}>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors"
          style={{
            color: 'var(--teal)',
            background: 'var(--teal-hover)',
            border: '1px solid color-mix(in srgb, var(--teal) 12%, transparent)',
            cursor: refreshing ? 'default' : 'pointer',
            opacity: refreshing ? 0.85 : 1,
          }}
        >
          <RefreshCw
            size={10}
            style={{
              transition: 'transform 0.6s ease',
              transform: refreshing ? 'rotate(360deg)' : 'none',
            }}
          />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
            Analyzing connections...
          </span>
        </div>
      ) : top5.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
            No connections detected yet
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {top5.map((edge, i) => {
            // Split combined reasons for display
            const reasons = edge.reason.split(' | ')
            const primaryReason = reasons[0]
            const moreCount = reasons.length - 1

            return (
              <div
                key={`${edge.from}-${edge.to}-${i}`}
                className="flex items-center gap-2 py-2 px-2 rounded-lg transition-colors"
                style={{
                  borderBottom: i < top5.length - 1 ? '1px solid rgba(45,138,138,0.06)' : undefined,
                }}
              >
                {/* Strength indicator */}
                <div
                  style={{
                    width: 4,
                    height: 24,
                    borderRadius: 'var(--radius-sm)',
                    background: `rgba(45,138,138,${Math.max(0.15, edge.strength)})`,
                    flexShrink: 0,
                  }}
                />

                {/* Project names */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link
                      to={PATHS.project(edge.from)}
                      style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--ink)',
                        textDecoration: 'none',
                        maxWidth: '40%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={edge.fromTitle}
                    >
                      {edge.fromTitle}
                    </Link>
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--teal)',
                        opacity: 0.85,
                        flexShrink: 0,
                      }}
                    >
                      &harr;
                    </span>
                    <Link
                      to={PATHS.project(edge.to)}
                      style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--ink)',
                        textDecoration: 'none',
                        maxWidth: '40%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={edge.toTitle}
                    >
                      {edge.toTitle}
                    </Link>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px]"
                      style={{
                        background: 'var(--teal-active)',
                        color: 'var(--teal)',
                        maxWidth: '260px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {primaryReason}
                    </span>
                    {moreCount > 0 && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--slate)',
                          opacity: 'var(--ink-label)',
                        }}
                      >
                        +{moreCount} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Strength badge */}
                <span
                  className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{
                    background: edge.strength > 0.7
                      ? 'color-mix(in srgb, var(--teal) 12%, transparent)'
                      : edge.strength > 0.4
                      ? 'var(--gold-active)'
                      : 'rgba(100,116,139,0.08)',
                    color: edge.strength > 0.7
                      ? 'var(--teal)'
                      : edge.strength > 0.4
                      ? 'var(--gold)'
                      : 'var(--slate)',
                  }}
                >
                  {Math.round(edge.strength * 100)}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </BentoCard>
  )
}

export default memo(InsightsCard)
