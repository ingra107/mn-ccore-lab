// The one chord map. `G` then a key goes to a page. The shortcut hook accepts
// every entry; the help panel lists the primary ones; the command palette
// shows the primary chord beside the page it names. An `alias` is an old chord
// kept for muscle memory: it works but is never shown, so the three readers
// cannot disagree about what a key does.
import { PATHS } from './paths'

export interface NavChord {
  /** The key pressed after G, lowercase. */
  key: string
  path: string
  /** Help panel wording. */
  label: string
  /** Accepted, but not listed anywhere. */
  alias?: boolean
}

export const NAV_CHORDS: readonly NavChord[] = [
  { key: 'd', path: PATHS.dashboard, label: 'Go to Today' },
  { key: 't', path: PATHS.myTasks, label: 'Go to My Tasks' },
  { key: 'p', path: PATHS.projects, label: 'Go to Projects' },
  { key: 'm', path: PATHS.meetings, label: 'Go to Meetings' },
  { key: 'e', path: PATHS.deadlines, label: 'Go to Deadlines' },
  { key: 'i', path: PATHS.ideasTab, label: 'Go to Ideas' },
  { key: 's', path: PATHS.settings, label: 'Go to Settings' },
  { key: 'c', path: PATHS.calendar, label: 'Go to Calendar' },
  { key: 'h', path: '/', label: 'Go to Home' },
  { key: 'r', path: PATHS.digestTab, label: 'Go to Research Digest' },
  { key: 'g', path: PATHS.grants, label: 'Go to Grants' },
  { key: 'a', path: PATHS.activity, label: 'Go to Activity' },
  { key: 'y', path: PATHS.myTasks, label: 'Go to My Tasks', alias: true },
  { key: 'l', path: PATHS.digestTab, label: 'Go to Research Digest', alias: true },
  { key: 'k', path: PATHS.deadlines, label: 'Go to Deadlines', alias: true },
]

/** Where the key after G goes, or undefined. */
export function chordTarget(key: string): string | undefined {
  const k = key.toLowerCase()
  return NAV_CHORDS.find((c) => c.key === k)?.path
}

/** The chord the palette shows beside a page ("G T"), or undefined. */
export function chordLabelFor(path: string): string | undefined {
  const c = NAV_CHORDS.find((x) => !x.alias && x.path === path)
  return c ? `G ${c.key.toUpperCase()}` : undefined
}
