import { Link } from 'react-router-dom'
import {
  FlaskConical,
  ListChecks,
  BookOpen,
  TrendingUp,
  CheckCircle2,
  Circle,
  ArrowRight,
} from 'lucide-react'
import { usePublications, useActionItems, useProjects } from '../hooks/useApiData'

interface Props {
  slug: string
  name: string
}

export default function MenteeDashboard({ slug, name }: Props) {
  const { data: publications = [] } = usePublications()
  const { data: actionItems = [] } = useActionItems({ assignee: slug })
  const { data: projects = [] } = useProjects()

  // Filter data for this person
  const myPubs = publications.filter((p) => p.authorSlugs?.includes(slug))
  const myPending = actionItems.filter((a) => !a.completed)
  const myCompleted = actionItems.filter((a) => a.completed)
  const myProjects = projects.filter((p) => p.pi === slug || p.team?.includes(slug))

  const firstName = name.split(' ')[0]

  return (
    <div style={{ marginTop: '2rem', marginBottom: '2rem' }}>
      <div style={{ height: '1px', background: 'linear-gradient(to right, var(--teal), transparent)', opacity: 0.3, marginBottom: '1.5rem' }} />

      <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 'clamp(1.25rem, 3vw, 1.75rem)', color: 'var(--ink)', marginBottom: '1rem' }}>
        {firstName}'s Dashboard
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Projects card */}
        <div className="card p-4" style={{ borderRadius: '12px' }}>
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical size={14} style={{ color: 'var(--teal)' }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65 }}>
              Projects
            </span>
          </div>
          {myProjects.length > 0 ? (
            <div className="flex flex-col gap-2">
              {myProjects.slice(0, 4).map((p) => (
                <Link key={p.slug} to={`/projects/${p.slug}`}
                  style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ink)', textDecoration: 'none', lineHeight: 1.3 }}
                  className="hover:opacity-80">
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: '9px', color: 'var(--gold)', marginRight: '4px' }}>
                    {p.stage || p.status}
                  </span>
                  {p.title.length > 50 ? p.title.slice(0, 47) + '...' : p.title}
                </Link>
              ))}
              {myProjects.length > 4 && (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>
                  +{myProjects.length - 4} more
                </span>
              )}
            </div>
          ) : (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--slate)', opacity: 0.4, margin: 0 }}>
              No projects assigned
            </p>
          )}
        </div>

        {/* Action Items card */}
        <div className="card p-4" style={{ borderRadius: '12px' }}>
          <div className="flex items-center gap-2 mb-3">
            <ListChecks size={14} style={{ color: 'var(--gold)' }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65 }}>
              Action Items
            </span>
            {myPending.length > 0 && (
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', color: 'var(--gold)', fontWeight: 600 }}>
                {myPending.length}
              </span>
            )}
          </div>
          {myPending.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {myPending.slice(0, 4).map((item) => {
                const isOverdue = item.due_date && new Date(item.due_date) < new Date()
                return (
                  <div key={item.id} className="flex items-start gap-1.5">
                    <Circle size={10} style={{ color: isOverdue ? 'var(--maroon)' : 'var(--slate)', opacity: 0.4, marginTop: '3px', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--ink)', lineHeight: 1.3 }}>
                      {item.description.length > 60 ? item.description.slice(0, 57) + '...' : item.description}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} style={{ color: 'var(--teal)' }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--slate)', opacity: 0.6 }}>
                All caught up ({myCompleted.length} done)
              </span>
            </div>
          )}
        </div>

        {/* Publications card */}
        <div className="card p-4" style={{ borderRadius: '12px' }}>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={14} style={{ color: 'var(--gold)' }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65 }}>
              Publications
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '28px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>
            {myPubs.length}
          </div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--slate)', opacity: 0.6, margin: '4px 0 0' }}>
            {myPubs.filter((p) => p.status === 'Published').length} published
            {myPubs.filter((p) => p.status !== 'Published').length > 0 &&
              ` · ${myPubs.filter((p) => p.status !== 'Published').length} in progress`}
          </p>
          {myPubs.length > 0 && (
            <Link to="/publications" className="inline-flex items-center gap-1 mt-2"
              style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', color: 'var(--gold)', textDecoration: 'none' }}>
              View all <ArrowRight size={9} />
            </Link>
          )}
        </div>

        {/* Activity summary card */}
        <div className="card p-4" style={{ borderRadius: '12px' }}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} style={{ color: 'var(--teal)' }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500, color: 'var(--slate)', opacity: 0.65 }}>
              Summary
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--slate)' }}>Projects</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{myProjects.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--slate)' }}>Publications</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{myPubs.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--slate)' }}>Actions pending</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: myPending.length > 0 ? 'var(--gold)' : 'var(--teal)' }}>{myPending.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--slate)' }}>Actions completed</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: 'var(--teal)' }}>{myCompleted.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
