// release-commits.mjs — which shipped commits a What's new draft offers (#156).
//
// A commit that only touched tests, docs or markdown changed nothing a
// teammate can do, so it never reaches the draft Nick reviews.

const NOT_USER_FACING = [/^tests\//, /^docs\//, /\.md$/]

/** `git log --reverse --name-only --format=@@%H%x09%s` output -> entries, oldest first. */
export function parseGitLog(raw) {
  const out = []
  for (const block of raw.split('@@').slice(1)) {
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
