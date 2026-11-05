// A FilterChip near the bottom of the screen (the foot of the phone Filters sheet, with
// a 71-project list) opens upward, whole and on screen, not off the bottom.
import '../index.css'
import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { FilterChip } from '../pages/MyTasks/components/FilterChip'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(async () => { await page.viewport(1280, 900) })

const LONG = [{ v: null, l: 'All' }, ...Array.from({ length: 71 }, (_, i) => ({ v: `p${i}`, l: `Project number ${i}` }))]

async function openAt(top: number, options = LONG) {
  await page.viewport(390, 844)
  const host = await mount(
    <div style={{ position: 'fixed', top, left: 16, width: 358 }}><FilterChip label="Project" value={null} options={options} onChange={() => {}} /></div>,
    { ready: (h) => h.querySelector('.tk-fsel button'), label: 'chip' },
  )
  host.querySelector<HTMLButtonElement>('.tk-fsel button')!.click()
  const menu = await waitFor(() => document.querySelector<HTMLElement>('[role="listbox"]'), 'the menu')
  return { trigger: host.querySelector<HTMLElement>('.tk-fsel')!.getBoundingClientRect(), menu }
}

describe('FilterChip menu placement', () => {
  it('flips above the trigger when the space below is short, and stays on screen', async () => {
    const { trigger, menu } = await openAt(700)
    const r = menu.getBoundingClientRect()
    expect(r.bottom).toBeLessThanOrEqual(trigger.top)
    expect(r.top).toBeGreaterThanOrEqual(0)
    expect(r.height).toBeGreaterThan(240)
    expect(menu.scrollHeight).toBeGreaterThan(menu.clientHeight)
  })

  it('a short list opens right against the trigger, not floating away from it', async () => {
    const { trigger, menu } = await openAt(700, LONG.slice(0, 3))
    const gap = trigger.top - menu.getBoundingClientRect().bottom
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(gap).toBeLessThanOrEqual(6)
  })

  it('opens below when there is room', async () => {
    const { trigger, menu } = await openAt(100)
    expect(menu.getBoundingClientRect().top).toBeGreaterThanOrEqual(trigger.bottom)
    expect(menu.getBoundingClientRect().bottom).toBeLessThanOrEqual(844)
  })
})
