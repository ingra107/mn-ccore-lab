/**
 * Dogfood session: Use the Hub as a real user, screenshot every interaction,
 * find bugs, report them via the bug report modal.
 */
import { chromium, type Page } from '@playwright/test'
import { writeFileSync } from 'fs'

const BASE = 'https://mn-ccore-lab.pages.dev'
const OUT = 'review/dogfood'
let stepNum = 0

async function snap(page: Page, label: string, waitMs = 1500) {
  await page.waitForTimeout(waitMs)
  stepNum++
  const name = `${String(stepNum).padStart(2, '0')}-${label}`
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`  [${name}]`)
  return name
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()
  page.on('pageerror', (err) => {
    if (!err.message.includes('WebSocket') && !err.message.includes('hub-realtime'))
      console.log(`  !! PAGE ERROR: ${err.message.slice(0, 100)}`)
  })

  const findings: string[] = []

  // ========================================
  // ACTION 1: Create a task via modal
  // ========================================
  console.log('\n=== ACTION 1: Create task via modal ===')
  await page.goto(`${BASE}/my-tasks`, { waitUntil: 'load' })
  await snap(page, 'mytasks-initial')

  // Click + New Task button
  const newTaskBtn = page.locator('button').filter({ hasText: /New Task/ }).first()
  await newTaskBtn.click()
  await snap(page, 'create-task-modal-open')

  // Fill the form
  await page.locator('[data-testid="task-title-input"]').fill('test_delete_Dogfood: verify task creation flow')

  // Select owner by id
  const ownerSelect = page.locator('#task-assignee')
  await ownerSelect.selectOption('nick')
  await snap(page, 'create-task-filled')

  // Submit
  await page.locator('[data-testid="task-submit"]').click({ timeout: 5000 })
  await snap(page, 'create-task-submitted', 2000)

  // Check if task appears in list
  const newTask = page.locator('text=test_delete_Dogfood')
  const taskVisible = await newTask.first().isVisible({ timeout: 5000 }).catch(() => false)
  console.log(`  Task visible after creation: ${taskVisible}`)
  if (!taskVisible) findings.push('ACTION 1: Created task not visible in list after submit')

  // ========================================
  // ACTION 2: Click task → detail panel → edit status
  // ========================================
  console.log('\n=== ACTION 2: Task detail panel + status edit ===')
  // Click first task title
  const firstTitle = page.locator('[data-testid^="task-title-"]').first()
  await firstTitle.click()
  await snap(page, 'detail-panel-open')

  // Check detail panel content
  const panel = page.locator('[data-testid="task-detail-panel"]')
  const panelVisible = await panel.isVisible({ timeout: 5000 }).catch(() => false)
  if (!panelVisible) findings.push('ACTION 2: TaskDetailPanel did not open on title click')

  // Close panel
  if (panelVisible) {
    await page.locator('[data-testid="close-detail-panel"]').click()
    await page.waitForTimeout(500)
  }

  // ========================================
  // ACTION 3: Inline status change + undo
  // ========================================
  console.log('\n=== ACTION 3: Inline status change + undo ===')
  const statusCell = page.locator('[data-testid^="task-status-"]').first()
  await statusCell.click({ force: true })
  await snap(page, 'status-dropdown')

  // Pick "In Progress"
  const inProgressOpt = page.locator('[role="option"], li, button').filter({ hasText: /In Progress/ }).first()
  if (await inProgressOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
    await inProgressOpt.click()
    await snap(page, 'status-changed')

    // Check for undo toast
    const undoToast = page.locator('[data-testid="undo-toast"]')
    const hasUndo = await undoToast.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`  Undo toast visible: ${hasUndo}`)
    if (!hasUndo) findings.push('ACTION 3: No undo toast after status change')

    // Click undo
    if (hasUndo) {
      await page.locator('[data-testid="undo-button"]').click()
      await snap(page, 'status-undone')
    }
  } else {
    await page.keyboard.press('Escape')
    findings.push('ACTION 3: In Progress option not visible in dropdown')
  }

  // ========================================
  // ACTION 4: Create an idea
  // ========================================
  console.log('\n=== ACTION 4: Create idea via N key ===')
  await page.goto(`${BASE}/ideas`, { waitUntil: 'load' })
  await snap(page, 'ideas-page')

  await page.keyboard.press('n')
  await snap(page, 'create-idea-modal', 1000)

  const ideaModal = page.locator('[role="dialog"]').first()
  const ideaModalVisible = await ideaModal.isVisible({ timeout: 3000 }).catch(() => false)
  if (ideaModalVisible) {
    const titleInput = ideaModal.locator('input[type="text"], textarea').first()
    if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await titleInput.fill('test_delete_Dogfood idea: automated testing enhancement')
      await snap(page, 'idea-filled')

      const submitBtn = ideaModal.locator('button').filter({ hasText: /Submit|Create|Save|Add/ }).first()
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click()
        await snap(page, 'idea-submitted', 2000)
      }
    }
  } else {
    findings.push('ACTION 4: N key did not open create idea modal')
  }

  // ========================================
  // ACTION 5: Create a decision
  // ========================================
  console.log('\n=== ACTION 5: Create decision ===')
  await page.goto(`${BASE}/decisions`, { waitUntil: 'load' })
  await snap(page, 'decisions-page')

  // Try Log Decision button
  const logDecBtn = page.locator('button').filter({ hasText: /Log Decision/ }).first()
  if (await logDecBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await logDecBtn.click()
    await snap(page, 'create-decision-modal', 1000)

    const decModal = page.locator('[role="dialog"]').first()
    if (await decModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const decTitle = decModal.locator('input[type="text"], textarea').first()
      if (await decTitle.isVisible({ timeout: 2000 }).catch(() => false)) {
        await decTitle.fill('test_delete_Dogfood decision: adopt automated visual testing')
        // Look for rationale field
        const rationaleField = decModal.locator('textarea').last()
        if (await rationaleField.isVisible({ timeout: 1000 }).catch(() => false)) {
          await rationaleField.fill('test_delete_Automated Playwright screenshots catch visual regressions before launch')
        }
        await snap(page, 'decision-filled')

        const decSubmit = decModal.locator('button').filter({ hasText: /Submit|Create|Save|Log/ }).last()
        if (await decSubmit.isVisible({ timeout: 2000 }).catch(() => false)) {
          await decSubmit.click()
          await snap(page, 'decision-submitted', 2000)
        }
      }
    }
  } else {
    // Try N key
    await page.keyboard.press('n')
    await snap(page, 'decision-n-key', 1000)
    findings.push('ACTION 5: Log Decision button not found, tried N key')
  }

  // ========================================
  // ACTION 6: Navigate projects → click into detail
  // ========================================
  console.log('\n=== ACTION 6: Project detail deep dive ===')
  await page.goto(`${BASE}/projects`, { waitUntil: 'load' })
  await snap(page, 'projects-page')

  // Click a real project (not first row which might be header)
  const projRow = page.locator('tr').filter({ hasText: /CLIF|R01|LPV/ }).first()
  if (await projRow.isVisible({ timeout: 5000 }).catch(() => false)) {
    await projRow.click()
    await snap(page, 'project-detail', 2000)

    // Check URL changed
    const url = page.url()
    if (!url.includes('/projects/')) {
      findings.push('ACTION 6: Project row click did not navigate to detail page')
    }

    // Check for tabs (Overview, Tasks, etc.)
    const tabs = page.locator('button, a').filter({ hasText: /Overview|Tasks|Literature|Notes/ })
    const tabCount = await tabs.count()
    console.log(`  Project detail tabs: ${tabCount}`)

    // Click Tasks tab if exists
    const tasksTab = page.locator('button, a').filter({ hasText: /Tasks/ }).first()
    if (await tasksTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tasksTab.click()
      await snap(page, 'project-tasks-tab')
    }
  }

  // ========================================
  // ACTION 7: Grants → expand detail → check timeline
  // ========================================
  console.log('\n=== ACTION 7: Grant expand + timeline ===')
  await page.goto(`${BASE}/grants`, { waitUntil: 'load' })
  await snap(page, 'grants-page')

  // Click a grant
  const grant = page.locator('[role="button"]').first()
  if (await grant.isVisible({ timeout: 3000 }).catch(() => false)) {
    await grant.click()
    await snap(page, 'grant-expanded', 1000)

    // Check status dropdown works
    const grantStatus = page.locator('select, [role="combobox"]').filter({ hasText: /Funded|Preparation|Active/ }).first()
    const hasStatus = await grantStatus.isVisible({ timeout: 2000 }).catch(() => false)
    console.log(`  Grant status dropdown visible: ${hasStatus}`)

    // Press Escape to collapse
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }

  // ========================================
  // ACTION 8: Meeting detail → toggle action item
  // ========================================
  console.log('\n=== ACTION 8: Meeting action items ===')
  await page.goto(`${BASE}/meetings`, { waitUntil: 'load' })
  await snap(page, 'meetings-page')

  // Click a meeting
  const meeting = page.locator('button, div').filter({ hasText: /Biweekly/ }).first()
  if (await meeting.isVisible({ timeout: 3000 }).catch(() => false)) {
    await meeting.click()
    await snap(page, 'meeting-detail', 2000)

    // Look for action item checkboxes
    const checkbox = page.locator('input[type="checkbox"], [role="checkbox"]').first()
    const hasCheckbox = await checkbox.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`  Action item checkbox: ${hasCheckbox}`)

    if (hasCheckbox) {
      await checkbox.click({ force: true })
      await snap(page, 'action-item-toggled')
    }
  }

  // ========================================
  // ACTION 9: Search for something
  // ========================================
  console.log('\n=== ACTION 9: Search ===')
  await page.goto(`${BASE}/search`, { waitUntil: 'load' })
  await snap(page, 'search-page')

  const searchInput = page.locator('input[type="text"], input[type="search"]').first()
  await searchInput.fill('ventilator')
  await searchInput.press('Enter')
  await snap(page, 'search-results', 2000)

  const resultCount = await page.locator('[class*="result"], a, div').filter({ hasText: /ventilator/i }).count()
  console.log(`  Search results for "ventilator": ${resultCount}`)
  if (resultCount === 0) findings.push('ACTION 9: No search results for "ventilator"')

  // ========================================
  // ACTION 10: Command palette navigation
  // ========================================
  console.log('\n=== ACTION 10: Command palette ===')
  await page.keyboard.press('Control+k')
  await snap(page, 'cmd-palette-open', 800)

  await page.keyboard.type('analytics')
  await snap(page, 'cmd-search-analytics', 500)
  await page.keyboard.press('Enter')
  await snap(page, 'navigated-analytics', 2000)

  const atAnalytics = page.url().includes('/analytics')
  console.log(`  Navigated to analytics: ${atAnalytics}`)
  if (!atAnalytics) findings.push('ACTION 10: Command palette did not navigate to analytics')

  // ========================================
  // ACTION 11: Digest page → check comment button
  // ========================================
  console.log('\n=== ACTION 11: Digest comments ===')
  await page.goto(`${BASE}/digest`, { waitUntil: 'load' })
  await snap(page, 'digest-page')

  // Find comment button (MessageCircle icon)
  const commentBtn = page.locator('button[aria-label*="comment"]').first()
  const hasCommentBtn = await commentBtn.isVisible({ timeout: 3000 }).catch(() => false)
  console.log(`  Comment button visible: ${hasCommentBtn}`)

  if (hasCommentBtn) {
    await commentBtn.click()
    await snap(page, 'digest-comment-open')

    // Type a comment
    const commentInput = page.locator('input[placeholder*="note"], input[placeholder*="comment"]').first()
    if (await commentInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await commentInput.fill('test_delete_Dogfood: testing comment flow')
      await snap(page, 'digest-comment-typed')

      // Submit
      await commentInput.press('Enter')
      // Or click send button
      const sendBtn = page.locator('button[aria-label="Submit comment"]').first()
      if (await sendBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await sendBtn.click()
      }
      await snap(page, 'digest-comment-submitted', 2000)
    }
  } else {
    findings.push('ACTION 11: No comment button found on digest papers')
  }

  // ========================================
  // ACTION 12: Calendar page
  // ========================================
  console.log('\n=== ACTION 12: Calendar ===')
  await page.goto(`${BASE}/calendar`, { waitUntil: 'load' })
  await snap(page, 'calendar-page')

  // Click prev/next month
  const prevBtn = page.locator('button').filter({ hasText: /←|</ }).first()
  if (await prevBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await prevBtn.click()
    await snap(page, 'calendar-prev-month')
    // Go back
    const nextBtn = page.locator('button').filter({ hasText: /→|>/ }).first()
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextBtn.click()
      await snap(page, 'calendar-next-month')
    }
  }

  // ========================================
  // REPORT FINDINGS
  // ========================================
  console.log('\n\n========================================')
  console.log(`DOGFOOD SESSION COMPLETE: ${stepNum} screenshots`)
  console.log(`FINDINGS: ${findings.length}`)
  for (const f of findings) {
    console.log(`  - ${f}`)
  }
  console.log('========================================')

  // Save findings to file
  writeFileSync(`${OUT}/findings.txt`, findings.join('\n') + '\n')

  await browser.close()
}

main().catch(console.error)
