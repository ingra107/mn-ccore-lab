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
import HoverCard from './HoverCard'
import type { HoverCardData } from './HoverCard'
import { useHoverCard } from '../hooks/useHoverCard'
import { usePublications, useActionItems, useProjects } from '../hooks/useApiData'
import { PATHS } from '../constants/paths'
import { ICON_PROPS } from '../lib/iconProps'

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
      <div style={{ height: '1px', background: 'linear-gradient(to right, var(--teal), transparent)', opacity: 0.85, marginBottom: '1.5rem' }} />

      <h2 style={{ fontWeight: 500, fontSize: 'clamp(1.25rem, 3vw, 1.75rem)', color: 'var(--ink)', marginBottom: '1rem' }}>
        {firstName}'s Dashboard
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Projects card */}
        <div className="card p-4" style={{ borderRadius: 'var(--radius-xl)' }}>
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical {...ICON_PROPS} size={14} style={{ color: 'var(--teal)' }} />
            <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              Projects
            </span>
          </div>
          {myProjects.length > 0 ? (
            <div className="flex flex-col gap-2">
              {myProjects.slice(0, 4).map((p) => (
                <MenteeProjectLink key={p.slug} project={p} />
              ))}
              {myProjects.length > 4 && (
                <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>
                  +{myProjects.length - 4} more
                </span>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75, margin: 0 }}>
              No projects assigned
            </p>
          )}
        </div>

        {/* Action Items card */}
        <div className="card p-4" style={{ borderRadius: 'var(--radius-xl)' }}>
          <div className="flex items-center gap-2 mb-3">
            <ListChecks {...ICON_PROPS} size={14} style={{ color: 'var(--gold)' }} />
            <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              Action Items
            </span>
            {myPending.length > 0 && (
              <span style={{ fontSize: '10px', color: 'var(--gold)', fontWeight: 600 }}>
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
                    <Circle {...ICON_PROPS} size={10} style={{ color: isOverdue ? 'var(--maroon)' : 'var(--slate)', opacity: 0.85, marginTop: '3px', flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: 'var(--ink)', lineHeight: 1.3 }}>
                      {item.description.length > 60 ? item.description.slice(0, 57) + '...' : item.description}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 {...ICON_PROPS} size={12} style={{ color: 'var(--teal)' }} />
              <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75 }}>
                All caught up ({myCompleted.length} done)
              </span>
            </div>
          )}
        </div>

        {/* Publications card */}
        <div className="card p-4" style={{ borderRadius: 'var(--radius-xl)' }}>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen {...ICON_PROPS} size={14} style={{ color: 'var(--gold)' }} />
            <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              Publications
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>
            {myPubs.length}
          </div>
          <p style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75, margin: 'var(--sp-xs) 0 0' }}>
            {myPubs.filter((p) => p.status === 'Published').length} published
            {myPubs.filter((p) => p.status !== 'Published').length > 0 &&
              ` · ${myPubs.filter((p) => p.status !== 'Published').length} in progress`}
          </p>
          {myPubs.length > 0 && (
            <Link to="/publications" className="inline-flex items-center gap-1 mt-2"
              style={{ fontSize: '10px', color: 'var(--gold)', textDecoration: 'none' }}>
              View all <ArrowRight {...ICON_PROPS} size={9} />
            </Link>
          )}
        </div>

        {/* Activity summary card */}
        <div className="card p-4" style={{ borderRadius: 'var(--radius-xl)' }}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp {...ICON_PROPS} size={14} style={{ color: 'var(--teal)' }} />
            <span style={{ fontSize: 'var(--label-size)', fontWeight: 'var(--label-weight)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
              Summary
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)' }}>Projects</span>
              <span style={{ fontSize: 'var(--value-size)', fontWeight: 600, color: 'var(--ink)' }}>{myProjects.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)' }}>Publications</span>
              <span style={{ fontSize: 'var(--value-size)', fontWeight: 600, color: 'var(--ink)' }}>{myPubs.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)' }}>Actions pending</span>
              <span style={{ fontSize: 'var(--value-size)', fontWeight: 600, color: myPending.length > 0 ? 'var(--gold)' : 'var(--teal)' }}>{myPending.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)' }}>Actions completed</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--teal)' }}>{myCompleted.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MenteeProjectLink({ project }: { project: { slug: string; title: string; stage?: string; status?: string; category?: string; description?: string; pi?: string; team?: string[] } }) {
  const hoverCard = useHoverCard()
  const projectData: HoverCardData = {
    type: 'project',
    title: project.title,
    stage: project.stage,
    status: project.status,
    category: project.category,
    description: project.description,
    pi: project.pi,
    team: project.team,
  }

  return (
    <Link
      ref={hoverCard.triggerRef as React.RefObject<HTMLAnchorElement>}
      to={PATHS.project(project.slug)}
      style={{ fontSize: '12px', color: 'var(--ink)', textDecoration: 'none', lineHeight: 1.3 }}
      className="hover:opacity-80"
      onMouseEnter={hoverCard.handlers.onMouseEnter}
      onMouseLeave={hoverCard.handlers.onMouseLeave}
    >
      <span style={{ fontSize: '10px', color: 'var(--gold)', marginRight: 'var(--sp-xs)' }}>
        {project.stage || project.status}
      </span>
      {project.title.length > 50 ? project.title.slice(0, 47) + '...' : project.title}
      <HoverCard
        data={projectData}
        isVisible={hoverCard.isVisible}
        position={hoverCard.position}
        cardRef={hoverCard.cardRef}
        cardHandlers={hoverCard.cardHandlers}
      />
    </Link>
  )
}
