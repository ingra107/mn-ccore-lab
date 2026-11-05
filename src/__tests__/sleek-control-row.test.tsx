// A role="table" may own only rows (axe aria-required-children, critical, on
// Deadlines, Lanes and the phone Table: sweep audit M31). A control among the rows
// sits in a row and a cell that take no box, so the layout does not move.

import '../index.css'
import { describe, it, expect } from 'vitest'
import { SleekTable, SleekControlRow } from '../components/table/SleekRows'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

describe('SleekControlRow', () => {
  it('gives a control a row and takes no box', async () => {
    const host = await mount(
      <div style={{ width: 300 }}>
        <SleekTable columns={[]}>
          <div role="rowgroup"><SleekControlRow><button type="button">Group</button></SleekControlRow></div>
        </SleekTable>
      </div>,
      { ready: (h) => h.querySelector('button'), label: 'table' },
    )
    const group = host.querySelector('[role="rowgroup"]')!
    expect([...group.children].every((c) => c.getAttribute('role') === 'row')).toBe(true)
    expect(getComputedStyle(group.firstElementChild!).display).toBe('contents')
    expect(host.querySelector('button')!.closest('[role="cell"]')).not.toBeNull()
  })
})
