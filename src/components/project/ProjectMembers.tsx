/**
 * ProjectMembers -- who is on this project (#145).
 *
 * Projects work like Slack channels: you see a project only if you are a
 * member. This panel lists the members, lets any member add a teammate, and
 * shows a remove button only where the API would allow it (the member
 * themself, or a PI). The server re-checks every call.
 *
 * Removing yourself can take the project away from you. The API then answers
 * with an empty list; we leave the project page for the Projects list instead
 * of showing a page that would 404 on the next refetch.
 */
import { useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, X } from 'lucide-react'
import Avatar from '../Avatar'
import GhostSelect, { type GhostSelectOption } from '../ui/GhostSelect'
import { LABEL_STYLE, LABEL_ICON_COLOR } from '../ui/labelStyle'
import { useUndoToast } from '../UndoToast'
import { useAuth } from '../../hooks/useAuth'
import { useTeam } from '../../hooks/useApiData'
import { useAddProjectMember, useProjectMembers, useRemoveProjectMember } from '../../hooks/useProjectMembers'
import { ICON_PROPS } from '../../lib/iconProps'
import { PATHS } from '../../constants/paths'
import {
  addableMembers,
  canRemoveMember,
  memberInitials,
  memberLabel,
  removedSelfOutOfProject,
} from '../../lib/projectMembersRules'

interface ProjectMembersProps {
  /** Project slug (or id) the members routes take. */
  projectRef: string
  projectTitle: string
}

export default function ProjectMembers({ projectRef, projectTitle }: ProjectMembersProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showSuccess, showError } = useUndoToast()
  const { data: members = [], isLoading, isError } = useProjectMembers(projectRef)
  const { data: team = [] } = useTeam()
  const headingRef = useRef<HTMLSpanElement>(null)
  const addMutation = useAddProjectMember(projectRef)
  const removeMutation = useRemoveProjectMember(projectRef, user.slug)

  const pickerOptions = useMemo<GhostSelectOption[]>(
    () =>
      addableMembers(team, members).map((t) => ({
        value: t.slug as string,
        label: memberLabel({ slug: t.slug as string, name: t.name, preferred_name: null }),
      })),
    [team, members],
  )

  const onAdd = (slug: string) => {
    addMutation.mutate(slug, {
      onSuccess: (res) => {
        if (res.added) showSuccess(`Added ${memberLabel({ slug, name: null, preferred_name: null })} to ${projectTitle}`)
      },
      onError: (err) => showError(err instanceof Error ? err.message : 'Could not add the member'),
    })
  }

  const onRemove = (slug: string, label: string) => {
    const self = slug === user.slug
    const ask = self
      ? `Leave "${projectTitle}"? You will no longer see it unless someone adds you back.`
      : `Remove ${label} from "${projectTitle}"? They will no longer see it.`
    if (!window.confirm(ask)) return
    removeMutation.mutate(slug, {
      onSuccess: (res) => {
        if (removedSelfOutOfProject(res, slug, user.slug)) {
          showSuccess(`You left ${projectTitle}`)
          navigate(PATHS.projects, { replace: true })
        } else if (res.removed) {
          showSuccess(`Removed ${label} from ${projectTitle}`)
          // The chip that held focus is gone: park focus on the panel heading.
          headingRef.current?.focus()
        }
      },
      onError: (err) => showError(err instanceof Error ? err.message : 'Could not remove the member'),
    })
  }

  return (
    <section aria-label="Project members" data-testid="project-members">
      <div className="flex items-center gap-2 mb-2">
        <Users {...ICON_PROPS} size={13} style={{ color: LABEL_ICON_COLOR }} aria-hidden="true" />
        <span ref={headingRef} tabIndex={-1} style={{ ...LABEL_STYLE, outline: 'none' }}>Members</span>
        {members.length > 0 && (
          <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.85 }}>{members.length}</span>
        )}
      </div>

      {isError ? (
        <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', margin: 0 }}>Could not load members.</p>
      ) : isLoading ? (
        <p style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', margin: 0 }}>Loading members...</p>
      ) : (
        <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
          {members.map((m) => {
            const label = memberLabel(m)
            const self = m.slug === user.slug
            return (
              <li
                key={m.slug}
                data-testid={`member-chip-${m.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1"
                style={{ border: '1px solid var(--border-subtle)', fontSize: 'var(--value-size)', color: 'var(--ink)' }}
              >
                <Avatar name={label} initials={memberInitials(label)} photoUrl={m.photo_url ?? undefined} slug={m.slug} size="tight" variant="ice" />
                <span>{label}</span>
                {canRemoveMember(user, m.slug) && (
                  <button
                    type="button"
                    onClick={() => onRemove(m.slug, label)}
                    disabled={removeMutation.isPending}
                    aria-label={self ? `Leave ${projectTitle}` : `Remove ${label} from ${projectTitle}`}
                    title={self ? 'Leave this project' : `Remove ${label}`}
                    className="inline-flex items-center justify-center"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', minWidth: 24, minHeight: 24, padding: 0 }}
                  >
                    <X {...ICON_PROPS} size={12} aria-hidden="true" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!isError && !isLoading && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          <GhostSelect
            aria-label={`Add a member to ${projectTitle}`}
            value=""
            triggerLabel="+ Add a member"
            triggerColor="var(--teal)"
            searchable
            maxWidth={220}
            options={pickerOptions}
            onChange={onAdd}
          />
        </div>
      )}
    </section>
  )
}
