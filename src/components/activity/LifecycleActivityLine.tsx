// LifecycleActivityLine — quiet "system chrome" for lifecycle rows (kind
// 'system' | 'completion'). NOT a message: one small italic muted line with a
// typed event glyph, the actor, and a timestamp. Created shows an absolute local
// datetime inline; all others show relative time; every time hovers to the exact
// viewer-local date+time (Nick 2026-07-09). Consumed by the ONE shared row
// renderer (ActivityEntryItem), so both feeds stay identical.
//
// Design ref: docs/superpowers/specs/2026-07-09-activity-log-provenance-design.md
import { getPersonInfo } from '../../data/team'
import { formatLocal } from '../../lib/time'
import { formatRelativeTime } from '../../lib/dateUtils'
import type { ActivityEntryItemRow } from './activityRender'

// Typed event glyph (Nick's pick over a uniform dot). Derived, never stored.
const GLYPH: Record<string, string> = { created: '＋', completed: '✓', reopened: '↻' }

/** Read the lifecycle event name from metadata_json; fall back to kind. */
function eventOf(entry: ActivityEntryItemRow): string {
  try {
    const md = entry.metadata_json ? JSON.parse(entry.metadata_json) : null
    if (md && typeof md.event === 'string') return md.event
  } catch {
    /* ignore malformed metadata */
  }
  return entry.kind === 'completion' ? 'completed' : 'changed'
}

export function LifecycleActivityLine({ entry }: { entry: ActivityEntryItemRow }) {
  const ev = eventOf(entry)
  const glyph = GLYPH[ev] ?? '⇄'
  const glyphColor =
    ev === 'created' ? 'var(--gold)' : ev === 'completed' ? 'var(--green)' : 'var(--teal)'
  const who = getPersonInfo(entry.actor_slug)?.name ?? entry.actor_slug
  const iso = entry.created_at
  const isCreated = ev === 'created'

  // Created → absolute local datetime inline (the anchor provenance fact).
  // Others → relative. Both reveal the exact local date+time on hover.
  const shownTime = isCreated
    ? formatLocal(iso, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : formatRelativeTime(iso)
  const fullLocal = formatLocal(iso, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div
      className="flex items-baseline gap-2"
      style={{ padding: '0.25rem 0.5rem', fontStyle: 'italic', color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.4 }}
    >
      <span
        aria-hidden="true"
        style={{ fontStyle: 'normal', color: glyphColor, fontWeight: 700, flex: 'none', width: '0.95rem', textAlign: 'center' }}
      >
        {glyph}
      </span>
      <span style={{ minWidth: 0 }}>
        {entry.body} <span style={{ fontStyle: 'normal', fontWeight: 600 }}>— {who}</span>
      </span>
      <time
        dateTime={iso}
        title={fullLocal}
        style={{
          marginLeft: 'auto', paddingLeft: '0.8rem', flex: 'none', fontStyle: 'normal',
          color: 'var(--ink-faint)', fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums', cursor: 'help',
        }}
      >
        {shownTime}
      </time>
    </div>
  )
}
