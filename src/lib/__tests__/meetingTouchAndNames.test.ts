// 2026-10-14 mobile audit, meeting pages.
//
// 1. nameSlugsInText: the prep page's Recent activity read "Created task: X →
//    nick-ingraham" and "Added adams-dudley to CCI". Slugs read as first names
//    (rules-ui-design 8 and 12).
// 2. .reveal-on-hover: the meeting page's title pencil and notes Edit button were
//    `opacity-0 group-hover:` with no touch arm, so a phone never showed them.
//    The shared utility must keep its (hover: none) arm, and no page may go back
//    to a bare Tailwind hover-only pair. This reads the CSS and source text; it
//    is a contract on the rule, not a render at 390px.
// 3. A meeting link targets meeting_ref, never the raw meeting_id (#1593 review).

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { nameSlugsInText } from '../personLabel'

// Every product .ts/.tsx FILE under src. vitest browser mode writes failure
// screenshots into ignored __screenshots__/<name>.test.tsx/ DIRECTORIES, so a
// name test alone would hand readFileSync a directory (EISDIR).
function sourceFiles(): string[] {
  return (readdirSync('src', { recursive: true }) as string[])
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__') && !f.includes('__screenshots__'))
    .filter((f) => statSync(join('src', f)).isFile())
}

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

  it('a Tailwind group host reveals it too', () => {
    expect(css).toMatch(/\.group:hover \.reveal-on-hover,\s*\.group:focus-within \.reveal-on-hover/)
  })

  it('the meeting title pencil uses it; notes Edit sits in the header slot, never over the notes', () => {
    const detail = readFileSync('src/pages/MeetingDetail.tsx', 'utf8')
    expect(detail).toMatch(/className="reveal-on-hover hit-area"\s+aria-label="Edit meeting title"/)
    // Pinned absolute over the notes it covered their first line on a phone.
    expect(detail).toMatch(/aria-label="Edit meeting notes"\s+className="inline-flex/)
    expect(detail).not.toMatch(/absolute top-0 right-0 reveal-on-hover/)
  })

  it('no control anywhere in src is hidden behind a bare hover-only pair', () => {
    const offenders = sourceFiles()
      .filter((f) => /opacity-0[^"'`]*group-hover:opacity-100/.test(readFileSync(join('src', f), 'utf8')))
    expect(offenders).toEqual([])
  })
})

describe('meeting links target meeting_ref', () => {
  it('no component links a task to PATHS.meeting(<raw meeting_id>)', () => {
    // meeting_id is a calendar source_id on every debrief row and 404s;
    // meetingHrefFor() reads the resolved meeting_ref (meetingOrigin.ts).
    const offenders = sourceFiles()
      .filter((f) => /PATHS\.meeting\([^)]*\.meeting_id\)/.test(readFileSync(join('src', f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
