// release-commits.mjs — which shipped commits a What's new draft offers (#156).
//
// A commit that only touched tests, docs, markdown or repo tooling changed
// nothing a teammate can do, so it never reaches the draft Nick reviews. This
// repo keeps tests beside the code (api/**/*.test.ts, src/**/__tests__/), not
// only under tests/, so the patterns name those too.

const NOT_USER_FACING = [
  /^tests\//, /^docs\//, /\.md$/,
  /\.(test|spec)\.(ts|tsx|js|mjs)$/, /(^|\/)__tests__\//, /^api\/test-support\//,
  /^scripts\//, /^\.github\//, /^\.githooks\//, /^\.superpowers\//,
]

/** The record separator git writes before each commit (%x1e): a subject can hold
 *  any printable text, '@@' included, but never this control character. */
export const GIT_LOG_FORMAT = '--format=%x1e%H%x09%s'

/** `git log --reverse --name-only --format=%x1e%H%x09%s` output -> entries, oldest first. */
export function parseGitLog(raw) {
  const out = []
  for (const block of raw.split('').slice(1)) {
    const [head, ...rest] = block.split('\n')
    const tab = head.indexOf('\t')
    out.push({
      sha: head.slice(0, tab),
      subject: head.slice(tab + 1),
      files: rest.map((l) => l.trim()).filter(Boolean),
    })
  }
  return out
}

/** Keep commits with at least one user-facing file; order kept. */
export function selectReleaseCommits(entries) {
  return entries
    .filter((e) => e.files.some((f) => !NOT_USER_FACING.some((re) => re.test(f))))
    .map((e) => ({ sha: e.sha, subject: e.subject }))
}

/**
 * Which commits to read. No release yet: the recent ones (range null). A
 * release end this clone has in its history: everything after it. A release
 * end it cannot see (a rewritten history, a shallow or fresh clone): SKIP, so
 * commits already approved or discarded are never offered again.
 */
export function planRange(lastCommitTo, isAncestorOfHead) {
  if (!lastCommitTo) return { range: null }
  if (isAncestorOfHead) return { range: `${lastCommitTo}..HEAD` }
  return { skip: `the last release ended at ${lastCommitTo}, which is not in this clone's history; no draft opened. Fetch full history, or post the commits by hand with POST /api/releases.` }
}
