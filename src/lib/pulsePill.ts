// pulsePill.ts -- what the top-bar What's new / Lab pulse pill says (#156).
//
// Gold "What's new" means something THIS person has not seen: the newest
// approved release, the newest announcement, or (Nick only) a pending draft.
// Everything else reads "Lab pulse · N active". Seen state is the newest
// release and announcement ids the person has had in front of them
// (user_prefs 'hub.pulse.seen'), marked per TAB: the release when What's new
// shows, the announcement when Lab pulse shows (Rule 73: a badge drains only
// on what was shown). Ids are prefix + ULID, so string order is time order:
// an older announcement resurfacing after the newest was deleted is not new.
import type { PulsePayload } from '../../shared/pulse'

export interface PulseSeen { releaseId: string | null; announcementId: string | null }
export type PulseTab = 'news' | 'pulse'

export type PillState =
  | { tone: 'news'; label: "What's new"; openTab: PulseTab }
  | { tone: 'pulse'; label: string; openTab: 'pulse' }

export const PULSE_SEEN_NONE: PulseSeen = { releaseId: null, announcementId: null }

/** Newer than what was seen (ULID order); anything beats nothing seen. */
const isNewer = (id: string | undefined, seen: string | null) => !!id && (seen === null || id > seen)

/**
 * `seenLoaded` false = the person's seen state has not come back from the
 * server yet: stay unlit rather than flash gold for something already read.
 */
export function pulsePillState(p: PulsePayload | undefined, seen: PulseSeen, isPi: boolean, seenLoaded = true): PillState {
  if (p && seenLoaded) {
    const unseenRelease = isNewer(p.release?.id, seen.releaseId) || (isPi && !!p.draft)
    const unseenAnnouncement = isNewer(p.announcement?.id, seen.announcementId)
    if (unseenRelease) return { tone: 'news', label: "What's new", openTab: 'news' }
    if (unseenAnnouncement) return { tone: 'news', label: "What's new", openTab: 'pulse' }
  }
  return { tone: 'pulse', label: `Lab pulse · ${p?.active.length ?? 0} active`, openTab: 'pulse' }
}

/** Seen after `tab` has shown `p`: only that tab's item moves, and never backwards. */
export function seenFor(p: PulsePayload, tab: PulseTab, prev: PulseSeen): PulseSeen {
  const next = { ...prev }
  if (tab === 'news' && isNewer(p.release?.id, prev.releaseId)) next.releaseId = p.release!.id
  if (tab === 'pulse' && isNewer(p.announcement?.id, prev.announcementId)) next.announcementId = p.announcement!.id
  return next
}

/** Monday 00:00 in the viewer's own zone, as a UTC instant ("tasks done this week"). */
export function weekStartIso(now: Date): string {
  const back = (now.getDay() + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, 0, 0, 0, 0)
  return monday.toISOString()
}
