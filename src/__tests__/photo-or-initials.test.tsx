// A person's photo that fails to load falls back to initials, and no surface
// draws a person's photo through a bare <img> without that fallback (H3).

import { describe, it, expect } from 'vitest'
import { PhotoOrInitials } from '../components/PhotoOrInitials'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

describe('PhotoOrInitials', () => {
  it('shows the photo when it loads', async () => {
    const host = await mount(<PhotoOrInitials src={PIXEL} alt="Nate" fallback={<span>NM</span>} />, { ready: (h) => h.querySelector('img'), label: 'photo' })
    expect(host.querySelector('img')?.getAttribute('alt')).toBe('Nate')
    expect(host.textContent).toBe('')
  })

  it('shows the initials when the photo fails, with no broken image left behind', async () => {
    const host = await mount(<PhotoOrInitials src="data:image/png;base64,notapng" alt="Nate" fallback={<span>NM</span>} />, { ready: (h) => h.querySelector('span'), label: 'initials' })
    expect(host.querySelector('img')).toBeNull()
    expect(host.textContent).toBe('NM')
  })

  it('shows the initials when there is no photo', async () => {
    const host = await mount(<PhotoOrInitials src={undefined} alt="Nate" fallback={<span>NM</span>} />, { ready: (h) => h.querySelector('span'), label: 'initials' })
    expect(host.textContent).toBe('NM')
  })
})

describe('person photos', () => {
  it('no component renders a photoUrl through a bare <img>', () => {
    const files = import.meta.glob(['../**/*.tsx', '!../**/__tests__/**', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const bare = Object.entries(files).filter(([, src]) => /<img\s[^>]*src=\{[^}]*photoUrl/s.test(src)).map(([path]) => path)
    expect(bare).toEqual([])
  })
})
