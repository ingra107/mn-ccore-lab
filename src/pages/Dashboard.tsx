import { useScrollReveal } from '../hooks/useScrollReveal'
import PipelineCard from '../components/dashboard/PipelineCard'
import StatsCard from '../components/dashboard/StatsCard'
import UpcomingCard from '../components/dashboard/UpcomingCard'
import ActivityFeedCard from '../components/dashboard/ActivityFeedCard'
import GrantTimelineCard from '../components/dashboard/GrantTimelineCard'
import CLIFMiniCard from '../components/dashboard/CLIFMiniCard'
import TopicBubblesCard from '../components/dashboard/TopicBubblesCard'

export default function Dashboard() {
  const headerRef = useScrollReveal<HTMLDivElement>()

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        {/* Page Header */}
        <div ref={headerRef} className="fade-in-up" style={{ marginBottom: '1.5rem', paddingTop: '0.25rem' }}>
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
            Lab health at a glance — publications, grants, team activity, and research momentum.
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

        {/* Bento Grid */}
        <div className="bento-grid">
          {/* Row 1-2: Pipeline (2x2) | Stats (1x1) + Upcoming (1x1 below) */}
          <PipelineCard />
          <StatsCard />
          <UpcomingCard />

          {/* Row 2-3: Activity Feed (1x2, spans rows) */}
          <ActivityFeedCard />

          {/* Row 3: Grant Timeline (2x1) */}
          <GrantTimelineCard />

          {/* Row 4: CLIF (2x1) | Topics (1x1) */}
          <CLIFMiniCard />
          <TopicBubblesCard />
        </div>
      </div>

      {/* Inline styles for bento grid + animations */}
      <style>{`
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          grid-auto-rows: minmax(200px, auto);
          gap: 1rem;
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
