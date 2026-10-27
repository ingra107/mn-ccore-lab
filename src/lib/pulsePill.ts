// pulsePill.ts -- what the top-bar What's new / Lab pulse pill says (#156).
//
// Gold "What's new" means something THIS person has not opened: the newest
// approved release, the newest announcement, or (Nick only) a pending draft.
// Everything else reads "Lab pulse · N active". Seen state is the ids of the
// release and announcement that were showing when the panel last opened
// (user_prefs 'hub.pulse.seen'), so a deleted announcement can never keep
// the pill lit: it simply is not in the payload any more.
import type { PulsePayload } from '../../shared/pulse'

export interface PulseSeen { releaseId: string | null; announcementId: string | null }

export type PillState =
  | { tone: 'news'; label: "What's new"; openTab: 'news' }
  | { tone: 'pulse'; label: string; openTab: 'pulse' }

export const PULSE_SEEN_NONE: PulseSeen = { releaseId: null, announcementId: null }

export function pulsePillState(p: PulsePayload | undefined, seen: PulseSeen, isPi: boolean): PillState {
  if (p) {
    const unseenRelease = !!p.release && p.release.id !== seen.releaseId
    const unseenAnnouncement = !!p.announcement && p.announcement.id !== seen.announcementId
    if (unseenRelease || unseenAnnouncement || (isPi && !!p.draft)) {
      return { tone: 'news', label: "What's new", openTab: 'news' }
    }
  }
  return { tone: 'pulse', label: `Lab pulse · ${p?.active.length ?? 0} active`, openTab: 'pulse' }
}

/** What opening the panel marks as seen: whatever release and announcement it shows. */
export function seenAfterOpen(p: PulsePayload): PulseSeen {
  return { releaseId: p.release?.id ?? null, announcementId: p.announcement?.id ?? null }
}

/** Monday 00:00 in the viewer's own zone, as a UTC instant ("tasks done this week"). */
export function weekStartIso(now: Date): string {
  const back = (now.getDay() + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, 0, 0, 0, 0)
  return monday.toISOString()
}
