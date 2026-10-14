// A Gantt bar drag writes grant dates, so it must never start by accident
// (overnight mobile audit 2026-10-14: on a 390px phone a scroll that started
// on the K23 bar, 40px down and 4px right, posted new award dates). Runs the
// real component in Chromium and drives it with dispatched PointerEvents.
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GrantGantt, { type GanttMove } from './GrantGantt'
import type { GrantProduct } from '../../lib/grants'
import { mount, cleanupMountsAfterEach } from '../../__tests__/testMount'

cleanupMountsAfterEach()

const K23 = {
  id: 'p-k23', project_id: 'proj', project_slug: 'k23', project_title: 'K23', project_short_name: 'K23', pi: null,
  kind: 'award', kind_label: 'Award', stage: 'active', stage_label: 'Active', stage_ordinal: 1, stage_is_terminal: 0,
  title: null, short_name: 'K23', venue: 'NHLBI K23', due_date: null, deadline: null,
  period_start: '2022-12-15', period_end: '2027-11-30', amount_usd: null, is_home: 1, lineage_rank: 0,
  grew_from_id: null, seq: 0, bucket: 'active', milestones: [],
} as unknown as GrantProduct

async function setup() {
  const onMove = vi.fn<(m: GanttMove) => void>()
  const host = await mount(
    <MemoryRouter><GrantGantt rows={[K23]} today="2026-10-14" onMove={onMove} /></MemoryRouter>,
    { ready: (h) => h.querySelector('[data-testid="gantt-bar-p-k23"]'), label: 'GrantGantt', width: '390px' },
  )
  const bar = host.querySelector<HTMLElement>('[data-testid="gantt-bar-p-k23"]')!
  // A dispatched event has no live pointer behind it, so the browser refuses
  // to capture it; capture is not what these tests are about.
  bar.setPointerCapture = () => {}
  // The track width is measured in a layout effect; wait for it.
  await expect.poll(() => bar.getBoundingClientRect().width).toBeGreaterThan(0)
  const r = bar.getBoundingClientRect()
  const x = r.left + r.width / 2, y = r.top + r.height / 2
  // One event per frame, as a real finger or mouse delivers them, so React
  // renders between events the way it does on a device.
  const fire = async (type: string, pointerType: string, dx: number, dy: number) => {
    bar.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType, button: 0, isPrimary: true, clientX: x + dx, clientY: y + dy }))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
  return { onMove, fire }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('GrantGantt drag gesture', () => {
  it('touch: the start of a scroll (40px down, 4px right) writes nothing', async () => {
    const { onMove, fire } = await setup()
    await fire('pointerdown', 'touch', 0, 0)
    for (let i = 1; i <= 8; i++) await fire('pointermove', 'touch', i * 0.5, i * 5)
    await fire('pointerup', 'touch', 4, 40)
    await wait(350)                                   // past the hold: a released gesture stays released
    expect(onMove).not.toHaveBeenCalled()
  })

  it('touch: jitter under 5px with no hold writes nothing', async () => {
    const { onMove, fire } = await setup()
    await fire('pointerdown', 'touch', 0, 0)
    await fire('pointermove', 'touch', 2, 1)
    await fire('pointerup', 'touch', 2, 1)
    expect(onMove).not.toHaveBeenCalled()
  })

  it('touch: press and hold, then drag right, moves the award later and keeps its length', async () => {
    const { onMove, fire } = await setup()
    await fire('pointerdown', 'touch', 0, 0)
    await wait(320)
    for (let i = 1; i <= 6; i++) await fire('pointermove', 'touch', i * 5, 0)
    await fire('pointerup', 'touch', 30, 0)
    await expect.poll(() => onMove.mock.calls.length).toBe(1)
    const { fields } = onMove.mock.calls[0][0]
    expect(fields.period_start! > '2022-12-15').toBe(true)
    expect(fields.period_end! > '2027-11-30').toBe(true)
  })

  it('mouse: 4px of travel is a click; a 60px drag moves the bar', async () => {
    const { onMove, fire } = await setup()
    await fire('pointerdown', 'mouse', 0, 0)
    await fire('pointermove', 'mouse', 4, 0)
    await fire('pointerup', 'mouse', 4, 0)
    expect(onMove).not.toHaveBeenCalled()
    await fire('pointerdown', 'mouse', 0, 0)
    for (let i = 1; i <= 6; i++) await fire('pointermove', 'mouse', i * 10, 0)
    await fire('pointerup', 'mouse', 60, 0)
    await expect.poll(() => onMove.mock.calls.length).toBe(1)
  })
})
