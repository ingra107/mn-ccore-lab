import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Award, Users, ArrowRight } from 'lucide-react'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { usePublications } from '../hooks/useApiData'
import { ICON_PROPS } from '../lib/iconProps'

interface ActivityItem {
  icon: typeof BookOpen
  text: string
  detail: string
  link?: string
  date: string
}

export default function RecentActivity() {
  const { data: publications = [] } = usePublications()
  const ref = useScrollReveal<HTMLElement>()

  const activities: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = []

    // Recent publications (last 5 published papers by year)
    const recentPubs = publications
      .filter((p) => p.status === 'Published')
      .sort((a, b) => b.year - a.year)
      .slice(0, 4)

    recentPubs.forEach((pub) => {
      items.push({
        icon: BookOpen,
        text: pub.title.length > 80 ? pub.title.slice(0, 77) + '...' : pub.title,
        detail: pub.journal,
        link: '/publications',
        date: String(pub.year),
      })
    })

    // Papers in review
    const inReview = publications.filter((p) => p.status === 'In Review')
    if (inReview.length > 0) {
      items.push({
        icon: Award,
        text: `${inReview.length} paper${inReview.length > 1 ? 's' : ''} currently in review`,
        detail: inReview.map((p) => p.journal).join(', '),
        link: '/publications',
        date: 'Active',
      })
    }

    // Team growth
    items.push({
      icon: Users,
      text: 'CLIF Consortium expanding to 13+ academic medical centers',
      detail: 'Multi-center ICU data infrastructure',
      link: '/',
      date: '2025',
    })

    return items.slice(0, 5)
  }, [publications])

  return (
    <div className="section-cream">
      <section ref={ref} className="fade-in-up py-8 sm:py-12 content-container">
        <div className="flex items-center justify-between mb-6">
          <h2
            className="text-2xl sm:text-3xl"
            style={{
              fontWeight: 500,
              color: 'var(--ink)',
            }}
          >
            Recent Activity
          </h2>
          <Link
            to="/publications"
            className="text-xs flex items-center gap-1 transition-colors duration-200"
            style={{
              color: 'var(--gold)',
              textDecoration: 'none',
            }}
          >
            All publications <ArrowRight {...ICON_PROPS} size={12} />
          </Link>
        </div>

        <div className="space-y-1">
          {activities.map((item, i) => {
            const Icon = item.icon
            return (
              <div
                key={i}
                className="flex items-start gap-3 py-3 px-3 rounded-lg transition-colors duration-200"
                style={{
                  borderBottom:
                    i < activities.length - 1
                      ? '1px solid var(--gold-active)'
                      : 'none',
                }}
              >
                <Icon
                  size={16}
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: 'var(--gold)' }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm leading-snug"
                    style={{ color: 'var(--ink)' }}
                  >
                    {item.text}
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: 'var(--slate)', fontStyle: 'italic' }}
                  >
                    {item.detail}
                  </p>
                </div>
                <span
                  className="flex-shrink-0 text-xs"
                  style={{
                    color: 'var(--slate)',
                    opacity: 0.85,
                    fontSize: '10px',
                  }}
                >
                  {item.date}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
