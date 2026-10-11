/**
 * Playwright helpers for the Hub's inline-edit primitives.
 *
 * Selectors come from `prep_pages.md` Agent 3 + tonight's dry-run script
 * (scripts/e2e-validate.ts). Patterns are stable across InlineSelect /
 * InlineCellSelect / InlineDatePicker / InlineAssigneePicker.
 */
import type { Page, Locator } from '@playwright/test'

/**
 * Open an InlineSelect (or InlineCellSelect) by clicking its trigger button.
 * The trigger has `aria-haspopup="listbox"`. Returns the listbox locator.
 *
 * Robust against the post-2026-04-15 scroll-close race: scrollIntoView +
 * 150ms settle + force:true click.
 */
export async function openInlineSelect(page: Page, trigger: Locator): Promise<Locator> {
  await trigger.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(150)
  await trigger.click({ force: true })
  const listbox = page.getByRole('listbox').first()
  await listbox.waitFor({ state: 'attached', timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(120)
  return listbox
}

/**
 * Pick an option from the open listbox by label. InlineSelect renders
 * options as <button> children (NOT <li>), with role="option" on
 * InlineCellSelect variant. We try both.
 */
export async function pickOption(listbox: Locator, label: string | RegExp): Promise<boolean> {
  // InlineCellSelect uses role=option
  const byRole = listbox.getByRole('option').filter({ hasText: label }).first()
  if (await byRole.count()) {
    await byRole.click()
    return true
  }
  // InlineSelect renders plain <button>
  const byBtn = listbox.locator('button').filter({ hasText: label }).first()
  if (await byBtn.count()) {
    await byBtn.click()
    return true
  }
  return false
}

/** Convenience: open inline select + pick option in one call. */
export async function changeInlineSelect(
  page: Page,
  trigger: Locator,
  newValue: string | RegExp,
): Promise<boolean> {
  const lb = await openInlineSelect(page, trigger)
  return pickOption(lb, newValue)
}

/**
 * Find an InlineSelect button containing specific text (its current value).
 * Useful when there's no test-id and you want to find by current state
 * (e.g. "find the project's stage cell, currently showing 'Idea'").
 *
 * Returns the closest button to `nearText` if multiple match — uses
 * bounding-box vertical distance.
 */
export async function findInlineSelectByCurrentValue(
  page: Page,
  currentValue: string | RegExp,
  nearText?: Locator,
): Promise<Locator | null> {
  const candidates = page.locator('button[aria-haspopup="listbox"]').filter({ hasText: currentValue })
  const n = await candidates.count()
  if (n === 0) return null
  if (n === 1 || !nearText) return candidates.first()

  const target = await nearText.boundingBox()
  if (!target) return candidates.first()

  let bestIdx = 0
  let bestDy = Infinity
  for (let i = 0; i < n; i++) {
    const b = await candidates.nth(i).boundingBox()
    if (!b) continue
    const dy = Math.abs(b.y - target.y)
    if (dy < bestDy) {
      bestDy = dy
      bestIdx = i
    }
  }
  return bestDy < 80 ? candidates.nth(bestIdx) : candidates.first()
}

/**
 * Open InlineDatePicker. Trigger is a button containing date text or
 * "Set date". Once open, a native date input + preset buttons appear.
 */
export async function setInlineDate(
  page: Page,
  trigger: Locator,
  isoDate: string,
): Promise<boolean> {
  await trigger.scrollIntoViewIfNeeded().catch(() => {})
  await trigger.click({ force: true })
  await page.waitForTimeout(200)
  const input = page.locator('input[type="date"]').first()
  if (!(await input.count())) return false
  await input.fill(isoDate)
  await page.keyboard.press('Enter').catch(() => {})
  await page.waitForTimeout(400)
  return true
}

export async function clickInlineDatePreset(
  page: Page,
  trigger: Locator,
  presetLabel: string | RegExp,
): Promise<boolean> {
  await trigger.scrollIntoViewIfNeeded().catch(() => {})
  await trigger.click({ force: true })
  await page.waitForTimeout(200)
  const preset = page.locator('button').filter({ hasText: presetLabel }).first()
  if (!(await preset.count())) return false
  await preset.click()
  await page.waitForTimeout(400)
  return true
}

/**
 * InlineAssigneePicker — opens dropdown of team members, supports search.
 */
export async function pickAssignee(
  page: Page,
  trigger: Locator,
  memberName: string | RegExp,
): Promise<boolean> {
  await trigger.scrollIntoViewIfNeeded().catch(() => {})
  await trigger.click({ force: true })
  await page.waitForTimeout(200)
  // Search input shown when many members
  const searchInput = page.locator('input[placeholder*="Filter people" i]').first()
  if (await searchInput.count()) {
    if (typeof memberName === 'string') {
      await searchInput.fill(memberName.split(' ')[0])
      await page.waitForTimeout(150)
    }
  }
  const listbox = page.getByRole('listbox').first()
  if (await listbox.count()) {
    const opt = listbox.getByRole('option').filter({ hasText: memberName }).first()
    if (await opt.count()) {
      await opt.click()
      await page.waitForTimeout(300)
      return true
    }
  }
  // Fallback: button with the name
  const btn = page.locator('button').filter({ hasText: memberName }).first()
  if (await btn.count()) {
    await btn.click()
    return true
  }
  return false
}

/**
 * RichTextEditor (Tiptap). Edit the .ProseMirror div by clicking + typing.
 * For toolbar: click button[title="Bold"] etc.
 */
export async function fillRichText(page: Page, scope: Locator | Page, text: string): Promise<boolean> {
  const root = 'locator' in scope ? scope.locator('.ProseMirror').first() : (scope as Page).locator('.ProseMirror').first()
  if (!(await root.count())) return false
  await root.click()
  await page.keyboard.type(text)
  await page.waitForTimeout(600) // Tiptap update debounce ~500ms
  return true
}

export async function clickRichTextToolbar(page: Page, toolbarTitle: string): Promise<boolean> {
  const btn = page.locator(`button[title="${toolbarTitle}"]`).first()
  if (!(await btn.count())) return false
  await btn.click()
  return true
}

/**
 * MentionInput. Clicking textarea + typing @ should trigger autocomplete.
 * Returns true if mention got inserted (textarea text contains @<slug>).
 */
export async function insertMention(
  page: Page,
  textarea: Locator,
  mentionPrefix: string,
  pickLabel: string | RegExp,
): Promise<boolean> {
  await textarea.click()
  await textarea.fill('') // start clean
  await page.keyboard.type(`@${mentionPrefix}`)
  await page.waitForTimeout(300)
  const opt = page.locator('button').filter({ hasText: pickLabel }).first()
  if (!(await opt.count())) return false
  await opt.click()
  await page.waitForTimeout(200)
  const value = await textarea.inputValue()
  return value.includes('@') && value.toLowerCase().includes(mentionPrefix.toLowerCase())
}

/**
 * Click an element by dispatching click + mousedown directly on the
 * element via evaluate(). Bypasses Playwright's coordinate-based dispatch
 * which fires events at the spatial point — when a row visually overlaps
 * the target (virtualized list with absolute-positioned dropdowns), the
 * events go to the row, not the target. Useful inside virtualized tables.
 *
 * Also fires `mousedown` because many of the Hub's inline editors use
 * `onMouseDown` (date picker presets) so a plain click() event is missed.
 */
export async function clickViaDispatch(locator: Locator): Promise<boolean> {
  return locator.evaluate((el: HTMLElement) => {
    if (!el) return false
    const opts: MouseEventInit = { bubbles: true, cancelable: true, view: window, button: 0 }
    el.dispatchEvent(new MouseEvent('mousedown', opts))
    el.dispatchEvent(new MouseEvent('mouseup', opts))
    el.dispatchEvent(new MouseEvent('click', opts))
    return true
  }).catch(() => false)
}

/**
 * Sticky-click test: open a dropdown, scroll the parent container, verify
 * the dropdown stays open. Catches the InlineCellSelect scroll-close race.
 */
export async function verifyStickyDropdown(
  page: Page,
  trigger: Locator,
  scrollPx = 100,
): Promise<{ stayedOpen: boolean }> {
  await openInlineSelect(page, trigger)
  await page.evaluate((px: number) => window.scrollBy(0, px), scrollPx)
  await page.waitForTimeout(300)
  const listbox = page.getByRole('listbox').first()
  const stayedOpen = (await listbox.count()) > 0 && (await listbox.isVisible().catch(() => false))
  // close it cleanly
  await page.keyboard.press('Escape').catch(() => {})
  return { stayedOpen }
}
