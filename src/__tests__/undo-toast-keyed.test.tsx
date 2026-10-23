// Keyed toasts (2026-10-23): repeated +7d clicks in a bulk date picker each
// showed their own toast, and the pile covered the Deadlines bulk bar. A toast
// with a key now replaces the one still showing under that key, and a replaced
// Undo chains so it lands back where the first click started.
//
// Real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect, vi } from 'vitest'
import { useEffect } from 'react'
import { UndoToastProvider, useUndoToast } from '../components/UndoToast'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()

type Api = ReturnType<typeof useUndoToast>
// The provider's API, handed out through a ref-like holder after commit.
const holder: { api?: Api } = {}
function Grab() {
  const toastApi = useUndoToast()
  useEffect(() => { holder.api = toastApi }, [toastApi])
  return <span data-testid="ready" />
}

async function render() {
  holder.api = undefined
  await mount(<UndoToastProvider><Grab /></UndoToastProvider>, { ready: (h) => h.querySelector('[data-testid="ready"]'), label: 'toast provider' })
  await waitFor(() => holder.api, 'toast api')
}
const api = new Proxy({} as Api, { get: (_t, k) => holder.api![k as keyof Api] })
const toasts = (id: string) => [...document.querySelectorAll(`[data-testid="${id}"]`)]

describe('keyed toasts', () => {
  it('a keyed success replaces the one still showing; unkeyed ones still stack', async () => {
    await render()
    api.showSuccess('Due Oct 30 for 2', undefined, 'bulk-due')
    api.showSuccess('Due Nov 6 for 2', undefined, 'bulk-due')
    await waitFor(() => toasts('success-toast').some((t) => t.textContent?.includes('Nov 6')), 'second toast')
    expect(toasts('success-toast')).toHaveLength(1)
    api.showSuccess('one')
    api.showSuccess('two')
    await waitFor(() => toasts('success-toast').length === 3, 'unkeyed stack')
  })

  it('a replaced Undo chains: newest reversal first, then the earlier one', async () => {
    await render()
    const order: string[] = []
    api.showUndo('Due Oct 30', () => order.push('undo-1'), 'bulk-due')
    api.showUndo('Due Nov 6', () => order.push('undo-2'), 'bulk-due')
    await waitFor(() => toasts('undo-toast').some((t) => t.textContent?.includes('Nov 6')), 'second undo toast')
    expect(toasts('undo-toast')).toHaveLength(1)
    const undo = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Undo')!
    undo.click()
    expect(order).toEqual(['undo-2', 'undo-1'])
  })

  it('after the keyed toast times out, the next one starts a fresh chain', async () => {
    await render()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const order: string[] = []
      api.showUndo('first', () => order.push('undo-1'), 'k')
      vi.advanceTimersByTime(5100)
      api.showUndo('second', () => order.push('undo-2'), 'k')
      vi.useRealTimers()
      await waitFor(() => toasts('undo-toast').some((t) => t.textContent?.includes('second')), 'second toast')
      ;[...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Undo')!.click()
      expect(order).toEqual(['undo-2'])
    } finally {
      vi.useRealTimers()
    }
  })
})
