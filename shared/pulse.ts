// shared/pulse.ts -- the What's new / Lab pulse payload (#156), shared by
// api/routes/pulse.ts and the pill in src/components/pulse/.

export interface ReleaseBlurb { lead: string; text: string }

export interface PulseRelease {
  id: string
  title: string
  blurbs: ReleaseBlurb[]
  approvedAt: string | null
  status: 'draft' | 'approved'
  /** The commit subjects the release covers (drafts only; [] on an approved one). */
  commits: { sha: string; subject: string }[]
}

export interface PulseAnnouncement { id: string; body: string; authorSlug: string; createdAt: string }

export interface PulseWin { kind: 'milestone' | 'publication'; title: string; date: string; href: string | null }

export interface PulsePayload {
  /** Newest approved release. */
  release: PulseRelease | null
  /** Up to 10 older approved releases, newest first. */
  pastReleases: { id: string; title: string; approvedAt: string }[]
  /** The pending draft: a PI viewer only (TABLE_SCOPE hides it from anyone else). */
  draft: PulseRelease | null
  /** Newest live announcement from the last 14 days. */
  announcement: PulseAnnouncement | null
  /** Member slugs active in the last 24h, most recent first (lab-wide). */
  active: string[]
  tasksDone: number
  milestonesHit: number
  newPapers: number
  /** Up to 3 recent milestones / publications the viewer may read. */
  wins: PulseWin[]
}

export const RELEASE_TITLE_MAX = 80
export const RELEASE_BLURBS_MAX = 4
export const ANNOUNCEMENT_MAX = 280
