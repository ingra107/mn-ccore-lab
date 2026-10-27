// post-release-draft.mjs — the last step of `npm run deploy:pages:gated` (#156).
//
// Opens or extends the ONE pending What's new draft with the commits shipped
// since the last release. The draft carries raw commit subjects and no words;
// the shipping Claude session then writes a title and 1-4 plain-English
// blurbs with POST /api/releases/<id> {action:'edit'}, and Nick approves in
// the What's new panel. Nobody else sees a draft.
//
// The site is already live when this runs, so it never fails the deploy:
// every problem is a warning and exit code 0.
//
// Usage: node scripts/post-release-draft.mjs [--url https://...]

import { execFileSync } from 'node:child_process'
import { parseGitLog, planRange, selectReleaseCommits } from './release-commits.mjs'

const PROD_URL = 'https://mn-ccore-lab.pages.dev'
const FIRST_RUN_COMMITS = 30

function warn(msg) {
  console.warn(`[release-draft] WARN: ${msg} (the deploy itself is fine)`)
  process.exit(0)
}

const urlFlag = process.argv.indexOf('--url')
const base = urlFlag > -1 ? process.argv[urlFlag + 1] : PROD_URL
const key = process.env.PB_API_KEY
if (!key) warn('PB_API_KEY is not set; no release draft opened')

async function post(body) {
  const res = await fetch(`${base}/api/releases`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST /api/releases ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()).data
}

function gitLog(range) {
  const args = ['log', '--reverse', '--name-only', '--format=@@%H%x09%s']
  if (range) args.push(range)
  else args.splice(1, 0, `-n${FIRST_RUN_COMMITS}`)
  return execFileSync('git', args, { encoding: 'utf8' })
}

try {
  const { lastCommitTo } = await post({ probe: true })
  let isAncestor = false
  if (lastCommitTo) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', lastCommitTo, 'HEAD'], { stdio: 'ignore' })
      isAncestor = true
    } catch { /* not in this history: planRange skips */ }
  }
  const plan = planRange(lastCommitTo, isAncestor)
  if (plan.skip) warn(plan.skip)
  // With no range, `git log -nN --reverse` still lists the newest N, oldest first.
  const commits = selectReleaseCommits(parseGitLog(gitLog(plan.range)))
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (commits.length === 0) {
    console.log('[release-draft] nothing user-facing shipped since the last release; no draft')
    process.exit(0)
  }
  const out = await post({ commitTo: head, commits })
  console.log(`[release-draft] ${out.created ? 'opened' : 'extended'} draft ${out.id} (${commits.length} commit${commits.length === 1 ? '' : 's'}).`)
  console.log(`[release-draft] Write its title + 1-4 blurbs: POST ${base}/api/releases/${out.id} {"action":"edit","title":...,"blurbs":[{"lead":...,"text":...}]}`)
} catch (e) {
  warn(e instanceof Error ? e.message : String(e))
}
