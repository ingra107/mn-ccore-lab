import { describe, it, expect } from 'vitest'
import { resolveTab } from '../pageTabs'

const tabs = [
  { key: 'overview', label: 'Overview', render: () => null },
  { key: 'pi-analytics', label: 'PI Analytics', render: () => null, hidden: true },
  { key: 'mentee-milestones', label: 'Mentee Milestones', render: () => null },
]

describe('resolveTab', () => {
  it('no ?tab= is the first tab', () => {
    expect(resolveTab(tabs, null).key).toBe('overview')
  })
  it('a named visible tab is that tab', () => {
    expect(resolveTab(tabs, 'mentee-milestones').key).toBe('mentee-milestones')
  })
  it('a hidden or unknown tab falls back to the first, never an empty page', () => {
    expect(resolveTab(tabs, 'pi-analytics').key).toBe('overview')
    expect(resolveTab(tabs, 'nope').key).toBe('overview')
  })
})
