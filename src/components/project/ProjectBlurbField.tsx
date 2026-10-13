/**
 * ProjectBlurbField -- the project's one-line description (schema-v139).
 *
 * The only words about a project that members who are NOT on it can read (the
 * Projects page's Browse view). Starts empty: it is never copied from the
 * project's own description, which holds internal notes. Any member can set
 * it; the API and the table hold it to one line of 140 characters.
 */
import { useState } from 'react'
import { useProjectBlurb, useSetProjectBlurb } from '../../hooks/useProjectJoin'
import { useUndoToast } from '../UndoToast'
import { BLURB_MAX } from '../../lib/projectJoinApi'

export default function ProjectBlurbField({ projectRef }: { projectRef: string }) {
  const { data, isLoading } = useProjectBlurb(projectRef)
  const save = useSetProjectBlurb(projectRef)
  const { showSuccess, showError } = useUndoToast()
  const [draft, setDraft] = useState<string | null>(null)
  const current = data?.blurb ?? ''
  const value = draft ?? current
  const dirty = draft !== null && draft.trim() !== current

  const commit = () => {
    if (!dirty) { setDraft(null); return }
    save.mutate(value.trim() || null, {
      onSuccess: () => { setDraft(null); showSuccess('Description saved') },
      onError: (err) => showError(err instanceof Error ? err.message : 'Could not save the description'),
    })
  }

  if (isLoading) return null
  return (
    <div style={{ marginTop: 14 }} data-testid="project-blurb">
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
            flex: 1, minWidth: 200, fontSize: 13, padding: '6px 9px', borderRadius: 'var(--r-ctl)', border: 0, outline: 'none',
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
    </div>
  )
}
