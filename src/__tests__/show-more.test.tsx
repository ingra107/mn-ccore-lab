// ShowMoreButton (O2B, 2026-10-14): on the trajectory page, "Show 10 more
// projects" grew the list but "Show fewer" appeared only once every row was
// showing, so a list opened part way could not fold back.
//
// Real Chromium (vitest.config.ts browser mode).

import { describe, it, expect } from 'vitest'
import { useShowMore } from '../hooks/useShowMore'
import { ShowMoreButton } from '../components/ui/ShowMore'
import { mount, waitFor, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const ITEMS = Array.from({ length: 26 }, (_, i) => `row ${i}`)

function List() {
  const list = useShowMore(ITEMS, 10)
  return (
    <div>
      <ul>{list.visible.map((x) => <li key={x}>{x}</li>)}</ul>
      <ShowMoreButton list={list} noun="projects" />
    </div>
  )
}

const buttons = (h: HTMLElement) => [...h.querySelectorAll('button')].map((b) => b.textContent)
const rows = (h: HTMLElement) => h.querySelectorAll('li').length

describe('ShowMoreButton', () => {
  it('offers "Show fewer" as soon as the list has grown, not only when it is complete', async () => {
    const h = await mount(<List />, { ready: (x) => x.querySelectorAll('li').length === 10, label: 'List' })
    expect(buttons(h)).toEqual(['Show 10 more projects (16 hidden)'])

    ;(h.querySelector('button') as HTMLButtonElement).click()
    await waitFor(() => rows(h) === 20 || null, '20 rows')
    expect(buttons(h)).toEqual(['Show 6 more projects (6 hidden)', 'Show fewer'])

    ;([...h.querySelectorAll('button')].find((b) => b.textContent === 'Show fewer') as HTMLButtonElement).click()
    await waitFor(() => rows(h) === 10 || null, 'back to 10 rows')
    expect(buttons(h)).toEqual(['Show 10 more projects (16 hidden)'])
  })
})
