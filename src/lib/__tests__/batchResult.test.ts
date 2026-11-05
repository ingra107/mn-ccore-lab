import { describe, it, expect, vi } from 'vitest'
import { readBatchResult, reportBatch } from '../batchResult'

const body = (applied: string[], failed: { id: string; reason: string }[]) =>
  ({ data: { ok: failed.length === 0, count: applied.length, applied, failed } })
const toast = () => ({ showSuccess: vi.fn(), showError: vi.fn() })
const done = (n: number) => `Completed ${n} task${n === 1 ? '' : 's'}`

describe('readBatchResult', () => {
  it('reads applied and failed off the route answer', () => {
    const r = readBatchResult(body(['a'], [{ id: 'b', reason: 'x' }]), ['a', 'b'])
    expect(r.applied).toEqual(['a'])
    expect(r.failed).toEqual([{ id: 'b', reason: 'x' }])
  })

  it('counts what was sent and not named as failed as applied', () => {
    expect(readBatchResult({ data: [] }, ['a', 'b'])).toEqual({ applied: ['a', 'b'], failed: [] })
  })

  it('ok:false with no failed rows names every id, so it cannot read as success', () => {
    const r = readBatchResult({ data: { ok: false } }, ['a', 'b'])
    expect(r.applied).toEqual([])
    expect(r.failed.map((f) => f.id)).toEqual(['a', 'b'])
  })
})

describe('reportBatch', () => {
  it('all landed: the success words, no refused ids', () => {
    const t = toast()
    expect(reportBatch(t, body(['a', 'b'], []), ['a', 'b'], done)).toEqual([])
    expect(t.showSuccess).toHaveBeenCalledWith('Completed 2 tasks')
    expect(t.showError).not.toHaveBeenCalled()
  })

  it('partly landed: one error naming both counts and the reason past its status prefix', () => {
    const t = toast()
    expect(reportBatch(t, body(['a', 'c'], [{ id: 'b', reason: 'conflict — the task changed' }]), ['a', 'b', 'c'], done)).toEqual(['b'])
    expect(t.showError).toHaveBeenCalledWith('Completed 2 tasks. 1 not changed: the task changed')
    expect(t.showSuccess).not.toHaveBeenCalled()
  })

  it('none landed: claims nothing', () => {
    const t = toast()
    reportBatch(t, body([], [{ id: 'a', reason: 'no' }, { id: 'b', reason: 'no' }]), ['a', 'b'], done)
    expect(t.showError).toHaveBeenCalledWith('2 tasks not changed: no')
  })

  it('a caller with no success words says nothing on success, and still reports a refusal', () => {
    const t = toast()
    reportBatch(t, body(['a'], []), ['a'])
    expect(t.showSuccess).not.toHaveBeenCalled()
    reportBatch(t, body([], [{ id: 'a', reason: 'no' }]), ['a'])
    expect(t.showError).toHaveBeenCalledWith('1 task not changed: no')
  })

  it('distinct reasons are listed, briefly', () => {
    const t = toast()
    reportBatch(t, body([], [{ id: 'a', reason: 'one' }, { id: 'b', reason: 'two' }, { id: 'c', reason: 'three' }]), ['a', 'b', 'c'])
    expect(t.showError).toHaveBeenCalledWith('3 tasks not changed: one; two; and 1 more reason')
  })
})
