// PageTabs — one portal page that hosts several former pages as tabs
// (nav redesign, 2026-10-09): Library = Artifacts + Research Digest,
// Projects = Projects + Ideas, Meetings = Meetings + Transcripts, Lab Overview
// = Overview + PI Analytics + Mentee Milestones + Deadline Cascade.
//
// The active tab lives in the URL (`?tab=<key>`), so every tab is a real,
// shareable address and the old routes redirect straight to one. The first
// visible tab is the default and carries no `?tab=`. A tab the viewer may not
// see (hidden) or an unknown key falls back to the default rather than
// showing an empty page.
//
// Each tab renders the page component it replaced, unchanged, so nothing the
// old page did is lost. Switching tabs drops the other query params: they
// belonged to the tab you left (its filters, its ?create=true).

import { useSearchParams } from 'react-router-dom'
import { SegmentedToggle } from './ui/SegmentedToggle'
import { resolveTab } from '../lib/pageTabs'
import type { PageTab } from '../lib/pageTabs'

export default function PageTabs({ tabs, ariaLabel }: { tabs: PageTab[]; ariaLabel: string }) {
  const [params, setParams] = useSearchParams()
  const visible = tabs.filter((t) => !t.hidden)
  const active = resolveTab(tabs, params.get('tab'))

  const select = (key: string) => {
    if (key === active.key) return
    const next = new URLSearchParams()
    if (key !== visible[0].key) next.set('tab', key)
    setParams(next)
  }

  return (
    <>
      {visible.length > 1 && (
        // The pill sizes to its tabs (a flex row, not a block), with a little
        // air above the hosted page's own header.
        <div className="content-container page-tabs" data-testid="page-tabs" style={{ display: 'flex', paddingTop: 4, marginBottom: 16 }}>
          <SegmentedToggle
            ariaLabel={ariaLabel}
            options={visible.map((t) => ({ value: t.key, label: t.label }))}
            value={active.key}
            onChange={select}
            scrollable
            tall
          />
        </div>
      )}
      <div key={active.key} role="tabpanel" aria-label={active.label}>
        {active.render()}
      </div>
    </>
  )
}
