// AnnouncementComposer — Nick posts a lab announcement from the pulse (#156).
// One plain-text field, 280 characters. A new announcement lights everyone's
// pill gold until they open it.
import { useState } from 'react'
import { Button } from '../ui/Button'
import { ANNOUNCEMENT_MAX } from '../../../shared/pulse'
import { usePostAnnouncement } from '../../hooks/mutations/usePulseMutations'

export function AnnouncementComposer() {
  const post = usePostAnnouncement()
  const [body, setBody] = useState('')
  const text = body.trim()
  const over = body.length > ANNOUNCEMENT_MAX
  return (
    <form
      className="pulse-col"
      data-testid="announcement-composer"
      onSubmit={(e) => { e.preventDefault(); if (text && !over) post.mutate(text, { onSuccess: () => setBody('') }) }}
    >
      <label className="pulse-eyebrow" htmlFor="announcement-body">Post an announcement</label>
      <textarea
        id="announcement-body"
        className="pulse-input"
        rows={2}
        value={body}
        placeholder="e.g. Lab retreat moved to Nov 14, Mayo 3-100"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="pulse-actions">
        <span className={`pulse-date${over ? ' pulse-over' : ''}`}>{body.length}/{ANNOUNCEMENT_MAX}</span>
        <Button size="sm" variant="primary" type="submit" disabled={!text || over || post.isPending}>Post</Button>
      </div>
    </form>
  )
}
