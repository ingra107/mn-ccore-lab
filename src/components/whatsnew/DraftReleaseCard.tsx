// DraftReleaseCard — the pending What's new draft, PI only (#156).
//
// The deploy step opens it with the shipped commit subjects; a Claude session
// writes the title and blurbs; Nick reads them against what shipped, edits,
// then approves (the team sees it at once) or discards. Discard is two-step
// inside the card: the viewer never shows confirm().
import { useState } from 'react'
import { Button } from '../ui/Button'
import type { PulseRelease, ReleaseBlurb } from '../../../shared/pulse'
import { RELEASE_BLURBS_MAX, RELEASE_TITLE_MAX } from '../../../shared/pulse'
import { useApproveRelease, useDiscardRelease, useEditRelease } from '../../hooks/mutations/usePulseMutations'
import { ReleaseBody } from './WhatsNewTab'

export function DraftReleaseCard({ draft }: { draft: PulseRelease }) {
  const edit = useEditRelease()
  const approve = useApproveRelease()
  const discard = useDiscardRelease()
  const [editing, setEditing] = useState(false)
  const [armed, setArmed] = useState(false)
  const [showCommits, setShowCommits] = useState(false)
  const [title, setTitle] = useState(draft.title)
  const [blurbs, setBlurbs] = useState<ReleaseBlurb[]>(draft.blurbs.length ? draft.blurbs : [{ lead: '', text: '' }])
  const ready = draft.title.trim() !== '' && draft.blurbs.length > 0
  const busy = edit.isPending || approve.isPending || discard.isPending

  const setBlurb = (i: number, patch: Partial<ReleaseBlurb>) => setBlurbs((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const save = () => {
    const clean = blurbs.map((b) => ({ lead: b.lead.trim(), text: b.text.trim() })).filter((b) => b.lead && b.text)
    edit.mutate({ id: draft.id, title: title.trim(), blurbs: clean }, { onSuccess: () => setEditing(false) })
  }

  return (
    <section className="pulse-draft" data-testid="draft-release" aria-label="Release draft">
      <div className="pulse-draft-h">
        <span className="pulse-chip">Draft</span>
        <span className="pulse-date">Only you see this until you approve it</span>
      </div>
      {editing ? (
        <div className="pulse-col">
          <label className="pulse-eyebrow" htmlFor="release-title">Title</label>
          <input id="release-title" className="pulse-input" value={title} maxLength={RELEASE_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
          {blurbs.map((b, i) => (
            <div key={i} className="pulse-blurb-edit">
              <input id={`release-lead-${i}`} aria-label={`Blurb ${i + 1} lead`} className="pulse-input" placeholder="Bold lead, e.g. One collapse per meeting." value={b.lead} onChange={(e) => setBlurb(i, { lead: e.target.value })} />
              <input id={`release-text-${i}`} aria-label={`Blurb ${i + 1} text`} className="pulse-input" placeholder="What you can do now, in one sentence" value={b.text} onChange={(e) => setBlurb(i, { text: e.target.value })} />
            </div>
          ))}
          {blurbs.length < RELEASE_BLURBS_MAX && (
            <button type="button" className="pulse-link" onClick={() => setBlurbs((bs) => [...bs, { lead: '', text: '' }])}>Add a blurb</button>
          )}
          <div className="pulse-actions">
            <Button size="sm" variant="secondary" type="button" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" variant="primary" type="button" onClick={save} disabled={busy || !title.trim()}>Save</Button>
          </div>
        </div>
      ) : (
        <>
          {draft.title ? <div className="pulse-title">{draft.title}</div> : <p className="pulse-empty">Needs a title and blurbs before it can go out.</p>}
          {draft.blurbs.length > 0 && <ReleaseBody release={draft} />}
          <button type="button" className="pulse-link" aria-expanded={showCommits} onClick={() => setShowCommits((v) => !v)}>
            {showCommits ? 'Hide what shipped' : `What shipped (${draft.commits.length})`}
          </button>
          {showCommits && (
            <ul className="pulse-rows">
              {draft.commits.map((c) => <li key={c.sha}><span>{c.subject}</span></li>)}
            </ul>
          )}
          <div className="pulse-actions">
            {armed ? (
              <Button size="sm" variant="danger" type="button" onClick={() => discard.mutate(draft.id)} disabled={busy}>Discard draft</Button>
            ) : (
              <Button size="sm" variant="secondary" type="button" onClick={() => setArmed(true)} disabled={busy}>Discard</Button>
            )}
            <Button size="sm" variant="secondary" type="button" onClick={() => setEditing(true)} disabled={busy}>Edit</Button>
            <Button
              size="sm"
              variant="primary"
              type="button"
              onClick={() => approve.mutate({ id: draft.id, reviewed: { commitTo: draft.commitTo, title: draft.title, blurbs: draft.blurbs } })}
              disabled={busy || !ready}
              title={ready ? 'Publish to the lab' : 'Add a title and at least one blurb'}
            >Approve</Button>
          </div>
        </>
      )}
    </section>
  )
}
