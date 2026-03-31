import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Activity, BookOpen, FlaskConical, Users, ArrowRight } from 'lucide-react'
import BentoCard from './BentoCard'
import { usePublications, useProjects } from '../../hooks/useApiData'
import type { LucideIcon } from 'lucide-react'

interface FeedItem {
  icon: LucideIcon
  dotColor: string
  text: string
  detail: string
  time: string
  link?: string
}

function relativeTime(monthsAgo: number): string {
  if (monthsAgo <= 0) return 'This month'
  if (monthsAgo === 1) return '1 month ago'
  if (monthsAgo < 12) return `${monthsAgo} months ago`
  const years = Math.floor(monthsAgo / 12)
  return years === 1 ? '1 year ago' : `${years} years ago`
}

export default function ActivityFeedCard() {
  const { data: publications = [] } = usePublications()
  const { data: projects = [] } = useProjects()

  const items = useMemo<FeedItem[]>(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    const feed: FeedItem[] = []

    // Recent publications (by year — treat as mid-year)
    const recentPubs = publications
      .filter((p) => p.status === 'Published')
      .sort((a, b) => b.year - a.year)
      .slice(0, 4)

    recentPubs.forEach((pub) => {
      const monthsAgo = (currentYear - pub.year) * 12 + currentMonth - 6
      feed.push({
        icon: BookOpen,
        dotColor: '#c9a84c',
        text: pub.title.length > 70 ? pub.title.slice(0, 67) + '...' : pub.title,
        detail: pub.journal,
        time: relativeTime(Math.max(0, monthsAgo)),
        link: '/publications',
      })
    })

    // Papers in review
    const inReview = publications.filter((p) => p.status === 'In Review')
    if (inReview.length > 0) {
      feed.push({
        icon: FlaskConical,
        dotColor: '#2d8a8a',
        text: `${inReview.length} manuscript${inReview.length > 1 ? 's' : ''} under review`,
        detail: inReview.map((p) => p.journal).join(', '),
        time: 'Active',
        link: '/publications',
      })
    }

    // Active projects count
    const activeProjects = projects.filter((p) => p.status === 'Active')
    feed.push({
      icon: FlaskConical,
      dotColor: '#2d8a8a',
      text: `${activeProjects.length} research projects actively underway`,
      detail: 'CLIF consortium and MN-CCORE lab',
      time: 'Ongoing',
    })

    // Team growth
    feed.push({
      icon: Users,
      dotColor: '#faf8f3',
      text: 'CLIF Consortium expanding to 13+ sites nationwide',
      detail: 'Multi-center ICU data infrastructure',
      time: '2025',
    })

    return feed.slice(0, 8)
  }, [publications, projects])

  return (
    <BentoCard title="Recent Activity" subtitle="Lab updates" size="span-1x2" icon={Activity} drillDown>
      <div className="flex flex-col h-full">
        {/* Feed list */}
        <div
          className="flex-1 overflow-y-auto -mx-1 px-1"
          style={{
            maxHeight: '340px',
            scrollbarWidth: 'thin',
          }}
        >
          <div className="relative">
            {/* Vertical line */}
            <div
              style={{
                position: 'absolute',
                left: '7px',
                top: '12px',
                bottom: '12px',
                width: '1.5px',
                background: 'linear-gradient(to bottom, var(--gold), transparent)',
                opacity: 0.15,
              }}
            />

            {items.map((item, i) => {
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 py-2.5 relative group"
                  style={{
                    borderBottom: i < items.length - 1
                      ? '1px solid rgba(201, 168, 76, 0.06)'
                      : 'none',
                  }}
                >
                  {/* Dot */}
                  <div
                    className="flex-shrink-0 relative z-10"
                    style={{
                      width: '15px',
                      height: '15px',
                      borderRadius: '50%',
                      background: item.dotColor,
                      border: item.dotColor === '#faf8f3'
                        ? '1.5px solid rgba(201, 168, 76, 0.3)'
                        : '2px solid var(--cream)',
                      marginTop: '2px',
                      transition: 'transform 0.2s ease',
                    }}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="leading-snug"
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '12.5px',
                        color: 'var(--ink)',
                        margin: 0,
                      }}
                    >
                      {item.text}
                    </p>
                    <p
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '11px',
                        color: 'var(--slate)',
                        fontStyle: 'italic',
                        margin: '2px 0 0 0',
                        opacity: 0.7,
                      }}
                    >
                      {item.detail}
                    </p>
                  </div>

                  {/* Time */}
                  <span
                    className="flex-shrink-0"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9px',
                      color: 'var(--slate)',
                      opacity: 0.5,
                      whiteSpace: 'nowrap',
                      marginTop: '2px',
                    }}
                  >
                    {item.time}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* View all link */}
        <Link
          to="/publications"
          className="flex items-center gap-1 mt-3 pt-2"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--gold)',
            textDecoration: 'none',
            borderTop: '1px solid rgba(201, 168, 76, 0.1)',
            transition: 'opacity 0.2s ease',
          }}
        >
          View all <ArrowRight size={11} />
        </Link>
      </div>
    </BentoCard>
  )
}
