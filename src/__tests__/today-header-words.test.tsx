// Nick, 2026-11-05: the section inside the Today page is Timeline, so the page and
// its section do not share a name. The view toggle keeps its two words.
import { describe, it, expect } from 'vitest'
import '../index.css'
import { TodayHeader } from '../components/today/TodayHeader'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

describe('TodayHeader', () => {
  it('names the section Timeline, in both views', async () => {
    for (const activeView of ['timeline', 'agenda'] as const) {
      const host = await mount(
        <div className="tk">
          <TodayHeader open onToggleOpen={() => {}} eventCount={2} activeView={activeView} onToggleView={() => {}} hiddenCount={0} onRestore={() => {}} />
        </div>,
        { ready: (h) => h.querySelector('h2'), label: 'header' },
      )
      expect(host.querySelector('h2')?.textContent).toBe('Day')
      expect(host.querySelector('.tk-ctog')?.getAttribute('aria-label')).not.toContain('Today')
      expect([...host.querySelectorAll('.tk-seg button')].map((b) => b.textContent)).toEqual(['Timeline', 'Agenda'])
    }
  })
})
