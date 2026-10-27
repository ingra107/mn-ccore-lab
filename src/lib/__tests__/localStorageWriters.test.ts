// localStorageWriters.test.ts -- a view preference that should follow the
// person goes through useUserPref (server-backed, PB #911), not a fresh
// per-browser localStorage key. Before #911 there were seven hand-rolled
// copies of "read localStorage, write localStorage, listen for storage
// events"; this keeps an eighth from landing unnoticed.
//
// Every src file that WRITES localStorage is listed below with why its state
// belongs to this browser. A new writer fails here until someone decides:
// add a family to shared/userPrefKeys.ts and call useUserPref, or add the file
// here with its reason. A listed file that stopped writing fails too, so the
// list cannot rot. (useUserPref.ts itself, the prefs cache, writes through a
// Storage handle and so is not matched here; the test reads a literal
// `localStorage.setItem(` call, which is how every writer above spells it.)

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SRC = join(__dirname, '..', '..')

const DEVICE_LOCAL: Record<string, string> = {
  'components/CollapsibleSection.tsx': 'fold state of one section',
  'components/DensityToggle.tsx': 'density follows the screen',
  'components/DeskBrokerFrame.tsx': "a desk artifact's own storage, brokered",
  'components/NeedsAttentionDashboard.tsx': 'section fold state',
  'components/PageTooltip.tsx': 'tip dismissed in this browser',
  'components/PortalLayout.tsx': 'sidebar collapse follows window width',
  'components/ReleaseRibbon.tsx': 'release ribbon dismissed in this browser',
  'components/RoundPrompt.tsx': 'prompt dismissed in this browser',
  'components/dashboard/ProjectHealthCard.tsx': 'card list/heatmap toggle (candidate to sync; ledger)',
  'components/tasks/TaskBoardView.tsx': 'board column fold state',
  'components/today/PastThoughts.tsx': 'fold state of one section',
  'components/today/ProfileSetupPrompt.tsx': 'prompt snooze in this browser',
  'components/today/rail/ProjectsCard.tsx': 'rail show-all toggle (candidate to sync; ledger)',
  'hooks/useAuth.ts': 'first-paint cache of the directory and slug',
  'hooks/useDarkMode.ts': "theme follows each machine's OS",
  'hooks/useLauncherInstalled.ts': 'whether this machine has the launcher',
  'hooks/useOnboarding.ts': 'onboarding steps seen in this browser',
  'hooks/useProjectPins.ts': 'retry list of the one-time pin import (pins are on the server)',
  'lib/dailyThoughts.ts': 'per-browser day blob, read once for migration',
  'pages/Dashboard.tsx': 'card click counts (usage telemetry)',
  'pages/MyTasks/views/LanesView.tsx': 'lane fold state',
  'pages/ProjectDetail.tsx': 'banner dismissed in this browser',
  'pages/Pulse.tsx': 'debug pause switch',
  'pages/portal/CalendarPage.tsx': 'dense-week toggle follows screen size',
  'pages/portal/IdeasPage.tsx': 'kanban/list toggle (candidate to sync; ledger)',
  'pages/portal/MeetingNotesPage.tsx': 'how-to fold state',
  'pages/portal/SearchPage.tsx': 'recent searches and jump-to history in this browser',
  'pages/portal/SettingsPage.tsx': 'the debug-items switch',
  'pages/portal/TodayPage.tsx': 'show-milestones toggle and how-to dismissal (candidate to sync; ledger)',
}

/** Rewired to useUserPref by #911: they must not reach localStorage at all. */
const SERVER_BACKED = [
  'hooks/useLabPrefs.ts', 'hooks/useSavedViews.ts', 'hooks/useTodayView.ts',
  'hooks/useTodayDueWindow.ts', 'hooks/useTableConfig.ts', 'lib/dashboardLayout.ts',
]

/** The old per-browser keys: only useUserPref.ts (which seeds them) may name them. */
const OLD_KEYS = [
  'mnccore.labprefs.v1', 'mnccore.savedViews.v1.', 'mnccore.today.dueWindow', 'table-config-',
  'mnccore-dashboard-cards', 'mnccore-dashboard-pinned', 'mnccore-dashboard-tab', 'mnccore-dashboard-version',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__') walk(p, out)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

const files = walk(SRC).map((p) => ({ rel: relative(SRC, p).split(sep).join('/'), text: readFileSync(p, 'utf8') }))
const WRITES = /localStorage\s*\.\s*setItem\s*\(/

describe('localStorage writers', () => {
  it('every file that writes localStorage is device-local by a stated reason', () => {
    const writers = files.filter((f) => WRITES.test(f.text)).map((f) => f.rel).sort()
    const unlisted = writers.filter((w) => !(w in DEVICE_LOCAL))
    expect(unlisted, 'a new localStorage writer: sync it through useUserPref, or list it with its reason').toEqual([])
    expect(Object.keys(DEVICE_LOCAL).sort(), 'a listed file no longer writes localStorage: drop it from the list').toEqual(writers)
  })

  it('the server-backed hooks do not touch localStorage', () => {
    for (const rel of SERVER_BACKED) {
      const f = files.find((x) => x.rel === rel)
      expect(f, rel).toBeDefined()
      expect(/localStorage|addEventListener\(\s*'storage'/.test(f!.text), rel).toBe(false)
    }
  })

  it('only useUserPref.ts names the old per-browser keys', () => {
    const hits = files.filter((f) => f.rel !== 'hooks/useUserPref.ts' && OLD_KEYS.some((k) => f.text.includes(k)))
    expect(hits.map((f) => f.rel)).toEqual([])
  })
})
