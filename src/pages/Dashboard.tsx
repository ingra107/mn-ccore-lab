import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Settings2, Plus, CalendarPlus, FolderPlus } from 'lucide-react'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { usePageMeta } from '../hooks/usePageMeta'
import PipelineCard from '../components/dashboard/PipelineCard'
import StatsCard from '../components/dashboard/StatsCard'
import UpcomingCard from '../components/dashboard/UpcomingCard'
import ActivityFeedCard from '../components/dashboard/ActivityFeedCard'
import GrantTimelineCard from '../components/dashboard/GrantTimelineCard'
import CLIFMiniCard from '../components/dashboard/CLIFMiniCard'
import TopicBubblesCard from '../components/dashboard/TopicBubblesCard'
import ActionBoardCard from '../components/dashboard/ActionBoardCard'
import ProjectHealthCard from '../components/dashboard/ProjectHealthCard'
import MyItemsCard from '../components/dashboard/MyItemsCard'

// Card registry — order matters for default layout
const CARD_REGISTRY = [
  { id: 'action-board', label: 'Action Board', component: ActionBoardCard, defaultVisible: true },
  { id: 'upcoming', label: 'Upcoming Meeting', component: UpcomingCard, defaultVisible: true },
  { id: 'project-health', label: 'Project Health', component: ProjectHealthCard, defaultVisible: true },
  { id: 'pipeline', label: 'Research Pipeline', component: PipelineCard, defaultVisible: true },
  { id: 'activity', label: 'Activity Feed', component: ActivityFeedCard, defaultVisible: true },
  { id: 'stats', label: 'Quick Stats', component: StatsCard, defaultVisible: true },
  { id: 'grants', label: 'Grant Timeline', component: GrantTimelineCard, defaultVisible: false },
  { id: 'my-items', label: 'My Items', component: MyItemsCard, defaultVisible: false },
  { id: 'clif', label: 'CLIF Network', component: CLIFMiniCard, defaultVisible: false },
  { id: 'topics', label: 'Research Topics', component: TopicBubblesCard, defaultVisible: false },
] as const

const STORAGE_KEY = 'mnccore-dashboard-cards'

function getVisibleCards(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return new Set(JSON.parse(stored))
  } catch { /* use defaults */ }
  return new Set(CARD_REGISTRY.filter(c => c.defaultVisible).map(c => c.id))
}

export default function Dashboard() {
  usePageMeta(
    'Dashboard | MN-CCORE Lab',
    'Research command center for MN-CCORE. Track active projects, grant timelines, action items, and collaboration metrics across the consortium.'
  )
  const headerRef = useScrollReveal<HTMLDivElement>()
  const [showMore, setShowMore] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [visibleCards, setVisibleCards] = useState<Set<string>>(getVisibleCards)

  const toggleCard = useCallback((id: string) => {
    setVisibleCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  const primaryCards = CARD_REGISTRY.filter(c => c.defaultVisible && visibleCards.has(c.id))
  const secondaryCards = CARD_REGISTRY.filter(c => !c.defaultVisible && visibleCards.has(c.id))

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        {/* Page Header */}
        <div ref={headerRef} className="fade-in-up" style={{ marginBottom: '1.5rem', paddingTop: '0.25rem' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#22c55e',
                  boxShadow: '0 0 8px rgba(34, 197, 94, 0.4)',
                  animation: 'status-pulse 2s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--slate)',
                  opacity: 0.6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                Live overview
              </span>
            </div>

            {/* Customize button */}
            <button
              onClick={() => setShowCustomize(!showCustomize)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
              style={{
                fontFamily: 'var(--font-sans)',
                color: showCustomize ? 'var(--teal)' : 'var(--slate)',
                backgroundColor: showCustomize ? 'rgba(45,138,138,0.08)' : 'transparent',
                border: '1px solid',
                borderColor: showCustomize ? 'var(--teal)' : 'var(--border-light)',
                cursor: 'pointer',
                opacity: showCustomize ? 1 : 0.6,
              }}
            >
              <Settings2 size={12} />
              Customize
            </button>
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
              color: 'var(--ink)',
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            Research Command Center
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '15px',
              color: 'var(--slate)',
              opacity: 0.7,
              marginTop: '6px',
              maxWidth: '520px',
            }}
          >
            Lab health at a glance — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          {/* Gold rule */}
          <div
            style={{
              height: '1px',
              background: 'linear-gradient(to right, var(--gold), transparent)',
              opacity: 0.3,
              marginTop: '1.25rem',
            }}
          />
        </div>

        {/* Customize panel */}
        {showCustomize && (
          <div
            className="rounded-xl border p-4 mb-4"
            style={{ borderColor: 'var(--border-light)', backgroundColor: 'rgba(45,138,138,0.02)' }}
          >
            <p className="text-xs font-medium mb-3" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
              Toggle cards visible on your dashboard
            </p>
            <div className="flex flex-wrap gap-2">
              {CARD_REGISTRY.map(card => (
                <button
                  key={card.id}
                  onClick={() => toggleCard(card.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    color: visibleCards.has(card.id) ? 'var(--teal)' : 'var(--slate)',
                    backgroundColor: visibleCards.has(card.id) ? 'rgba(45,138,138,0.08)' : 'transparent',
                    borderColor: visibleCards.has(card.id) ? 'var(--teal)' : 'var(--border-light)',
                    cursor: 'pointer',
                    opacity: visibleCards.has(card.id) ? 1 : 0.5,
                  }}
                >
                  {visibleCards.has(card.id) ? '✓' : '+'} {card.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex items-center gap-2.5 mb-4 flex-wrap">
          <Link
            to="/tasks?create=true"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ fontFamily: 'var(--font-sans)', color: 'white', backgroundColor: 'var(--teal)', textDecoration: 'none' }}
          >
            <Plus size={14} />
            New Task
          </Link>
          <Link
            to="/meetings"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors border hover:bg-black/5 dark:hover:bg-white/5"
            style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', borderColor: 'var(--border-light)', textDecoration: 'none' }}
          >
            <CalendarPlus size={14} />
            Schedule Meeting
          </Link>
          <Link
            to="/ideas?create=true"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors border hover:bg-black/5 dark:hover:bg-white/5"
            style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', borderColor: 'var(--border-light)', textDecoration: 'none' }}
          >
            <FolderPlus size={14} />
            Submit Idea
          </Link>
        </div>

        {/* Primary Cards — always visible */}
        <div className="bento-grid">
          {primaryCards.map(card => {
            const Card = card.component
            return <Card key={card.id} />
          })}
        </div>

        {/* Secondary Cards — behind "Show more" */}
        {secondaryCards.length > 0 && (
          <>
            {!showMore && (
              <button
                onClick={() => setShowMore(true)}
                className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium transition-colors border"
                style={{
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--slate)',
                  borderColor: 'var(--border-light)',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  opacity: 0.6,
                }}
              >
                <ChevronDown size={14} />
                Show {secondaryCards.length} more card{secondaryCards.length > 1 ? 's' : ''}
              </button>
            )}

            {showMore && (
              <>
                <div className="bento-grid mt-4">
                  {secondaryCards.map(card => {
                    const Card = card.component
                    return <Card key={card.id} />
                  })}
                </div>

                <button
                  onClick={() => setShowMore(false)}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--slate)',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    opacity: 0.5,
                  }}
                >
                  <ChevronUp size={14} />
                  Show less
                </button>
              </>
            )}
          </>
        )}

        {/* Empty state if all cards hidden */}
        {primaryCards.length === 0 && secondaryCards.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}>
              All cards are hidden. Click "Customize" to add cards back.
            </p>
          </div>
        )}
      </div>

      {/* Inline styles for bento grid + animations */}
      <style>{`
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          grid-auto-rows: minmax(200px, auto);
          gap: 1.25rem;
        }

        .bento-span-2 {
          grid-column: span 2;
        }

        .bento-span-2x2 {
          grid-column: span 2;
          grid-row: span 2;
        }

        .bento-span-1x2 {
          grid-row: span 2;
        }

        /* Tablet: 2 columns */
        @media (max-width: 1024px) {
          .bento-grid {
            grid-template-columns: repeat(2, 1fr);
            grid-auto-rows: minmax(180px, auto);
          }
          .bento-span-2x2 {
            grid-column: span 2;
            grid-row: span 2;
          }
          .bento-span-2 {
            grid-column: span 2;
          }
          .bento-span-1x2 {
            grid-row: span 2;
          }
        }

        /* Mobile: 1 column */
        @media (max-width: 640px) {
          .bento-grid {
            grid-template-columns: 1fr;
            grid-auto-rows: minmax(160px, auto);
            gap: 0.75rem;
          }
          .bento-span-2,
          .bento-span-2x2,
          .bento-span-1x2 {
            grid-column: span 1;
            grid-row: span 1;
          }
          .bento-card {
            padding: 1rem 1rem !important;
            border-radius: 12px !important;
          }
        }

        /* Dark mode card overrides */
        .dark .bento-card {
          background: #162535 !important;
          border-color: rgba(201, 168, 76, 0.12) !important;
        }

        .dark .bento-card:hover {
          background: #1e3048 !important;
        }

        /* Status pulse for header */
        @keyframes status-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(34, 197, 94, 0.4); }
          50% { opacity: 0.6; box-shadow: 0 0 4px rgba(34, 197, 94, 0.2); }
        }
      `}</style>
    </div>
  )
}
