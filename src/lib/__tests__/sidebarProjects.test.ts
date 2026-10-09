import { describe, it, expect } from 'vitest'
import { projectsForSidebar, RECENT_PROJECT_LIMIT } from '../sidebarProjects'

const NOW = Date.parse('2026-10-09T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

const p = (slug: string, extra: Record<string, unknown> = {}) => ({ slug, title: `${slug} full title`, status: 'active', ...extra })

describe('projectsForSidebar', () => {
  it('pinned first in pin order, then projects active in the last 14 days, newest first', () => {
    const out = projectsForSidebar([
      p('old', { lastActivity: daysAgo(30) }),
      p('fresh', { lastActivity: daysAgo(1) }),
      p('week', { lastActivity: daysAgo(10) }),
      p('pinned-old', { lastActivity: daysAgo(90) }),
      p('pinned-b'),
    ], ['pinned-b', 'pinned-old'], NOW)
    expect(out.map((x) => [x.slug, x.pinned])).toEqual([
      ['pinned-b', true], ['pinned-old', true], ['fresh', false], ['week', false],
    ])
  })

  it('uses the short name, then the title', () => {
    const out = projectsForSidebar([
      p('a', { short_name: 'DNR', lastActivity: daysAgo(0) }),
      p('b', { lastActivity: daysAgo(0) }),
    ], [], NOW)
    expect(out.map((x) => x.name).sort()).toEqual(['DNR', 'b full title'])
  })

  it('leaves out finished projects, projects with no activity, and a pin the viewer no longer has', () => {
    const out = projectsForSidebar([
      p('done', { status: 'done', lastActivity: daysAgo(0) }),
      p('published', { stage: 'published', lastActivity: daysAgo(0) }),
      p('quiet'),
    ], ['gone'], NOW)
    expect(out).toEqual([])
  })

  it('a pinned project is listed once, even when it is also recent', () => {
    const out = projectsForSidebar([p('both', { lastActivity: daysAgo(0) })], ['both', 'both'], NOW)
    expect(out).toEqual([{ id: undefined, slug: 'both', name: 'both full title', pinned: true }])
  })

  it('caps the recent half', () => {
    const many = Array.from({ length: 20 }, (_, i) => p(`r${i}`, { lastActivity: daysAgo(i % 10) }))
    expect(projectsForSidebar(many, [], NOW)).toHaveLength(RECENT_PROJECT_LIMIT)
  })
})
