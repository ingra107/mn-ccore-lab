// NoNextStepCard -- active projects that have no open task (schema-v152 plan,
// divergence 3). Reads GET /api/projects/next-step-gaps; the server computes the
// list on every read, so a project leaves it the moment a task is added.
//
// The count is the hero number. Each row is the project's SHORT name (the
// endpoint returns the title only, so short_name comes from the projects list the
// page already loads) with an "Add next step" action that opens the existing
// CreateTaskModal on that project: no second form. At most 5 rows; the rest are
// named "and N more" and link to the projects view. Zero gaps hides the card.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CollapseChevron } from '../SectionCollapseToggle'
import { collapseToggleProps } from '../collapseToggleProps'
import CreateTaskModal from '../../tasks/CreateTaskModal'
import { PATHS } from '../../../constants/paths'
import { useNextStepGaps, useProjects } from '../../../hooks/useApiData'
import { useCreateTask } from '../../../hooks/useMutations'
import { useToast } from '../../../hooks/useToast'
import { projectShortLabel } from '../../../lib/displayNames'

const MAX_ROWS = 5

export function NoNextStepCard() {
  const [open, setOpen] = useState(true)
  const [addFor, setAddFor] = useState<string | null>(null)
  const gaps = useNextStepGaps()
  const projects = useProjects()
  const createTask = useCreateTask()
  const queryClient = useQueryClient()
  const { showSuccess } = useToast()

  const rows = gaps.data ?? []
  if (rows.length === 0) return null

  // short_name lives on the projects list, keyed by id or slug.
  const byRef = new Map<string, { short_name?: string; title?: string }>()
  for (const p of projects.data ?? []) {
    if (p.id) byRef.set(p.id, p)
    if (p.slug) byRef.set(p.slug, p)
  }
  const label = (g: (typeof rows)[number]) =>
    projectShortLabel({ ...(byRef.get(g.id) ?? (g.slug ? byRef.get(g.slug) : undefined)), title: g.title, slug: g.slug, id: g.id })

  const shown = rows.slice(0, MAX_ROWS)
  const more = rows.length - shown.length

  return (
    <section className="tk-panel" data-pick="no-next-step">
      <div {...collapseToggleProps(open, () => setOpen((o) => !o), 'No next step')} className="tk-ph tk-clk">
        <div className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>No next step</h3>
        </div>
      </div>
      {open && (
        <>
          <div className="tk-fm" data-testid="no-next-step-count">{rows.length}</div>
          {shown.map((g) => (
            <div key={g.id} className="tk-rli" data-testid={`no-next-step-${g.id}`} style={{ alignItems: 'center' }}>
              <Link className="tk-t" to={PATHS.project(g.slug ?? g.id)}>{label(g)}</Link>
              <button type="button" className="tk-more" style={{ marginLeft: 0 }} onClick={() => setAddFor(g.slug ?? g.id)}>
                Add next step
              </button>
            </div>
          ))}
          {more > 0 && (
            <div className="tk-rli">
              <Link className="tk-t" to={PATHS.projects} data-testid="no-next-step-more" style={{ color: 'var(--job-accent)' }}>
                and {more} more
              </Link>
            </div>
          )}
        </>
      )}
      <CreateTaskModal
        open={addFor !== null}
        onClose={() => setAddFor(null)}
        defaultProject={addFor ?? undefined}
        onCreate={(task) =>
          createTask.mutateAsync({ ...task, project_id: task.project_id ?? addFor ?? undefined }).then(() => {
            showSuccess('Next step added')
            return queryClient.invalidateQueries({ queryKey: ['next-step-gaps'] })
          })
        }
      />
    </section>
  )
}
