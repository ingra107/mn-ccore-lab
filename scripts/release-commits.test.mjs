// release-commits.test.mjs — #156 What's new release drafts.
//
// Run with: node scripts/release-commits.test.mjs   (node:test, no runner needed)

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { selectReleaseCommits, parseGitLog } from './release-commits.mjs'

const e = (sha, files) => ({ sha, subject: `subject ${sha}`, files })

describe('selectReleaseCommits()', () => {
  it('drops docs-only, tests-only and markdown-only commits', () => {
    const out = selectReleaseCommits([
      e('a', ['docs/superpowers/specs/x.md']),
      e('b', ['tests/local/journeys/y.spec.ts']),
      e('c', ['README.md', 'SESSION-HANDOFF.md']),
    ])
    assert.deepEqual(out, [])
  })
  it('keeps a commit that touches product code alongside docs', () => {
    assert.deepEqual(selectReleaseCommits([e('d', ['src/x.tsx', 'docs/y.md'])]), [{ sha: 'd', subject: 'subject d' }])
  })
  it('drops a commit with no files (a merge)', () => {
    assert.deepEqual(selectReleaseCommits([e('m', [])]), [])
  })
  it('keeps order, oldest first', () => {
    const out = selectReleaseCommits([e('1', ['api/a.ts']), e('2', ['src/b.tsx'])])
    assert.deepEqual(out.map((c) => c.sha), ['1', '2'])
  })
})

describe('parseGitLog()', () => {
  it('reads `git log --reverse --name-only --format=@@%H%x09%s` output', () => {
    const raw = '@@aaa\tFix the thing\n\nsrc/x.tsx\ndocs/y.md\n@@bbb\tDocs only\n\ndocs/z.md\n'
    assert.deepEqual(parseGitLog(raw), [
      { sha: 'aaa', subject: 'Fix the thing', files: ['src/x.tsx', 'docs/y.md'] },
      { sha: 'bbb', subject: 'Docs only', files: ['docs/z.md'] },
    ])
  })
})
