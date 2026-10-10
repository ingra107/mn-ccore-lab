// MeetingProjectsSection -- the Projects row on a meeting page (schema-v122).
//
// Nick, 2026-10-09: "all of the discussed projects would be kind of faded
// pills ... then I could click it to also give access to the meeting. And
// then there should be a way for me to add a project that was discussed but
// didn't appear on that list. And then when I do click one of those projects
// to belong to the meeting, it would increase the contrast and make it
// normal." It sits on the meeting page where he reviews assigned tasks.
//
//   - DISCUSSED (meetings.tags, the PB debrief's list): a faded pill.
//   - GRANTED (meeting_project_grants): a normal pill; that project's members
//     can see the meeting.
//   - Owner or Nick (the server's can_manage_access): clicking a project pill
//     grants it, clicking again revokes. Everyone else sees the pills only.
//   - "+ add project": adds a project to the DISCUSSED list (a faded pill),
//     which can then be clicked to grant. Clicking a listed project in the
//     picker again takes it off the discussed list (a grant stays: it lives
//     in its own table).
// A tag that names no project the viewer can see (a topic word) is a faded
// pill with no toggle. Short names everywhere, never a "#".

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { PATHS } from '../../constants/paths'
import { grantedProjectList, meetingProjectPills, meetingTagList, projectShortLabel, type ProjectPill } from '../../lib/projectMeetings'
import { useGrantMeetingProject, useRevokeMeetingProject, type useUpdateMeetingMeta } from '../../hooks/mutations/useMeetingMutations'
import { useToast } from '../../hooks/useToast'

export interface MeetingProjectsSectionProps {
  meeting: { id: string; tags: string | null; granted_projects?: string | null; can_manage_access?: boolean }
  /** Fallback "discussed" list when the meeting has no tags yet: the action items' projects. */
  derivedTags?: string[]
  allProjects: { id: string; slug: string; title: string; short_name?: string | null }[]
  updateMeta: ReturnType<typeof useUpdateMeetingMeta>
}

const PILL_BASE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 'var(--label-size)', padding: '2px 9px', borderRadius: 'var(--radius-lg)',
  textDecoration: 'none', fontWeight: 'var(--label-weight)' as React.CSSProperties['fontWeight'],
  fontFamily: 'inherit', lineHeight: 1.5,
}

function pillStyle(p: ProjectPill, clickable: boolean): React.CSSProperties {
  return p.granted
    // Granted: normal contrast, the house teal pill.
    ? { ...PILL_BASE, background: 'var(--teal-active)', color: 'var(--teal)', borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', cursor: clickable ? 'pointer' : undefined }
    // Discussed only: faded. Muted text, no fill, a dashed hairline.
    // Dimmer than the row label (--sk-t3) and a regular weight: --muted at the
    // label weight (600) read brighter and bolder than the label beside it.
    : { ...PILL_BASE, background: 'none', color: 'var(--sk-t3)', fontWeight: 400, borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--border-subtle)', cursor: clickable ? 'pointer' : undefined }
}

export default function MeetingProjectsSection({ meeting, derivedTags = [], allProjects, updateMeta }: MeetingProjectsSectionProps) {
  const [picking, setPicking] = useState(false)
  const grant = useGrantMeetingProject(meeting.id)
  const revoke = useRevokeMeetingProject(meeting.id)
  const { showError } = useToast()
  const storedTags = meetingTagList(meeting.tags)
  const discussed = storedTags.length > 0 ? storedTags : derivedTags
  const granted = grantedProjectList(meeting.granted_projects)
  const pills = meetingProjectPills(discussed, granted, allProjects)
  const canManage = meeting.can_manage_access === true
  const busy = grant.isPending || revoke.isPending

  if (pills.length === 0 && !picking && !canManage) return null

  const toggle = (p: ProjectPill) => {
    if (!p.projectId || busy) return
    const fail = (err: unknown) => showError(`Could not change access: ${err instanceof Error ? err.message : String(err)}`)
    if (p.granted) revoke.mutate(p.projectId, { onError: fail })
    else grant.mutate(p.projectId, { onError: fail })
  }

  const toggleDiscussed = (slug: string) => {
    const next = storedTags.includes(slug) ? storedTags.filter((t) => t !== slug) : [...(storedTags.length ? storedTags : discussed), slug]
    updateMeta.mutate({ tags: next })
  }

  return (
    <div className="mt-4" data-testid="meeting-projects">
      <div className="flex items-center gap-2 flex-wrap">
        <span style={{ fontSize: '12px', color: 'var(--sk-t3)', fontWeight: 500 }}>
          Projects
        </span>
        {pills.map((p) => {
          const clickable = canManage && !!p.projectId
          const title = p.granted
            ? `${p.label}: its members can see this meeting${clickable ? '. Click to take access away.' : ''}`
            : `${p.label}: discussed${clickable ? '. Click to give its members access.' : ''}`
          if (clickable) {
            return (
              <button
                key={p.key}
                type="button"
                data-pill={p.granted ? 'granted' : 'discussed'}
                aria-pressed={p.granted}
                disabled={busy}
                onClick={() => toggle(p)}
                title={title}
                style={pillStyle(p, true)}
              >
                {p.granted && <Check {...ICON_PROPS} size={10} aria-hidden />}
                {p.label}
              </button>
            )
          }
          if (p.granted && p.slug) {
            return (
              <Link key={p.key} to={PATHS.project(p.slug)} data-pill="granted" title={title} style={pillStyle(p, false)}>
                {p.label}
              </Link>
            )
          }
          return <span key={p.key} data-pill={p.granted ? 'granted' : 'discussed'} title={title} style={pillStyle(p, false)}>{p.label}</span>
        })}
        <button
          type="button"
          onClick={() => setPicking(!picking)}
          aria-expanded={picking}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--teal)', display: 'inline-flex', alignItems: 'center', gap: 2, fontFamily: 'inherit' }}
        >
          {picking ? 'Done' : <><Plus {...ICON_PROPS} size={11} aria-hidden />add project</>}
        </button>
      </div>
      {canManage && pills.some((p) => p.projectId) && (
        <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '4px 0 0' }}>
          Faded = discussed. Click one to give that project's members access to this meeting.
        </p>
      )}
      {picking && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--ice)', border: '1px solid var(--border-subtle)' }}>
          {allProjects.map((project) => {
            const present = discussed.includes(project.slug) || discussed.includes(project.id)
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => toggleDiscussed(project.slug)}
                aria-pressed={present}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] transition-colors text-left"
                style={{
                  background: present ? 'var(--teal-active)' : 'none',
                  border: `1px solid ${present ? 'var(--teal)' : 'var(--border-subtle)'}`,
                  color: present ? 'var(--teal)' : 'var(--slate)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectShortLabel(project)}</span>
                {present && <Check {...ICON_PROPS} size={10} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
