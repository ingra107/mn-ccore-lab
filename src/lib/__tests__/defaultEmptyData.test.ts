import { describe, it, expect } from 'vitest'
// @ts-expect-error -- plain .mjs gate, no types
import { findDefaultEmptyData } from '../../../scripts/check-default-empty-data.mjs'

const hits = (src: string): number => findDefaultEmptyData('x.tsx', src).length

describe('check-default-empty-data', () => {
  it('flags a default [] on query data with no loading read', () => {
    expect(hits('const { data: tasks = [] } = useTasks()')).toBe(1)
  })
  it('flags it inside a multi-line destructure', () => {
    expect(hits('const {\n  data: tasks = [],\n  refetch,\n} = useTasks()')).toBe(1)
  })
  it('lets a destructure that also reads isPending / isLoading through', () => {
    expect(hits('const { data: tasks = [], isPending } = useTasks()')).toBe(0)
    expect(hits('const { data: tasks = [], isLoading: tl } = useTasks()')).toBe(0)
  })
  it('lets a marked line through, and only that line', () => {
    expect(hits('const { data: t = [] } = useTeam() // empty-data-ok: label lookup')).toBe(0)
    expect(hits('const { data: t = [] } = useTeam()\nconst { data: u = [] } = useX() // empty-data-ok: y')).toBe(1)
  })
  it('ignores a comment and a default that is not on data', () => {
    expect(hits('// const { data: t = [] } = useTeam()')).toBe(0)
    expect(hits('const { rows = [] } = props')).toBe(0)
  })
  it('reports the line of the property', () => {
    const r = findDefaultEmptyData('x.tsx', 'a\nconst { data: t = [] } = useTeam()')
    expect(r[0].line).toBe(2)
  })
})
