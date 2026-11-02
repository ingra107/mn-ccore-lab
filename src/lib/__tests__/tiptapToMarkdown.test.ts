// The description_json -> markdown converter and the panel's fold fallback
// (Nick 2026-11-01: one plain-markdown task body). REMOVE WITH THE COLUMN DROP.
// Run: npx vitest run --config vitest.config.lib.ts src/lib/__tests__/tiptapToMarkdown.test.ts

import { describe, it, expect } from 'vitest'
import { tiptapJsonToMarkdown, descriptionJsonFold } from '../tiptapToMarkdown'
import { withMeetingMarker, stripMeetingMarker } from '../textUtils'

const doc = (...content: unknown[]) => JSON.stringify({ type: 'doc', content })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const t = (text: string, ...marks: unknown[]) => (marks.length ? { type: 'text', text, marks } : { type: 'text', text })

describe('tiptapJsonToMarkdown', () => {
  it('writes paragraphs, bold, italic, code, strike and hard breaks', () => {
    const md = tiptapJsonToMarkdown(doc(
      p(t('Plain '), t('bold', { type: 'bold' }), t(' and '), t('slanted ', { type: 'italic' }), t('x')),
      p(t('one'), { type: 'hardBreak' }, t('two'), t(' '), t('a_b', { type: 'code' }), t(' '), t('gone', { type: 'strike' })),
    ))
    // Emphasis never ends on whitespace: the trailing space moves outside.
    expect(md).toBe('Plain **bold** and *slanted* x\n\none\ntwo `a_b` ~~gone~~')
  })

  it('writes a link as [text](url), and a URL that is its own text stays bare', () => {
    const md = tiptapJsonToMarkdown(doc(p(
      t('portal', { type: 'link', attrs: { href: 'https://clif-icu.com/portal' } }),
      t(' and '),
      t('https://example.org/a', { type: 'link', attrs: { href: 'https://example.org/a' } }),
    )))
    expect(md).toBe('[portal](https://clif-icu.com/portal) and https://example.org/a')
  })

  it('writes headings, bullet, ordered, nested and task lists, quotes, code blocks and rules', () => {
    const li = (...content: unknown[]) => ({ type: 'listItem', content })
    const md = tiptapJsonToMarkdown(doc(
      { type: 'heading', attrs: { level: 2 }, content: [t('Plan')] },
      { type: 'bulletList', content: [li(p(t('a')), { type: 'bulletList', content: [li(p(t('a1')))] }), li(p(t('b')))] },
      { type: 'orderedList', attrs: { start: 3 }, content: [li(p(t('c'))), li(p(t('d')))] },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('done'))] }, { type: 'taskItem', attrs: { checked: false }, content: [p(t('todo'))] }] },
      { type: 'blockquote', content: [p(t('quoted'))] },
      { type: 'codeBlock', attrs: { language: 'r' }, content: [t('x <- 1')] },
      { type: 'horizontalRule' },
      p(),
    ))
    expect(md).toBe([
      '## Plan',
      '- a\n  - a1\n- b',
      '3. c\n4. d',
      '- [x] done\n- [ ] todo',
      '> quoted',
      '```r\nx <- 1\n```',
      '---',
    ].join('\n\n'))
  })

  it('returns null for missing or unparseable JSON, and "" for an empty doc', () => {
    expect(tiptapJsonToMarkdown(null)).toBeNull()
    expect(tiptapJsonToMarkdown('{not json')).toBeNull()
    expect(tiptapJsonToMarkdown(doc())).toBe('')
  })
})

describe('descriptionJsonFold (one classifier for the panel fallback and the fold)', () => {
  const json = doc(p(t('Call '), t('Amy', { type: 'bold' }), t(' about the budget')))
  const md = 'Call **Amy** about the budget'

  it('fill: description is empty (or only a meeting marker)', () => {
    expect(descriptionJsonFold(null, json)).toEqual({ kind: 'fill', md })
    expect(descriptionJsonFold('', json)).toEqual({ kind: 'fill', md })
    expect(descriptionJsonFold('[meeting:cal-1:abc]', json)).toEqual({ kind: 'fill', md })
  })

  it('none: description already holds the same words (loaded plain text, or folded)', () => {
    expect(descriptionJsonFold('Call Amy about the budget', json)).toEqual({ kind: 'none' })
    expect(descriptionJsonFold('PB note.\n\n---\n\nCall **Amy** about the budget', json)).toEqual({ kind: 'none' })
  })

  it('supersede: the JSON is the loaded description plus what the user added (the prod row shape)', () => {
    const stored = 'From the meeting.\n\nSource: [[x.md]]\n\n[meeting:cal-1:abc]'
    const edited = doc(p(t('Send Shurui the list!!')), p(t('From the meeting.')), p(t('Source: [[x.md]]')))
    expect(descriptionJsonFold(stored, edited)).toEqual({ kind: 'supersede', md: 'Send Shurui the list!!\n\nFrom the meeting.\n\nSource: [[x.md]]' })
  })

  it('append: the two say different things', () => {
    expect(descriptionJsonFold('A later PB write', json)).toEqual({ kind: 'append', md })
  })

  // Cold-refuter repros 2026-11-01 (the old classifier joined every letter into
  // one string and tested substrings).
  it('compares WHOLE words: letters spread across words are not a match', () => {
    // "ok" is inside "bOOK"-ish letter runs only by accident: whole words say it is missing.
    expect(descriptionJsonFold('Return the book', doc(p(t('OK')))).kind).toBe('append')
    expect(descriptionJsonFold('Call the stats team', doc(p(t('Hest')))).kind).toBe('append')
  })

  it('supersede needs description as an unbroken run of whole words inside the JSON', () => {
    const json2 = doc(p(t('Alpha beta gamma. Remove this wrong sentence.')))
    // Supersede is a FOLD-ONLY outcome; the panel shows the JSON as a separate block and never hides the description.
    expect(descriptionJsonFold('Alpha beta gamma.', json2).kind).toBe('supersede')
    expect(descriptionJsonFold('Alpha gamma.', json2).kind).toBe('append')
  })

  it('none for no JSON, an empty doc or unparseable JSON', () => {
    expect(descriptionJsonFold('x', null)).toEqual({ kind: 'none' })
    expect(descriptionJsonFold('', doc(p()))).toEqual({ kind: 'none' })
    expect(descriptionJsonFold('', '{bad')).toEqual({ kind: 'none' })
  })
})

describe('withMeetingMarker (a panel edit keeps the hidden dedup token)', () => {
  const stored = 'From the MNCCORE meeting. [meeting:cal-20260616T1500-mnccore:abc]'

  it('carries the token back onto the edited text', () => {
    expect(stripMeetingMarker(stored)).toBe('From the MNCCORE meeting.')
    expect(withMeetingMarker('Edited body', stored)).toBe('Edited body [meeting:cal-20260616T1500-mnccore:abc]')
  })

  it('leaves text without a token alone, and keeps a lone token when the body is cleared', () => {
    expect(withMeetingMarker('new  \n', 'old')).toBe('new')
    expect(withMeetingMarker('', null)).toBe('')
    expect(withMeetingMarker('', stored)).toBe('[meeting:cal-20260616T1500-mnccore:abc]')
  })

  it('a marker-only stored value gets a separator', () => {
    expect(withMeetingMarker('hi', '[meeting:cal-1:abc]')).toBe('hi [meeting:cal-1:abc]')
    expect(stripMeetingMarker(withMeetingMarker('hi', '[meeting:cal-1:abc]'))).toBe('hi')
  })
})
