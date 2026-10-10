import { describe, expect, it } from 'vitest'
import { breakpointForWidth, buildDefaultLayouts } from './dashboardLayout'

describe('breakpointForWidth', () => {
  it('maps a measured container width to the breakpoint react-grid-layout would pick', () => {
    expect(breakpointForWidth(390)).toBe('xs')
    expect(breakpointForWidth(479)).toBe('xs')
    expect(breakpointForWidth(480)).toBe('sm')
    expect(breakpointForWidth(720)).toBe('md')
    expect(breakpointForWidth(1000)).toBe('lg')
  })
})

describe('default layouts at the phone breakpoint', () => {
  it('give every card the full 3 columns', () => {
    const xs = buildDefaultLayouts([{ id: 'a' }, { id: 'b' }, { id: 'c' }]).xs ?? []
    expect(xs.map(l => l.w)).toEqual([3, 3, 3])
  })
})
