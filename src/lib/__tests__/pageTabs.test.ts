import { describe, it, expect } from 'vitest'
import { resolveTab } from '../pageTabs'

const tabs = [
  { key: 'overview', label: 'Overview', render: () => null },
  { key: 'pi-only', label: 'PI only', render: () => null, hidden: true },
  { key: 'team', label: 'Team', render: () => null, aliases: ['pi-analytics'] },
  { key: 'mentees', label: 'Mentees', render: () => null, aliases: ['mentee-milestones'] },
]

describe('resolveTab', () => {
  it('no ?tab= is the first tab', () => {
    expect(resolveTab(tabs, null).key).toBe('overview')
  })
  it('a named visible tab is that tab', () => {
    expect(resolveTab(tabs, 'mentees').key).toBe('mentees')
  })
  it('an old key still opens the tab that took its place', () => {
    expect(resolveTab(tabs, 'pi-analytics').key).toBe('team')
    expect(resolveTab(tabs, 'mentee-milestones').key).toBe('mentees')
  })
  it('a hidden or unknown tab falls back to the first, never an empty page', () => {
    expect(resolveTab(tabs, 'pi-only').key).toBe('overview')
    expect(resolveTab(tabs, 'nope').key).toBe('overview')
  })
})
