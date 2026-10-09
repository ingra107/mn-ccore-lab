/**
 * MemberProjects -- the projects a team member is on (#145), for the Team
 * member page. The list is what the VIEWER may see: Casey looking at Nate's
 * page sees only the shared projects, so an empty list does not mean the
 * member has no projects. Signed-in portal pages only.
 */
import { Link } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import { Chip } from '../ui/Chip'
import { useMemberProjects } from '../../hooks/useProjectMembers'
import { ICON_PROPS } from '../../lib/iconProps'
import { PATHS } from '../../constants/paths'

export default function MemberProjects({ slug }: { slug: string }) {
  const { data: projects = [], isLoading, isError } = useMemberProjects(slug)
  if (isError || (!isLoading && projects.length === 0)) return null
  return (
    <section className="mb-8" id="member-projects" aria-labelledby="member-projects-h" data-testid="member-projects">
      <div className="flex items-center gap-3 mb-4">
        <FolderKanban {...ICON_PROPS} size={20} style={{ color: 'var(--teal)' }} aria-hidden="true" />
        <h2 id="member-projects-h" className="text-xl sm:text-2xl" style={{ fontWeight: 500, color: 'var(--ink)' }}>
          Projects
        </h2>
        {projects.length > 0 && (
          <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)' }}>{projects.length}</span>
        )}
      </div>
      {isLoading ? (
        <p style={{ fontSize: 'var(--value-size)', color: 'var(--slate)', margin: 0 }}>Loading projects...</p>
      ) : (
        <ul className="list-none p-0 m-0 flex flex-col gap-2">
          {projects.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <Link to={PATHS.project(p.slug ?? p.id)} style={{ color: 'var(--ink)', fontSize: 'var(--value-size)' }}>
                {p.title}
              </Link>
              {p.stage && <Chip color="var(--slate)" bordered>{p.stage.replace(/_/g, ' ')}</Chip>}
              {p.status && p.status !== 'active' && <Chip color="var(--slate)">{p.status.replace(/_/g, ' ')}</Chip>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
