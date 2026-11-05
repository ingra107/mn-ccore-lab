// NoNextStepCard -- active projects that have no open task (schema-v152 plan,
// divergence 3). Reads GET /api/projects/next-step-gaps; the server computes the
// list on every read, so a project leaves it the moment a task is added.
//
// The count is the hero number. Each row is the project's SHORT name (the
// endpoint returns the title only, so short_name comes from the projects list the
// page already loads) with an "Add next step" action that opens the existing
// CreateTaskModal on that project: no second form. Five rows, the rest one click
// away in place: the old "and N more" link opened the whole Projects list, which
// has no such filter (Rule 73, fable audit F26). Zero gaps hides the card.
//
// "Waiting" (#168) says the ball is with someone else: one click moves the project
// to the Waiting on card (status waiting_external leaves this list server-side).

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ShowMoreButton } from '../../ui/ShowMore'
import { CollapseChevron } from '../SectionCollapseToggle'
import { collapseToggleProps } from '../collapseToggleProps'
import CreateTaskModal from '../../tasks/CreateTaskModal'
import { PATHS } from '../../../constants/paths'
import { useNextStepGaps, useProjects } from '../../../hooks/useApiData'
import { useCreateTask, useUpdateProjectFields } from '../../../hooks/useMutations'
import { useToast } from '../../../hooks/useToast'
import { useShowMore } from '../../../hooks/useShowMore'
import { projectShortLabel } from '../../../lib/displayNames'

const MAX_ROWS = 5

export function NoNextStepCard() {
  const [open, setOpen] = useState(true)
  const [addFor, setAddFor] = useState<string | null>(null)
  const gaps = useNextStepGaps()
  const projects = useProjects()
  const createTask = useCreateTask()
  const updateProject = useUpdateProjectFields()
  const queryClient = useQueryClient()
  const { showSuccess, showUndo } = useToast()

  const rows = gaps.data ?? []
  const list = useShowMore(rows, MAX_ROWS)
  if (rows.length === 0) return null

  // short_name lives on the projects list, keyed by id or slug.
  const byRef = new Map<string, { short_name?: string; title?: string }>()
  for (const p of projects.data ?? []) {
    if (p.id) byRef.set(p.id, p)
    if (p.slug) byRef.set(p.slug, p)
  }
  const label = (g: (typeof rows)[number]) =>
    projectShortLabel({ ...(byRef.get(g.id) ?? (g.slug ? byRef.get(g.slug) : undefined)), title: g.title, slug: g.slug, id: g.id })

  const refreshGaps = () => { void queryClient.invalidateQueries({ queryKey: ['next-step-gaps'] }) }
  const setStatus = (slug: string, status: string) => updateProject.mutate({ slug, fields: { status } }, { onSettled: refreshGaps })

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
          {list.visible.map((g) => (
            <div key={g.id} className="tk-rli" data-testid={`no-next-step-${g.id}`} style={{ alignItems: 'center' }}>
              <Link className="tk-t" to={PATHS.project(g.slug ?? g.id)}>{label(g)}</Link>
              <button type="button" className="tk-more" style={{ marginLeft: 0 }} onClick={() => setAddFor(g.slug ?? g.id)}>
                Add next step
              </button>
              <button
                type="button"
                className="tk-more"
                style={{ marginLeft: 0 }}
                title="The ball is with someone else: move this to Waiting on"
                onClick={() => {
                  const slug = g.slug ?? g.id
                  setStatus(slug, 'waiting_external')
                  showUndo(`${label(g)} moved to Waiting on`, () => setStatus(slug, 'active'))
                }}
              >
                Waiting
              </button>
            </div>
          ))}
          <ShowMoreButton list={list} />
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
