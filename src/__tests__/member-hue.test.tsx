// One personal hue per member (color back pick 8, Nick 2026-10-11): a member's
// own page rings the avatar in that member's hue; no other page does, and the
// gold avatar border leaves when the hue arrives. Real Chromium (browser mode),
// with the real token + .member-hue CSS from index.css injected.

import { describe, it, expect } from 'vitest'
import LabPageLayout from '../components/LabPageLayout'
import { memberHue } from '../lib/memberHue'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

// Anchor on a comment, never on a newline: core.autocrlf=true checks index.css
// out CRLF, and a '\n'-bearing anchor then finds nothing (empty slice, no ring).
const start = css.indexOf('/* ── Stepped-surface tokens')
const end = css.indexOf('/* ── Z-Index Hierarchy')
const style = document.createElement('style')
style.textContent = css.slice(start, end)
document.head.appendChild(style)

const page = (hueSeed?: string) => (
  <LabPageLayout name="Casey Eddington" credentials="" title="Data Analyst" role="MN-CCORE Team Member" initials="CE" links={[]} hueSeed={hueSeed}>
    <div id="body">body</div>
  </LabPageLayout>
)

const avatarOf = (host: HTMLElement) => host.querySelector<HTMLElement>('.rounded-full')!

describe('member hue', () => {
  it('slices the token CSS out of index.css', () => {
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(style.textContent).toContain('.member-hue')
  })

  it("a member's own page carries their hue: ring on the avatar, no gold border", async () => {
    const host = await mount(page('casey-eddington'), { ready: (h) => h.querySelector('#body'), label: 'member page' })
    const scope = host.querySelector<HTMLElement>('.member-hue')!
    expect(scope).not.toBeNull()
    expect(scope.style.getPropertyValue('--mh-h')).toBe(String(memberHue('casey-eddington')))
    const av = getComputedStyle(avatarOf(host))
    expect(av.boxShadow).not.toBe('none')
    expect(av.borderTopStyle).toBe('none')
    // The ring color resolves (a real color, not an unset var).
    expect(getComputedStyle(scope).getPropertyValue('--id').trim()).toMatch(/^oklch\(/)
  })

  it('two people get two different rings', async () => {
    const a = await mount(page('casey-eddington'), { ready: (h) => h.querySelector('#body'), label: 'a' })
    const b = await mount(page('nick-ingraham'), { ready: (h) => h.querySelector('#body'), label: 'b' })
    expect(memberHue('casey-eddington')).not.toBe(memberHue('nick-ingraham'))
    expect(getComputedStyle(avatarOf(a)).boxShadow).not.toBe(getComputedStyle(avatarOf(b)).boxShadow)
  })

  it('without a seed (Nick Lab, Nate Lab) nothing changes: no scope, no ring', async () => {
    const host = await mount(page(), { ready: (h) => h.querySelector('#body'), label: 'lab page' })
    expect(host.querySelector('.member-hue')).toBeNull()
    expect(getComputedStyle(avatarOf(host)).boxShadow).toBe('none')
  })
})
