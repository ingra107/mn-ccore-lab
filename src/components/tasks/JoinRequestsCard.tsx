// JoinRequestsCard -- "Asks to join": requests to join a project, for Nick and
// Nate only (schema-v139; Nick 2026-10-13: "Nate and I need to approve that").
//
// Either approver's first answer decides: the database adds the member,
// notifies the requester and closes Nick's Telegram card in the same write.
// If the other approver got there first the API answers 409 and the list
// refetches. Nick's Telegram question for the same request is filtered out of
// QuestionsCard, so a request shows here once.
//
// Look: the same warm gold attention card as QuestionsCard (Needs you), since
// this is a decision waiting on him. Renders nothing for anyone else or when
// nothing is pending.

import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useDecideJoinRequest, useJoinRequests } from '../../hooks/useProjectJoin'
import { useUndoToast } from '../UndoToast'
import { FaceDisc } from '../today/skin'
import { memberInitials } from '../../lib/projectMembersRules'
import type { JoinDecision, JoinRequestForApprover } from '../../lib/projectJoinApi'

export function JoinRequestsCard() {
  const { user } = useAuth()
  const { data = [] } = useJoinRequests(user.slug)
  const pending = data.filter((r) => r.status === 'pending')
  if (pending.length === 0) return null
  return (
    <div className="tk">
      <section className="tk-attn" aria-label="Asks to join a project" data-testid="join-requests-card">
        <div className="tk-attn-h">
          <span className="tk-attn-dot" aria-hidden="true" />
          Asks to join
          <span className="tk-cnt">{pending.length}</span>
        </div>
        {pending.map((r) => <JoinRequestRow key={r.id} req={r} />)}
      </section>
    </div>
  )
}

function firstName(name: string | null, fallback: string): string {
  return (name ?? fallback).trim().split(/\s+/)[0] || fallback
}

function JoinRequestRow({ req }: { req: JoinRequestForApprover }) {
  const decide = useDecideJoinRequest()
  const { showSuccess, showError } = useUndoToast()
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const who = req.requester_name ?? req.requester_slug
  // A project that left the directory (done, blocked, hidden, Friends,
  // deleted) can no longer be joined: the card offers Close only.
  const listed = req.listed === 1
  const project = req.project_name ?? ''

  const send = (decision: JoinDecision) => {
    decide.mutate({ id: req.id, decision, note: note.trim() || null }, {
      onSuccess: () => showSuccess(
        decision === 'approve' ? `${firstName(who, who)} joined ${project || 'the project'}`
          : decision === 'decline' ? `Declined ${firstName(who, who)}'s request`
            : `Closed ${firstName(who, who)}'s request`,
      ),
      onError: (err) => showError(err instanceof Error ? err.message : 'Could not record the decision'),
    })
  }

  return (
    <div className="tk-qrow" data-testid={`join-request-${req.id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minWidth: 0 }}>
        <FaceDisc label={who} initials={memberInitials(who)} photo={req.requester_photo ?? undefined} px={22} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500, color: 'var(--sk-t1)' }}>
            {listed
              ? <>{firstName(who, who)} asks to join <span style={{ fontWeight: 600 }}>{project}</span></>
              : <>{firstName(who, who)} asked to join a project that is no longer open to requests</>}
          </div>
          {(req.note || req.blurb) && (
            <div style={{ fontSize: 11.5, color: 'var(--sk-t3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {req.note ? `“${req.note}”` : req.blurb}
            </div>
          )}
          {req.director_note && (
            // An approver's Telegram 'Other': for Nick and Nate, never the requester.
            <div data-testid="join-director-note" style={{ fontSize: 11.5, color: 'var(--sk-t2)', marginTop: 2 }}>
              Note from {req.director_note_by === 'nate-mesfin' ? 'Nate' : 'Nick'}: {req.director_note}
            </div>
          )}
        </div>
      </div>
      {!listed ? (
        <div className="tk-ops">
          <button
            type="button"
            className="tk-btn tk-sm"
            data-testid="join-close"
            disabled={decide.isPending}
            onClick={() => send('close')}
            style={{ touchAction: 'manipulation' }}
          >
            Close request
          </button>
        </div>
      ) : (
      <div className="tk-ops">
        <button
          type="button"
          className="tk-btn tk-sm tk-pri"
          data-testid="join-approve"
          disabled={decide.isPending}
          onClick={() => send('approve')}
          style={{ touchAction: 'manipulation' }}
        >
          Approve
        </button>
        <button
          type="button"
          className="tk-btn tk-sm"
          data-testid="join-decline"
          disabled={decide.isPending}
          onClick={() => send('decline')}
          style={{ touchAction: 'manipulation' }}
        >
          Decline
        </button>
        {!noteOpen && (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            style={{ color: 'var(--sk-t3)', fontSize: 11.5, padding: '6px 4px', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            Add a note
          </button>
        )}
      </div>
      )}
      {listed && noteOpen && (
        <textarea
          data-testid="join-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          placeholder="A note for them (optional)"
          rows={2}
          className="tk-wfi"
          style={{ marginTop: 'var(--sp-sm)', resize: 'vertical', color: 'var(--sk-t1)', width: '100%' }}
        />
      )}
    </div>
  )
}
