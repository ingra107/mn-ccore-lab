/**
 * MemberProjects -- the projects a team member is on (#145), for the Team
 * member page. The list is what the VIEWER may see: Casey looking at Nate's
 * page sees only the shared projects, so an empty list does not mean the
 * member has no projects. Signed-in members only (portal or public route); a
 * signed-out visitor gets the static list instead (MemberPage).
 */
import { Link } from 'react-router-dom'
import { Chip } from '../ui/Chip'
import { useMemberProjects } from '../../hooks/useProjectMembers'
import MemberHead from '../MemberHead'
import { PATHS } from '../../constants/paths'
import { compactStageLabel } from '../../lib/projectStage'

export default function MemberProjects({ slug }: { slug: string }) {
  const { data: projects = [], isLoading, isError } = useMemberProjects(slug)
  if (isError || (!isLoading && projects.length === 0)) return null
  return (
    <section className="mb-8" id="member-projects" aria-labelledby="member-projects-h" data-testid="member-projects">
      <MemberHead id="member-projects-h" title="Projects" count={projects.length > 0 ? projects.length : undefined} />
      {isLoading ? (
        <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', margin: 0 }}>Loading projects...</p>
      ) : (
        <ul className="list-none p-0 m-0 flex flex-col gap-2">
          {projects.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <Link to={PATHS.project(p.slug ?? p.id)} className="hit-area" style={{ color: 'var(--ink)', fontSize: 'var(--value-size)' }}>
                {p.title}
              </Link>
              {compactStageLabel(p) && <Chip color="var(--slate)" bordered>{compactStageLabel(p)}</Chip>}
              {p.status && p.status !== 'active' && <Chip color="var(--slate)">{p.status.replace(/_/g, ' ')}</Chip>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
