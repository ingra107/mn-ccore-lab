// 2026-10-14 mobile audit, meeting pages.
//
// 1. nameSlugsInText: the prep page's Recent activity read "Created task: X →
//    nick-ingraham" and "Added adams-dudley to CCI". Slugs read as first names
//    (rules-ui-design 8 and 12).
// 2. .reveal-on-hover: the meeting page's title pencil and notes Edit button were
//    `opacity-0 group-hover:` with no touch arm, so a phone never showed them.
//    The shared utility must keep its (hover: none) arm, and the meeting pages
//    must not go back to a bare Tailwind hover-only pair. This reads the CSS and
//    source text; it is a contract on the rule, not a render at 390px.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { nameSlugsInText } from '../personLabel'

describe('nameSlugsInText', () => {
  it('turns known team slugs into first names', () => {
    expect(nameSlugsInText('Created task: "Draft aims" → nick-ingraham')).toBe('Created task: "Draft aims" → Nick')
    expect(nameSlugsInText('Added adams-dudley to CCI in ARDS')).toBe('Added Adams to CCI in ARDS')
    expect(nameSlugsInText('Assignee: nick-ingraham → casey-eddington')).toBe('Assignee: Nick → Casey')
  })

  it('leaves unknown slugs, partial matches and plain text alone', () => {
    expect(nameSlugsInText('Stage: data_analysis → data-collection')).toBe('Stage: data_analysis → data-collection')
    expect(nameSlugsInText('see nick-ingraham-notes')).toBe('see nick-ingraham-notes')
    expect(nameSlugsInText('')).toBe('')
  })
})

describe('hover-revealed controls show on touch', () => {
  const css = readFileSync('src/index.css', 'utf8')

  it('.reveal-on-hover has a (hover: none) arm that shows it', () => {
    expect(css).toMatch(/\.reveal-on-hover\s*\{\s*opacity:\s*0/)
    expect(css).toMatch(/@media \(hover: none\) \{\s*\.reveal-on-hover \{ opacity: var\(--reveal-opacity, 1\); \}/)
  })

  it('the meeting pages use it, not a hover-only Tailwind pair', () => {
    const detail = readFileSync('src/pages/MeetingDetail.tsx', 'utf8')
    expect(detail).not.toMatch(/opacity-0 group-hover/)
    expect(detail).toMatch(/className="reveal-on-hover hit-area"\s+aria-label="Edit meeting title"/)
    expect(detail).toMatch(/aria-label="Edit meeting notes"\s+className="[^"]*reveal-on-hover/)
  })
})
