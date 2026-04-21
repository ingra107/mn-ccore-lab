/**
 * Persona: first-time user (newcomer).
 *
 * Walks every page as someone who has never logged in. Captures:
 *   - Empty states with no content yet
 *   - Missing onboarding cues ("what is this?")
 *   - Pages that look broken when there's no data
 *   - Modals / menus that assume prior familiarity
 *
 * NOT an automated pass/fail — the findings are subjective UX judgments.
 * The output is screenshots + a checklist for manual polish decisions.
 *
 * Run: npx tsx scripts/pre-flight/persona-newcomer.ts
 */
import { openPersona, closePersona, section, pass, record, snap, goto } from './shared'

const TOUR_PAGES = [
  { path: '/portal/dashboard', role: 'First page after login' },
  { path: '/portal/my-tasks', role: 'Primary daily view' },
  { path: '/portal/projects', role: 'Research pipeline landing' },
  { path: '/portal/manuscripts', role: 'Manuscript pipeline' },
  { path: '/portal/meetings', role: 'Past + upcoming meetings' },
  { path: '/portal/deadlines', role: 'Calendar of due dates' },
  { path: '/portal/ideas', role: 'Idea submission board' },
  { path: '/portal/decisions', role: 'Decision log' },
  { path: '/portal/grants', role: 'Grant portfolio' },
  { path: '/portal/digest', role: 'Research digest' },
  { path: '/portal/ask', role: 'Ask the Lab — Q&A' },
  { path: '/portal/narratives', role: 'Research arcs' },
  { path: '/portal/search', role: 'Cross-surface search' },
  { path: '/team', role: 'Team directory' },
  { path: '/portal/analytics', role: 'Lab analytics' },
  { path: '/portal/personal', role: 'My Hub / personal dashboard' },
  { path: '/portal/calendar', role: 'Calendar view' },
  { path: '/portal/activity', role: 'Activity feed' },
  { path: '/publications', role: 'Publications library' },
  { path: '/network', role: 'Collaboration graph' },
  { path: '/portal/settings', role: 'Workspace settings' },
]

async function main() {
  const s = await openPersona({
    persona: 'newcomer',
    role: 'Brand-new team member — never logged in before',
  })

  try {
    for (const { path, role } of TOUR_PAGES) {
      section(s, `${path}  (${role})`)
      await goto(s, path)
      await s.page.waitForTimeout(1500)
      await snap(s, `page${path.replace(/\//g, '-')}`, 400)

      // Heuristic: does the page have ANY visible primary content?
      // The "empty page" smell is easy to spot: no headings, no data cells,
      // no clickable items beyond the sidebar nav.
      const hasHeading = await s.page.locator('main h1, main h2').first().isVisible({ timeout: 2000 }).catch(() => false)
      const hasContent = await s.page.evaluate(() => {
        const main = document.querySelector('main') || document.body
        const text = (main as HTMLElement).innerText.replace(/\s+/g, ' ').trim()
        return text.length > 100
      }).catch(() => false)
      if (!hasHeading) {
        record(s, {
          id: 'NEW-NO-HEADING',
          severity: 'P2',
          scenario: `${path} has a visible heading`,
          observed: 'no h1/h2 found in main',
          expected: 'page has a recognizable title',
        })
      }
      if (!hasContent) {
        record(s, {
          id: 'NEW-BARE-PAGE',
          severity: 'P2',
          scenario: `${path} shows meaningful content`,
          observed: '<100 chars of text in <main>',
          expected: 'helpful content or empty-state message',
        })
      } else {
        pass(s, `${path} has content`)
      }

      // Detect pages showing raw error strings that slipped through the
      // error boundary. "Failed to fetch" and "Error:" should never appear
      // in user-facing text.
      const raw = await s.page.evaluate(() => document.body.innerText).catch(() => '')
      const match = raw.match(/(Failed to fetch|Error:|TypeError|undefined is not)/)
      if (match) {
        record(s, {
          id: 'NEW-RAW-ERROR',
          severity: 'P1',
          scenario: `${path} shows raw error text`,
          observed: `"${match[0]}"`,
          expected: 'no raw error strings in page body',
        })
      }

      // Check for ANY visible link/button/input/select the user can interact
      // with. An empty page with no next-step is dead-end UX.
      const actionable = await s.page.locator('main a, main button, main input, main select').count().catch(() => 0)
      if (actionable < 1) {
        record(s, {
          id: 'NEW-NO-ACTIONS',
          severity: 'P2',
          scenario: `${path} offers at least one action`,
          observed: `0 <a> or <button> in <main>`,
          expected: '>=1 actionable element (CTA, filter, etc)',
        })
      }
    }
  } catch (e) {
    record(s, { id: 'FATAL', severity: 'P0', scenario: 'Persona journey aborted', observed: (e as Error).message.slice(0, 200), expected: 'journey completes' })
  } finally {
    const result = await closePersona(s)
    console.log(`\n[newcomer] DONE — ${result.passCount} pass, ${result.findings.length} findings`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
