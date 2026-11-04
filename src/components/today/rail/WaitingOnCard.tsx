// WaitingOnCard -- projects where the ball is with someone else (#168, Nick
// 2026-11-04: "many things like ASCI YPSA is an award so we are just 'waiting' to
// hear back ... we can have waiting on projects which won't show as 'missing next
// step' and the waiting on can be its own small section just like this and then
// there is an optional date ... if the date is filled in then it means it can be a
// check-in task").
//
// "Waiting" is the shared status projects.status = 'waiting_external', which
// NEXT_STEP_GAPS_SQL already leaves out, so no new field. The date is an open
// kind='checkin' task on the project, and check-ins do not count as next steps, so
// setting one cannot hide a real gap. Clearing the date removes that check-in.
// Sits under No next step and hides at zero.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CollapseChevron } from '../SectionCollapseToggle'
import { collapseToggleProps } from '../collapseToggleProps'
import InlineDatePicker from '../../InlineDatePicker'
import { PATHS } from '../../../constants/paths'
import { useAuth } from '../../../hooks/useAuth'
import { useProjects } from '../../../hooks/useApiData'
import { useBulkUpdateTasks, useCreateTask, useUpdateProjectFields, useUpdateTask } from '../../../hooks/useMutations'
import { useToast } from '../../../hooks/useToast'
import { projectShortLabel } from '../../../lib/displayNames'
import { isCheckin } from '../../../../shared/taskKinds'
import type { TaskRow } from '../../../lib/api'

const MAX_ROWS = 5

export function WaitingOnCard({ tasks }: { tasks: readonly TaskRow[] }) {
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const { user } = useAuth()
  const { data: projects } = useProjects()
  const updateProject = useUpdateProjectFields()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const bulk = useBulkUpdateTasks()
  const qc = useQueryClient()
  const { showUndo } = useToast()

  const waiting = (projects ?? []).filter((p) => p.status === 'waiting_external')
  if (waiting.length === 0) return null
  const shown = showAll ? waiting : waiting.slice(0, MAX_ROWS)
  const more = waiting.length - shown.length

  const setStatus = (slug: string, status: string) => updateProject.mutate(
    { slug, fields: { status } },
    { onSettled: () => { void qc.invalidateQueries({ queryKey: ['next-step-gaps'] }) } },
  )

  return (
    <section className="tk-panel" data-pick="waiting-on">
      <div {...collapseToggleProps(open, () => setOpen((o) => !o), 'Waiting on')} className="tk-ph tk-clk">
        <div className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>Waiting on</h3>
          <span className="tk-cnt" data-testid="waiting-count">{waiting.length}</span>
        </div>
      </div>
      {open && (
        <>
          {shown.map((p) => {
            const checkin = tasks.find((t) => isCheckin(t) && (t.project_id === p.slug || t.project_id === p.id))
            const label = projectShortLabel(p)
            const setDate = (date: string | null) => {
              if (checkin && date) updateTask.mutate({ id: checkin.id, fields: { due_date: date } })
              else if (checkin) bulk.mutate({ ids: [checkin.id], action: 'delete' })
              else if (date) createTask.mutate({ title: label, description: '', assignee: user?.slug ?? '', project_id: p.slug, kind: 'checkin', due_date: date })
            }
            return (
              <div key={p.slug} className="tk-rli" data-testid={`waiting-${p.slug}`} style={{ alignItems: 'center' }}>
                <Link className="tk-t" to={PATHS.project(p.slug)}>{label}</Link>
                <InlineDatePicker
                  value={checkin?.due_date?.slice(0, 10) ?? null}
                  onChange={setDate}
                  label={`Check-in date for ${label}`}
                  display={<span className="tk-d">{checkin?.due_date ? `Check in ${checkin.due_date.slice(5, 10).replace('-', '/')}` : 'Set check-in'}</span>}
                />
                <button
                  type="button"
                  className="tk-more"
                  style={{ marginLeft: 0 }}
                  data-testid={`waiting-done-${p.slug}`}
                  onClick={() => {
                    setStatus(p.slug, 'active')
                    showUndo(`${label} is active again`, () => setStatus(p.slug, 'waiting_external'))
                  }}
                >
                  Back to active
                </button>
              </div>
            )
          })}
          {more > 0 && (
            <div className="tk-rli">
              <button type="button" className="tk-t tk-more" style={{ marginLeft: 0, textAlign: 'left', color: 'var(--job-accent)' }} onClick={() => setShowAll(true)}>
                and {more} more
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
