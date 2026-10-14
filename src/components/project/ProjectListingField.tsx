/**
 * ProjectListingField -- how this project appears in Browse (schema-v139).
 *
 * The one-line description is the only text about a project that members NOT
 * on it can read (the Projects page's Browse view). It starts empty: it is
 * never copied from the project's own description, which holds internal notes.
 * Any member can set it; the API and the table hold it to one line of 140
 * characters.
 *
 * The switch takes the project out of Browse entirely (Nick, 2026-10-13: "All
 * but Friends + a hide switch"). Only Nick or the project's PI sees it; the
 * API and the table refuse anyone else.
 */
import { useState } from 'react'
import { useProjectListing, useSetProjectListing } from '../../hooks/useProjectJoin'
import { useUndoToast } from '../UndoToast'
import { BLURB_MAX } from '../../lib/projectJoinApi'

export default function ProjectListingField({ projectRef }: { projectRef: string }) {
  const { data, isLoading } = useProjectListing(projectRef)
  const save = useSetProjectListing(projectRef)
  const { showSuccess, showError } = useUndoToast()
  const [draft, setDraft] = useState<string | null>(null)
  const current = data?.blurb ?? ''
  const value = draft ?? current
  const dirty = draft !== null && draft.trim() !== current
  const hidden = data?.hidden === true

  const commit = () => {
    if (!dirty) { setDraft(null); return }
    save.mutate({ blurb: value.trim() || null }, {
      onSuccess: () => { setDraft(null); showSuccess('Description saved') },
      onError: (err) => showError(err instanceof Error ? err.message : 'Could not save the description'),
    })
  }

  const toggleHidden = () => {
    save.mutate({ hidden: !hidden }, {
      onSuccess: (res) => showSuccess(res.data.hidden ? 'Hidden from Browse' : 'Shown in Browse'),
      onError: (err) => showError(err instanceof Error ? err.message : 'Could not change the Browse setting'),
    })
  }

  if (isLoading || !data) return null
  return (
    <div style={{ marginTop: 14 }} data-testid="project-listing">
      <label htmlFor={`blurb-${projectRef}`} style={{ display: 'block', fontSize: 12, color: 'var(--sk-t2)', marginBottom: 'var(--sp-xs)' }}>
        One-line description <span style={{ color: 'var(--sk-t3)' }}>· the whole lab sees this in Browse</span>
      </label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          id={`blurb-${projectRef}`}
          value={value}
          maxLength={BLURB_MAX}
          onChange={(e) => setDraft(e.target.value.replace(/[\r\n]+/g, ' '))}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null) }}
          placeholder="What this project is, in one line"
          style={{
            flex: 1, minWidth: 0, fontSize: 13, padding: '6px 9px', borderRadius: 'var(--r-ctl)', border: 0, outline: 'none',
            background: 'var(--sk-card)', color: 'var(--sk-t1)', boxShadow: 'inset 0 0 0 1px var(--sk-line2)',
          }}
        />
        {dirty && (
          <button type="button" className="tk-btn tk-sm tk-pri" onClick={commit} disabled={save.isPending}>
            Save
          </button>
        )}
        <span style={{ fontSize: 11, color: 'var(--sk-t3)', fontVariantNumeric: 'tabular-nums' }}>{value.length}/{BLURB_MAX}</span>
      </div>
      {data.can_hide && (
        <label
          data-testid="project-listing-hidden"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginTop: 10, fontSize: 12.5, color: 'var(--sk-t2)', cursor: 'pointer' }}
        >
          <input type="checkbox" checked={hidden} disabled={save.isPending} onChange={toggleHidden} />
          Hide from Browse
          <span style={{ color: 'var(--sk-t3)' }}>· members not on it will not see it or be able to ask to join</span>
        </label>
      )}
    </div>
  )
}
