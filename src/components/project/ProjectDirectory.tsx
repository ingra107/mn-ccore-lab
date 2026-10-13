/**
 * ProjectDirectory -- the Projects page's "Browse" view (schema-v139).
 *
 * Nick, 2026-10-13: "kind of like slack where it's a channel so they have some
 * visibility to those channels". Every listed project, one sleek row each:
 * its name, its one-line description and its PI. That is all a member who is
 * not on a project may see (the API returns nothing else). The action slot is
 * always in the same place: Open for a project you are on, Request to join
 * otherwise, Requested while an ask is pending, and the decline note with Ask
 * again after a decline. Nick or Nate approves from Today or Telegram.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { PATHS } from '../../constants/paths'
import { FaceDisc } from '../today/skin'
import { useTeam } from '../../hooks/useApiData'
import { useProjectDirectory, useRequestToJoin } from '../../hooks/useProjectJoin'
import { useUndoToast } from '../UndoToast'
import { memberInitials } from '../../lib/projectMembersRules'
import { ICON_PROPS } from '../../lib/iconProps'
import type { DirectoryEntry } from '../../lib/projectJoinApi'

export default function ProjectDirectory() {
  const { data: entries = [], isLoading, isError } = useProjectDirectory()
  const { data: team = [] } = useTeam()
  const [q, setQ] = useState('')
  const photoBySlug = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of team) if (t.slug && t.photoUrl) m.set(t.slug, t.photoUrl)
    return m
  }, [team])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter((e) => `${e.name} ${e.blurb ?? ''} ${e.pi_name ?? ''}`.toLowerCase().includes(needle))
  }, [entries, q])

  return (
    <div className="tk" data-testid="project-directory">
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--sk-t2)', maxWidth: 640 }}>
        Every active lab project. Ask to join one and Nick or Nate will add you.
      </p>
      <label className="pd-find">
        <Search {...ICON_PROPS} size={14} aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a project"
          aria-label="Find a project"
        />
      </label>

      {isError ? (
        <p className="pd-empty">Could not load the project list.</p>
      ) : isLoading ? (
        <p className="pd-empty">Loading projects...</p>
      ) : shown.length === 0 ? (
        <p className="pd-empty">{q ? 'No project matches.' : 'No projects are listed yet.'}</p>
      ) : (
        <ul className="pd-list">
          {shown.map((e) => <DirectoryRow key={e.project_id} entry={e} photo={e.pi_slug ? photoBySlug.get(e.pi_slug) : undefined} />)}
        </ul>
      )}

      <style>{`
        .pd-find{display:flex;align-items:center;gap:8px;max-width:360px;margin:0 0 14px;padding:7px 10px;border-radius:var(--r-ctl);background:var(--sk-card);box-shadow:inset 0 0 0 1px var(--sk-line2);color:var(--sk-t3)}
        .pd-find:focus-within{box-shadow:inset 0 0 0 1.5px var(--job-accent)}
        .pd-find input{all:unset;flex:1;min-width:0;font-size:13px;color:var(--sk-t1)}
        .pd-empty{font-size:12.5px;color:var(--sk-t3);margin:8px 0}
        .pd-list{list-style:none;margin:0;padding:0}
        .pd-row{display:grid;grid-template-columns:minmax(0,1fr) 150px 150px;align-items:center;gap:6px 16px;padding:10px 10px;border-radius:var(--r-ctl)}
        .pd-row+.pd-row{border-top:1px solid var(--sk-line)}
        .pd-row:hover{background:var(--sk-card)}
        .pd-name{font-size:13.5px;font-weight:500;color:var(--sk-t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .pd-blurb{font-size:12px;color:var(--sk-t2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .pd-blurb.pd-none{color:var(--sk-t3)}
        .pd-pi{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--sk-t3);min-width:0}
        .pd-pi span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .pd-act{display:flex;justify-content:flex-end;align-items:center;gap:6px}
        .pd-state{font-size:12px;color:var(--sk-t3)}
        .pd-ask{grid-column:1/-1;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
        .pd-ask input{flex:1;min-width:180px;font-size:12.5px;padding:6px 9px;border-radius:var(--r-ctl);background:var(--sk-card);box-shadow:inset 0 0 0 1px var(--sk-line2);color:var(--sk-t1);border:0;outline:none}
        .pd-ask input:focus{box-shadow:inset 0 0 0 1.5px var(--job-accent)}
        .pd-note{grid-column:1/-1;font-size:11.5px;color:var(--sk-t3)}
        @media (max-width:640px){
          .pd-row{grid-template-columns:minmax(0,1fr) auto;padding:10px 4px}
          .pd-main{grid-column:1/-1}
          .pd-blurb{white-space:normal}
        }
      `}</style>
    </div>
  )
}

function firstName(name: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

function DirectoryRow({ entry, photo }: { entry: DirectoryEntry; photo?: string }) {
  const ask = useRequestToJoin()
  const { showSuccess, showError } = useUndoToast()
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')

  const send = () => {
    ask.mutate({ projectId: entry.project_id, note: note.trim() || null }, {
      onSuccess: () => {
        setAsking(false)
        setNote('')
        showSuccess(`Asked to join ${entry.name}. Nick or Nate will answer.`)
      },
      onError: (err) => showError(err instanceof Error ? err.message : 'Could not send the request'),
    })
  }

  return (
    <li className="pd-row" data-testid={`directory-row-${entry.project_id}`}>
      <div className="pd-main" style={{ minWidth: 0 }}>
        <div className="pd-name" title={entry.name}>{entry.name}</div>
        <div className={`pd-blurb${entry.blurb ? '' : ' pd-none'}`}>{entry.blurb ?? 'No description yet'}</div>
      </div>
      <div className="pd-pi">
        {entry.pi_name ? (
          <>
            <FaceDisc label={entry.pi_name} initials={memberInitials(entry.pi_name)} photo={photo} px={20} decorative />
            <span title={`PI: ${entry.pi_name}`}>{firstName(entry.pi_name)}</span>
          </>
        ) : null}
      </div>
      <div className="pd-act">
        {entry.state === 'member' ? (
          <Link to={PATHS.project(entry.project_id)} className="tk-btn tk-sm">Open</Link>
        ) : entry.state === 'pending' ? (
          <span className="pd-state" data-testid="directory-requested">Requested</span>
        ) : !asking ? (
          <button
            type="button"
            className="tk-btn tk-sm tk-pri"
            data-testid="directory-request"
            onClick={() => setAsking(true)}
            style={{ touchAction: 'manipulation' }}
          >
            {entry.state === 'declined' ? 'Ask again' : 'Request to join'}
          </button>
        ) : null}
      </div>
      {entry.state === 'declined' && !asking && (
        <div className="pd-note">Declined{entry.decided_note ? `: “${entry.decided_note}”` : ''}</div>
      )}
      {asking && (
        <div className="pd-ask">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            placeholder="Why you want to join (optional)"
            aria-label={`Note for your request to join ${entry.name}`}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
            autoFocus
          />
          <button type="button" className="tk-btn tk-sm tk-pri" data-testid="directory-send" disabled={ask.isPending} onClick={send}>
            Send request
          </button>
          <button type="button" className="tk-btn tk-sm" onClick={() => { setAsking(false); setNote('') }}>
            Cancel
          </button>
        </div>
      )}
    </li>
  )
}
