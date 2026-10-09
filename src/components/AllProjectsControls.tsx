// The site admin's "Show all projects (admin)" switch and its banner (#145).
//
// The switch draws only when /api/auth/me said canShowAllProjects (Nick). It is
// off on every page load, since the state lives in memory (lib/allProjects.ts).
// While it is on, every API request carries X-Hub-All-Projects and the banner
// says the view is unfiltered. Flipping it refetches everything, because every
// cached list was fetched under the other rule.
import { useQueryClient } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { setAllProjectsOn, useAllProjectsOn } from '../lib/allProjects'
import { ICON_PROPS } from '../lib/iconProps'

export function AllProjectsSwitch() {
  const { user } = useAuth()
  const on = useAllProjectsOn()
  const queryClient = useQueryClient()
  if (!user.canShowAllProjects) return null
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        setAllProjectsOn(!on)
        void queryClient.invalidateQueries()
      }}
      data-testid="all-projects-switch"
      title="Admin only. Lists every project, including ones you are not a member of. Off again on reload."
      className="inline-flex items-center gap-1.5 rounded-md px-2.5"
      style={{
        minHeight: 32,
        fontSize: 'var(--label-size)',
        fontWeight: on ? 600 : 400,
        color: on ? 'var(--maroon)' : 'var(--slate)',
        background: 'transparent',
        border: `1px solid ${on ? 'var(--maroon)' : 'var(--border-subtle)'}`,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <Eye {...ICON_PROPS} size={13} aria-hidden="true" />
      Show all projects (admin)
    </button>
  )
}

export function AllProjectsBanner() {
  const on = useAllProjectsOn()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  if (!on || !user.canShowAllProjects) return null
  return (
    <div
      role="status"
      data-testid="all-projects-banner"
      className="flex flex-wrap items-center gap-2 rounded-md px-3 py-2 mb-3"
      style={{
        fontSize: 'var(--value-size)',
        color: 'var(--ink)',
        border: '1px solid var(--maroon)',
        background: 'color-mix(in srgb, var(--maroon) 8%, transparent)',
      }}
    >
      <Eye {...ICON_PROPS} size={14} style={{ color: 'var(--maroon)' }} aria-hidden="true" />
      <span>
        Admin view: this list is unfiltered. It shows every project, including ones you are not a member of.
      </span>
      <button
        type="button"
        onClick={() => {
          setAllProjectsOn(false)
          void queryClient.invalidateQueries()
        }}
        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: 'var(--label-size)', minHeight: 32 }}
      >
        Turn off
      </button>
    </div>
  )
}
