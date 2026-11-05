// PageTabs — one portal page that hosts several former pages as tabs
// (nav redesign, 2026-10-09): Library = Artifacts + Research Digest,
// Projects = Projects + Ideas, Meetings = Meetings + Transcripts, Lab Overview
// = Overview + Team + Pipeline + Mentees + Cascade.
//
// The active tab lives in the URL (`?tab=<key>`), so every tab is a real,
// shareable address and the old routes redirect straight to one. The first
// visible tab is the default and carries no `?tab=`. A tab the viewer may not
// see (hidden) or an unknown key falls back to the default rather than
// showing an empty page.
//
// Each tab renders the page component it replaced, so nothing the old page did
// is lost. Switching tabs drops the other query params: they belonged to the tab
// you left (its filters, its ?create=true), except the ones the page lists in
// keepParams.
//
// The tray sits below the page title (Nick's mock, 2026-11-05): the tab's PageHeader
// draws it, through PageTabsContext, so the title and the tray keep their places when
// the tab changes. Every tab's page titles itself with the host's word.

import { useCallback, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SegmentedToggle } from './ui/SegmentedToggle'
import { PageTabsContext, resolveTab } from '../lib/pageTabs'
import type { PageTab } from '../lib/pageTabs'

export default function PageTabs({ title, tabs, ariaLabel, keepParams = [] }: {
  /** The page's title, the nav word. It does not change with the tab. */
  title: string
  tabs: PageTab[]
  ariaLabel: string
  /** Query params that belong to the page, not to a tab, and survive a tab switch (the Lab overview's `?week=`). */
  keepParams?: string[]
}) {
  const [params, setParams] = useSearchParams()
  const visible = tabs.filter((t) => !t.hidden)
  const active = resolveTab(tabs, params.get('tab'))
  const [claims, setClaims] = useState(0)
  const switched = useRef(false)

  const select = (key: string) => {
    if (key === active.key) return
    const next = new URLSearchParams()
    for (const k of keepParams) {
      const v = params.get(k)
      if (v !== null) next.set(k, v)
    }
    if (key !== visible[0].key) next.set('tab', key)
    switched.current = true
    setParams(next)
  }

  const claim = useCallback(() => {
    setClaims((n) => n + 1)
    // The tray remounts with the new tab's header. Keep the keyboard on it.
    if (switched.current && document.activeElement === document.body) {
      document.querySelector<HTMLElement>('[data-testid="page-tabs"] button.tk-on')?.focus()
    }
    return () => setClaims((n) => n - 1)
  }, [])

  const toggle = visible.length > 1 ? (
    <SegmentedToggle
      ariaLabel={ariaLabel}
      options={visible.map((t) => ({ value: t.key, label: t.label }))}
      value={active.key}
      onChange={select}
      // A short tray fits on a phone, at the height of the view switch beside it.
      scrollable={visible.length > 3}
    />
  ) : null
  return (
    <>
      {toggle && claims === 0 && (
        <div className="content-container page-tabs" data-testid="page-tabs" style={{ display: 'flex', minWidth: 0, paddingTop: 4, marginBottom: 16 }}>
          {toggle}
        </div>
      )}
      <PageTabsContext.Provider value={{ title, tray: toggle, claim }}>
        <div key={active.key} role="tabpanel" aria-label={active.label}>
          {active.render()}
        </div>
      </PageTabsContext.Provider>
    </>
  )
}
