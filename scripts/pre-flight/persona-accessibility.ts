/**
 * Persona: accessibility (keyboard-only + screen reader semantics).
 *
 * Role: user who navigates by keyboard alone, or whose screen reader
 * reads page structure. Verifies focus outlines, ARIA roles, skip links,
 * landmark regions, modal focus trapping.
 *
 * Run: npx tsx scripts/pre-flight/persona-accessibility.ts
 */
import { openPersona, closePersona, section, pass, record, snap, goto } from './shared'

async function main() {
  const s = await openPersona({
    persona: 'accessibility',
    role: 'Keyboard-only + screen reader user',
    colorScheme: 'dark',
  })

  try {
    section(s, '1  /my-tasks has skip-to-content link')
    await goto(s, '/portal/my-tasks')
    await snap(s, 'my-tasks-a11y')
    const skipLink = await s.page.locator('a').filter({ hasText: /skip to (content|main)/i }).first().count()
    if (skipLink > 0) pass(s, 'Skip-to-content link present')
    else record(s, { id: 'NO-SKIP-LINK', severity: 'P2', scenario: 'Skip-to-content anchor', observed: 'not found', expected: 'first focusable element' })

    section(s, '2  Every page has <main> landmark')
    const pages = ['/portal/dashboard', '/portal/my-tasks', '/portal/my-tasks', '/portal/projects', '/portal/manuscripts', '/portal/meetings', '/portal/deadlines', '/portal/ideas', '/portal/decisions']
    for (const p of pages) {
      await goto(s, p)
      const hasMain = await s.page.locator('main, [role="main"]').count().catch(() => 0)
      if (hasMain === 0) record(s, { id: 'NO-MAIN', severity: 'P2', scenario: `${p} has <main> landmark`, observed: '0 main elements', expected: '≥1 <main> or role=main' })
    }
    pass(s, `Checked <main> landmark on ${pages.length} pages`)

    section(s, '3  Tab through /my-tasks — focus is visible')
    await goto(s, '/portal/my-tasks')
    await s.page.waitForTimeout(1200)
    let visibleFocusCount = 0
    let unfocusableCount = 0
    for (let i = 0; i < 10; i++) {
      await s.page.keyboard.press('Tab')
      await s.page.waitForTimeout(100)
      const hasOutline = await s.page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return false
        const cs = window.getComputedStyle(el as Element)
        const outline = cs.outlineWidth
        const boxShadow = cs.boxShadow
        return (outline !== '0px' && outline !== 'none') || (boxShadow !== 'none' && boxShadow.length > 5)
      }).catch(() => false)
      if (hasOutline) visibleFocusCount++
      else unfocusableCount++
    }
    if (visibleFocusCount >= 7) pass(s, `${visibleFocusCount}/10 Tab stops have visible focus`)
    else record(s, { id: 'FOCUS-OUTLINES', severity: 'P1', scenario: 'Keyboard focus outlines visible', observed: `${visibleFocusCount}/10 with outline`, expected: '≥7/10 have visible focus indicator' })

    section(s, '4  Modals trap focus')
    // Open Create Task modal
    const newBtn = s.page.locator('button').filter({ hasText: /New Task/i }).first()
    if (await newBtn.count()) {
      await newBtn.click({ force: true }).catch(() => {})
      // Wait for modal's autoFocus useEffect to land — React applies focus
      // AFTER render+effect tick. Prior test tabbed too early and landed on
      // the triggering button outside the modal.
      await s.page.waitForTimeout(1200)
      const hasAriaModal = await s.page.locator('[role="dialog"][aria-modal="true"]').count().catch(() => 0)
      if (hasAriaModal > 0) pass(s, 'Create Task modal has role=dialog aria-modal=true')
      else record(s, { id: 'MODAL-ARIA', severity: 'P1', scenario: 'Modal has aria-modal', observed: 'no role=dialog aria-modal=true', expected: 'present' })

      // Verify autofocus actually landed inside the modal before testing trap
      const modalSelector = '[role="dialog"]'
      const focusStartsInside = await s.page.evaluate((sel) => {
        const modal = document.querySelector(sel)
        return modal ? modal.contains(document.activeElement) : false
      }, modalSelector).catch(() => false)
      if (!focusStartsInside) {
        record(s, { id: 'MODAL-AUTOFOCUS', severity: 'P1', scenario: 'Modal autofocuses first field', observed: 'focus not inside modal after open', expected: 'autoFocus lands on first input' })
      } else {
        pass(s, 'Modal autofocus lands inside the dialog')
      }

      // Tab — focus should stay within modal (only if autofocus landed first)
      if (focusStartsInside) {
        let leakedFocus = false
        for (let i = 0; i < 15; i++) {
          await s.page.keyboard.press('Tab')
          await s.page.waitForTimeout(80)
          const inside = await s.page.evaluate((sel) => {
            const modal = document.querySelector(sel)
            return modal ? modal.contains(document.activeElement) : false
          }, modalSelector).catch(() => false)
          if (!inside) { leakedFocus = true; break }
        }
        if (!leakedFocus) pass(s, 'Focus stays trapped inside Create Task modal through 15 Tab presses')
        else record(s, { id: 'MODAL-FOCUS-LEAK', severity: 'P1', scenario: 'Modal focus trap', observed: 'focus escaped modal', expected: 'focus cycles within modal' })
      }
      await s.page.keyboard.press('Escape').catch(() => {})
    }

    section(s, '5  Every form field has associated <label> or aria-label')
    await goto(s, '/portal/my-tasks')
    await s.page.waitForTimeout(800)
    const unlabeled = await s.page.evaluate(() => {
      const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select')
      const bad: string[] = []
      for (const el of inputs) {
        const id = el.getAttribute('id')
        const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
        const placeholder = el.getAttribute('placeholder')
        const wrappedLabel = el.closest('label')
        const externalLabel = id && document.querySelector(`label[for="${id}"]`)
        if (!aria && !wrappedLabel && !externalLabel && !placeholder) {
          bad.push(`<${el.tagName.toLowerCase()}> id=${id || 'none'}`)
        }
      }
      return bad.slice(0, 5)
    })
    if (unlabeled.length === 0) pass(s, 'All form fields on /my-tasks have a label/aria-label/placeholder')
    else record(s, { id: 'UNLABELED-FIELDS', severity: 'P2', scenario: 'Form fields labeled', observed: `${unlabeled.length} unlabeled: ${unlabeled.join(', ')}`, expected: 'all fields labeled' })

    section(s, '6  Heading hierarchy — no skipped levels (h1 → h3 without h2)')
    await goto(s, '/portal/dashboard')
    await s.page.waitForTimeout(1500)
    const headings = await s.page.evaluate(() => {
      const hs = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      return hs.map((h) => ({ level: parseInt(h.tagName.slice(1)), text: (h as HTMLElement).innerText.slice(0, 40) }))
    })
    let skipped = 0
    for (let i = 1; i < headings.length; i++) {
      if (headings[i].level > headings[i - 1].level + 1) skipped++
    }
    if (skipped === 0) pass(s, `${headings.length} headings, no skipped levels`)
    else record(s, { id: 'HEADING-SKIP', severity: 'P2', scenario: 'Heading hierarchy', observed: `${skipped} skipped levels`, expected: 'sequential h1→h2→h3' })

    section(s, '7  Images have alt text (or role=presentation)')
    await goto(s, '/team')
    await s.page.waitForTimeout(1500)
    const imgsNoAlt = await s.page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'))
      return imgs.filter((i) => !i.alt && i.getAttribute('role') !== 'presentation' && i.getAttribute('aria-hidden') !== 'true').length
    })
    if (imgsNoAlt === 0) pass(s, 'All /team images have alt text or role=presentation')
    else record(s, { id: 'IMGS-NO-ALT', severity: 'P2', scenario: 'Team page image alt text', observed: `${imgsNoAlt} images without alt`, expected: '0 (all have alt or role=presentation)' })

    section(s, '8  aria-live regions — notification count + count badges announce')
    const liveRegions = await s.page.locator('[aria-live]').count().catch(() => 0)
    if (liveRegions > 0) pass(s, `${liveRegions} aria-live regions for screen reader announcements`)
    else record(s, { id: 'NO-ARIA-LIVE', severity: 'P2', scenario: 'aria-live regions present', observed: '0 elements', expected: 'PageHeader count/subtitle should be live' })

    section(s, '9  Color contrast — body text on default background')
    // Inline the luma calc without a helper function — Playwright's page.evaluate
    // esbuild wrapper chokes on nested function declarations (emits __name refs).
    const contrastIssues = await s.page.evaluate(() => {
      const bad: string[] = []
      const els = Array.from(document.querySelectorAll('p, span, div, a, button, li'))
      const bodyCs = window.getComputedStyle(document.body)
      const bodyMatch = bodyCs.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      const bgLuma = bodyMatch
        ? (0.2126 * parseInt(bodyMatch[1]) + 0.7152 * parseInt(bodyMatch[2]) + 0.0722 * parseInt(bodyMatch[3])) / 255
        : 0.5
      for (const el of els.slice(0, 500)) {
        const cs = window.getComputedStyle(el as Element)
        if (cs.color === 'rgba(0, 0, 0, 0)' || cs.color === 'transparent') continue
        const text = (el as HTMLElement).innerText?.trim()
        if (!text) continue
        const m = cs.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        if (!m) continue
        const textLuma = (0.2126 * parseInt(m[1]) + 0.7152 * parseInt(m[2]) + 0.0722 * parseInt(m[3])) / 255
        const ratio = (Math.max(textLuma, bgLuma) + 0.05) / (Math.min(textLuma, bgLuma) + 0.05)
        if (ratio < 3.0) bad.push(`"${text.slice(0, 20)}" ratio=${ratio.toFixed(2)}`)
      }
      return bad.slice(0, 5)
    })
    if (contrastIssues.length === 0) pass(s, 'No extreme low-contrast text detected on /team (ratio ≥3)')
    else record(s, { id: 'LOW-CONTRAST', severity: 'P2', scenario: 'Text contrast sanity', observed: `${contrastIssues.length} low-contrast: ${contrastIssues.join(', ')}`, expected: 'all text ≥3:1 (informal)' })
  } catch (e) {
    record(s, { id: 'FATAL', severity: 'P0', scenario: 'Persona journey aborted', observed: (e as Error).message.slice(0, 200), expected: 'journey completes' })
  } finally {
    const result = await closePersona(s)
    console.log(`\n[accessibility] DONE — ${result.passCount} pass, ${result.findings.length} findings`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
