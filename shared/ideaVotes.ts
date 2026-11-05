// shared/ideaVotes.ts -- the placeholder slug of a vote from before votes had voters.
// schema-v158 turned each stored vote into an idea_votes row named legacy-vote-<n>, so
// no idea's count changed. Such a row counts and has no face.

export const LEGACY_VOTE_PREFIX = 'legacy-vote-'

export function isLegacyVote(slug: string): boolean {
  return slug.startsWith(LEGACY_VOTE_PREFIX)
}
