// Faces show the photo when there is one, the initials disc otherwise
// (rules-ui-design 18, Nick 2026-10-10: "why isn't the NI my picture?").
// The Avatar fallback is initials only, never initials over a silhouette (#8969).
// Real Chromium (vitest.config.ts browser mode).

import { describe, it, expect } from 'vitest'
import type { ReactElement } from 'react'
import { Face, NameFace, Faces } from '../components/today/skin'
import Avatar from '../components/Avatar'
import { resolveAttendeeViews } from '../lib/attendeeViews'
import { photoFor } from '../lib/personLabel'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

// The .tk-* skin (same slice timeline-meeting-height.test.tsx injects), so the
// size check measures the real face CSS.
const style = document.createElement('style')
style.textContent = '*,::before,::after{box-sizing:border-box}\n' + css.slice(css.indexOf('/* ══ Today skin'))
document.head.appendChild(style)

const tk = (node: ReactElement) => <div className="tk">{node}</div>

describe('Today faces', () => {
  it('a member with a profile photo shows the photo, not the initials', async () => {
    const host = await mount(tk(<Face slug="nick-ingraham" lg />), { ready: (h) => h.querySelector('.tk-face'), label: 'face' })
    const face = host.querySelector('.tk-face')!
    expect(face.classList.contains('tk-photo')).toBe(true)
    expect(face.classList.contains('tk-lg')).toBe(true)
    expect(face.querySelector('img')!.getAttribute('src')).toBe(photoFor('nick-ingraham'))
    expect(face.textContent).toBe('')
    expect(face.getAttribute('aria-label')).toBe('Nick Ingraham')
  })

  it('a member with no photo keeps the initials disc', async () => {
    const host = await mount(tk(<Face slug="casey-eddington" />), { ready: (h) => h.querySelector('.tk-face'), label: 'face' })
    const face = host.querySelector('.tk-face')!
    expect(face.querySelector('img')).toBeNull()
    expect(face.textContent).toBe('CE')
  })

  it('a free-text name that is a team member gets the photo; any other name keeps initials', async () => {
    const host = await mount(tk(<><NameFace name="Nick Ingraham" /><NameFace name="Dr. Grandon" /></>), { ready: (h) => h.querySelectorAll('.tk-face').length === 2, label: 'name faces' })
    const [nick, other] = Array.from(host.querySelectorAll('.tk-face'))
    expect(nick.querySelector('img')).not.toBeNull()
    expect(other.textContent).toBe('DG')
  })

  it('a face stack mixes photos and initials at the same size', async () => {
    const host = await mount(tk(<Faces slugs={['nick-ingraham', 'casey-eddington']} />), { ready: (h) => h.querySelectorAll('.tk-face').length === 2, label: 'stack' })
    const [a, b] = Array.from(host.querySelectorAll<HTMLElement>('.tk-face'))
    expect(a.getBoundingClientRect().width).toBe(22)
    expect(b.getBoundingClientRect().width).toBe(22)
    expect(a.querySelector('img')!.getBoundingClientRect().width).toBe(22)
    expect(a.querySelector('img')).not.toBeNull()
  })
})

describe('meeting attendees', () => {
  it('a team attendee carries the profile photo', () => {
    const [a] = resolveAttendeeViews(['nick-ingraham'], [{ name: 'Nick Ingraham', initials: 'NI', role: 'pi', slug: 'nick-ingraham' }])
    expect(a.photo).toBe(photoFor('nick-ingraham'))
  })
})

describe('Avatar fallback (#8969)', () => {
  it('draws initials only, no silhouette under them', async () => {
    const host = await mount(<Avatar name="Casey Eddington" initials="CE" />, { ready: (h) => h.textContent?.includes('CE'), label: 'avatar' })
    expect(host.querySelector('svg')).toBeNull()
    expect(host.querySelector('img')).toBeNull()
  })
})
