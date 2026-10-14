// The task context menu stays on screen and above the phone tab bar.
//
// Overnight 2026-10-14 probe (390x844): the left-swipe menu opened at the row's
// bottom edge ran to y 855, 11px off screen and over the tab bar, so Archive
// was half hidden. The clamp measured getBoundingClientRect() while the open
// animation still had the menu at scale(0.95), and it clamped to innerHeight,
// not to the tab bar.

import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import TaskContextMenu from '../components/tasks/TaskContextMenu'
import type { TaskRow } from '../lib/api'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const task = {
  id: 't1', title: 'A task', status: 'todo', priority: 'medium', due_date: null,
  completed: 0, project_id: 'p',
} as unknown as TaskRow

describe('TaskContextMenu clamp', () => {
  it('a menu opened near the bottom ends above the tab bar', async () => {
    const bar = document.createElement('nav')
    bar.setAttribute('data-bottom-bar', '')
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:57px'
    document.body.appendChild(bar)
    try {
      const y = window.innerHeight - 120
      await mount(
        <MemoryRouter>
          <TaskContextMenu
            state={{ isOpen: true, position: { x: 8, y }, taskId: 't1' }}
            task={task}
            onClose={() => {}}
            onStatusChange={() => {}}
            onFieldChange={() => {}}
          />
        </MemoryRouter>,
        { ready: () => document.querySelector('[style*="position: fixed"][style*="z-index"]'), label: 'menu' },
      )
      const barTop = bar.getBoundingClientRect().top
      const menu = () => [...document.body.querySelectorAll<HTMLElement>('div')].find(d => d.style.animation.includes('contextMenuIn'))!
      // after the open animation, the menu's real box ends 8px above the bar
      await expect.poll(() => Math.round(menu().getBoundingClientRect().bottom), { timeout: 2000 }).toBeLessThanOrEqual(Math.round(barTop - 8))
      expect(menu().getBoundingClientRect().top).toBeGreaterThanOrEqual(8)
    } finally {
      bar.remove()
    }
  })
})
