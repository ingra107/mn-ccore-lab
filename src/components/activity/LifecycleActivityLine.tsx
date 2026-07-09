// LifecycleActivityLine — quiet "system chrome" for lifecycle rows (kind
// 'system' | 'completion'). NOT a message: one small italic muted line with a
// typed event glyph, the actor, and a timestamp.
//
// The timestamp reuses EntryTime — the SAME component the comment boxes use — so
// format, style, and hover-to-exact-local are IDENTICAL across the feed and the
// two row types don't visually diverge (Nick 2026-07-09). Design ref:
// docs/superpowers/specs/2026-07-09-activity-log-provenance-design.md
import { getPersonInfo } from '../../data/team'
import { EntryTime } from './activityRender'
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

  return (
    <div
      className="flex items-baseline gap-2"
      style={{ padding: '0.1rem 0.5rem', fontStyle: 'italic', color: 'var(--muted)', fontSize: '0.72rem', lineHeight: 1.3 }}
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
      {/* Same timestamp component as the comment rows → identical format + hover. */}
      <EntryTime ts={entry.created_at} className="ml-auto" />
    </div>
  )
}
