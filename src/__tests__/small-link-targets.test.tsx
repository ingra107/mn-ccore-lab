// Text links on Trajectory, member Projects, Profile and Settings reach a real
// touch target (phone audit 2026-10-14: DOI 19x18, project titles 21px tall,
// "Back to profile" 19px, "Open full Settings" 16px, "Team directory" 21px).
//
// Standalone links carry a.inline-link (a 44px row on touch); links inside a
// list carry .hit-area (a 44px tap box that does not move the rows). Runs the
// real index.css in Chromium with the touch/phone query unwrapped.

import { describe, it, expect, afterEach } from 'vitest'
import css from '../index.css?raw'
import profileSrc from '../pages/portal/ProfilePage.tsx?raw'
import settingsSrc from '../pages/portal/SettingsPage.tsx?raw'
import trajectorySrc from '../pages/TrajectoryPage.tsx?raw'
import memberProjectsSrc from '../components/project/MemberProjects.tsx?raw'

const touch = css.replace(/@media \(max-width: 768px\), \(hover: none\) and \(pointer: coarse\) and \(min-width: 769px\)/g, '@media all')

let styleEl: HTMLStyleElement | null = null
let fixture: HTMLElement | null = null
afterEach(() => { styleEl?.remove(); fixture?.remove(); styleEl = null; fixture = null })

function setup(html: string) {
  styleEl = document.createElement('style')
  styleEl.textContent = touch
  document.head.appendChild(styleEl)
  fixture = document.createElement('div')
  fixture.style.cssText = 'position:fixed;left:40px;top:100px;width:300px;font-size:12px;line-height:1.5'
  fixture.innerHTML = html
  document.body.appendChild(fixture)
  return (id: string) => fixture!.querySelector<HTMLElement>(`#${id}`)!
}

// The CSS tests below build their own markup, so they cannot tell whether the
// real pages use the classes. These read the real components' source.
describe('the real links carry the touch classes', () => {
  it('Profile, Settings and Trajectory standalone links are inline-link rows', () => {
    expect(profileSrc).toContain('className="inline-link inline-flex items-center gap-2 text-xs"')
    expect(settingsSrc).toContain('className="inline-link inline-flex items-center gap-1.5 mb-4 text-[13px] hover:underline"')
    expect(trajectorySrc).toContain('className="inline-link inline-flex items-center gap-1.5 mb-6 no-print')
  })

  it('Trajectory DOI and Velocity project links carry hit-area', () => {
    expect(trajectorySrc).toMatch(/<a\s+className="hit-area"\s+href=\{pub\.doi/)
    expect(trajectorySrc).toMatch(/to=\{PATHS\.project\(project\.slug\)\}\s+className="hit-area"/)
  })

  it('stacked member Projects links are real rows, never hit-area overhangs', () => {
    expect(memberProjectsSrc).toContain('className="inline-link inline-flex items-center"')
    expect(memberProjectsSrc).not.toContain('hit-area')
  })
})

describe('small text links on touch', () => {
  it('a standalone inline-link is a 44px row', () => {
    const q = setup('<a id="back" class="inline-link inline-flex items-center" href="#" style="display:inline-flex;align-items:center">Back to profile</a>')
    expect(q('back').getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  })

  it('stacked list links (member Projects) are real rows: no tap box covers the next link', () => {
    const q = setup(`<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px">
      <li style="display:flex;gap:8px;align-items:center"><a id="p1" class="inline-link inline-flex items-center" href="#" style="display:inline-flex;align-items:center">Project one</a></li>
      <li style="display:flex;gap:8px;align-items:center"><a id="p2" class="inline-link inline-flex items-center" href="#" style="display:inline-flex;align-items:center">Project two</a></li>
      <li style="display:flex;gap:8px;align-items:center"><a id="p3" class="inline-link inline-flex items-center" href="#" style="display:inline-flex;align-items:center">Project three</a></li></ul>`)
    for (const [id, next] of [['p1', 'p2'], ['p2', 'p3']]) {
      const a = q(id).getBoundingClientRect()
      expect(a.height).toBeGreaterThanOrEqual(44)
      // the bottom edge of this link's own box belongs to this link, the next row's top edge to the next
      expect(document.elementFromPoint(a.left + 4, a.bottom - 2)?.closest('a')).toBe(q(id))
      const b = q(next).getBoundingClientRect()
      expect(document.elementFromPoint(b.left + 4, b.top + 2)?.closest('a')).toBe(q(next))
    }
  })

  it('a DOI link in a list keeps its size but takes taps 10px above and below it', () => {
    const q = setup(`<div>Title of a paper</div><a id="doi" class="hit-area" href="#" style="display:inline-block;font-size:11px">DOI</a><div style="height:40px"></div>`)
    const a = q('doi')
    const r = a.getBoundingClientRect()
    expect(r.height).toBeLessThan(24)
    const cx = r.left + r.width / 2
    expect(document.elementFromPoint(cx, r.top - 8)?.closest('a')).toBe(a)
    expect(document.elementFromPoint(cx, r.bottom + 8)?.closest('a')).toBe(a)
    expect(document.elementFromPoint(r.left - 8, r.top + r.height / 2)?.closest('a')).toBe(a)
  })
})
