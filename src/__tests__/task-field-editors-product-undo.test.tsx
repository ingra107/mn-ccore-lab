// Undo of a project move restores the PREVIOUS PRODUCT too, null included (s72).
// A same-project pair move (Trial ops -> Protocol paper) sends both ids; its
// undo must send the old product_id, not leave the new product on the task.
//
// Runs in real Chromium (vitest.config.ts browser mode).

import { useEffect } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { useTaskFieldEditors } from '../hooks/useTaskFieldEditors'
import { mount, cleanupMountsAfterEach } from './testMount'

const mutate = vi.fn()
let undo: (() => void) | null = null

vi.mock('../hooks/useMutations', () => ({ useUpdateTask: () => ({ mutate }) }))
vi.mock('../components/UndoToast', () => ({
  useUndoToast: () => ({ showUndo: (_label: string, fn: () => void) => { undo = fn } }),
}))

cleanupMountsAfterEach()
afterEach(() => { mutate.mockReset(); undo = null; held.editors = undefined })

const held: { editors?: ReturnType<typeof useTaskFieldEditors> } = {}
function Probe() {
  const ed = useTaskFieldEditors()
  useEffect(() => { held.editors = ed })
  return null
}

describe('onProjectChange undo', () => {
  it('a same-project pair move undoes to the previous product', async () => {
    await mount(<Probe />, { ready: () => held.editors !== undefined, label: 'Probe' })
    held.editors!.onProjectChange('t1', 'adhere', 'adhere', 'prd_paper', 'prd_ops')
    expect(mutate).toHaveBeenLastCalledWith({ id: 't1', fields: { project_id: 'adhere', product_id: 'prd_paper' } })
    undo!()
    expect(mutate).toHaveBeenLastCalledWith({ id: 't1', fields: { project_id: 'adhere', product_id: 'prd_ops' } })
  })

  it('a move out of a project undoes with the old product, and a move from no project undoes to none', async () => {
    await mount(<Probe />, { ready: () => held.editors !== undefined, label: 'Probe' })
    held.editors!.onProjectChange('t1', 'adhere', 'cci', null, 'prd_ops')
    expect(mutate).toHaveBeenLastCalledWith({ id: 't1', fields: { project_id: 'cci' } })
    undo!()
    expect(mutate).toHaveBeenLastCalledWith({ id: 't1', fields: { project_id: 'adhere', product_id: 'prd_ops' } })

    held.editors!.onProjectChange('t2', null, 'cci')
    undo!()
    expect(mutate).toHaveBeenLastCalledWith({ id: 't2', fields: { project_id: null, product_id: null } })
  })
})
